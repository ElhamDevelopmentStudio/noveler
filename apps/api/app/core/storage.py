import time
from typing import Any
from urllib.parse import urlparse

import boto3
import botocore.config
from app.core.config import settings
from novelova_core.logging import setup_logger

logger = setup_logger("novelova.storage")

_s3_client: Any = None
_PRESIGNED_CACHE: dict[str, tuple[str, float]] = {}


def get_s3_client():
    """Retrieve or initialize the singleton S3/R2 boto3 client."""
    global _s3_client
    if _s3_client is None and settings.is_r2_configured:
        logger.info(
            "Initializing S3/R2 client for bucket: %s on endpoint: %s",
            settings.R2_BUCKET,
            settings.r2_effective_endpoint,
        )
        _s3_client = boto3.client(
            "s3",
            endpoint_url=settings.r2_effective_endpoint,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name=settings.R2_REGION or "auto",
            config=botocore.config.Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
                connect_timeout=60,
                read_timeout=900,
                retries={"max_attempts": 5},
            ),
        )
    return _s3_client


def get_cached_presigned_url(
    url_or_key: str | None,
    expires_in: int = 86400,
    bucket: str | None = None,
) -> str | None:
    """
    Generate or return a cached presigned GET URL for an R2 key or raw S3 URL.
    Caches presigned URLs in-memory with a safe TTL (e.g. 12 hours for 24h expiration)
    to eliminate redundant HMAC-SHA256 SigV4 calculations.
    """
    if not url_or_key:
        return None
    if "X-Amz-Signature=" in url_or_key or "Signature=" in url_or_key:
        return url_or_key

    target_bucket = bucket or settings.R2_BUCKET
    key = url_or_key
    if f"/{target_bucket}/" in key:
        key = key.split(f"/{target_bucket}/", 1)[-1]
    elif "://" in key:
        path = urlparse(key).path.lstrip("/")
        if path.startswith(f"{target_bucket}/"):
            key = path[len(target_bucket) + 1 :]
        else:
            key = path

    now = time.time()
    cache_key = f"{target_bucket}:{key}"
    cached = _PRESIGNED_CACHE.get(cache_key)
    if cached and now < cached[1]:
        return cached[0]

    s3 = get_s3_client()
    if s3 and settings.is_r2_configured:
        try:
            url = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": target_bucket, "Key": key},
                ExpiresIn=expires_in,
            )
            # Store in cache with safe TTL (half the expiration time, min 300s)
            ttl = now + max(300.0, float(expires_in // 2))
            _PRESIGNED_CACHE[cache_key] = (url, ttl)

            # Evict expired keys if cache grows large, and cap total size to prevent unbounded growth
            if len(_PRESIGNED_CACHE) > 5000:
                expired_keys = [k for k, v in _PRESIGNED_CACHE.items() if v[1] <= now]
                for k in expired_keys:
                    _PRESIGNED_CACHE.pop(k, None)
                if len(_PRESIGNED_CACHE) > 5000:
                    for old_k in list(_PRESIGNED_CACHE.keys())[:1000]:
                        _PRESIGNED_CACHE.pop(old_k, None)

            return url
        except Exception as exc:
            logger.warning("Could not generate presigned URL for %s: %s", key, exc)

    return url_or_key


def download_r2_object_bytes(
    key: str,
    bucket: str | None = None,
    chunk_size: int = 2 * 1024 * 1024,
    max_workers: int = 6,
) -> bytes:
    """
    Download an object from R2 using concurrent byte-range requests.
    Prevents single-connection socket stalls on large files across high-latency networks.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    s3 = get_s3_client()
    target_bucket = bucket or settings.R2_BUCKET

    head = s3.head_object(Bucket=target_bucket, Key=key)
    total_size = head["ContentLength"]

    # For small files (<= 1MB), do a single direct GET
    if total_size <= 1024 * 1024:
        resp = s3.get_object(Bucket=target_bucket, Key=key)
        return resp["Body"].read()

    ranges = []
    for start in range(0, total_size, chunk_size):
        end = min(start + chunk_size - 1, total_size - 1)
        ranges.append((start, end))

    logger.info(
        "Downloading %s (%d bytes) in %d chunks (chunk_size=%d, workers=%d)...",
        key,
        total_size,
        len(ranges),
        chunk_size,
        max_workers,
    )

    def fetch_chunk(start: int, end: int) -> tuple[int, bytes]:
        for attempt in range(4):
            try:
                resp = s3.get_object(Bucket=target_bucket, Key=key, Range=f"bytes={start}-{end}")
                return start, resp["Body"].read()
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(0.5 * (2 ** attempt))
        raise RuntimeError(f"Failed to fetch chunk {start}-{end}")

    chunks: dict[int, bytes] = {}
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(fetch_chunk, s, e) for s, e in ranges]
        completed = 0
        for f in as_completed(futures):
            s, data = f.result()
            chunks[s] = data
            completed += 1
            if completed % max(1, len(ranges) // 5) == 0 or completed == len(ranges):
                pct = int((completed / len(ranges)) * 100)
                logger.info("R2 chunk download progress for %s: %d%% (%d/%d)", key, pct, completed, len(ranges))

    return b"".join(chunks[s] for s, _ in sorted(ranges))

