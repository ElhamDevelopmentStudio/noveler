import asyncio
import hashlib
import io
import re
import time
from typing import Any

from app.core.config import settings
from novelova_core.logging import setup_logger

logger = setup_logger("novelova.gdrive_vault")

try:
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload
    GDRIVE_LIBS_AVAILABLE = True
except ImportError:
    GDRIVE_LIBS_AVAILABLE = False
    logger.warning("google-api-python-client or google-auth-oauthlib not installed")


def sanitize_folder_name(name: str) -> str:
    """Sanitize project title for folder names in Google Drive."""
    clean = re.sub(r'[\/\\:\*\?"<>\|]', "_", name).strip()
    return clean or "Untitled Project"


class TokenBucketRateLimiter:
    """Async token-bucket rate limiter to prevent Google Drive API burst 403 rate limit errors."""

    def __init__(self, rate: float = 3.0, capacity: float = 5.0):
        self.rate = rate  # tokens added per second
        self.capacity = capacity
        self.tokens = capacity
        self.last_update = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self.last_update
            self.last_update = now
            self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
            if self.tokens < 1.0:
                wait_time = (1.0 - self.tokens) / self.rate
                await asyncio.sleep(wait_time)
                self.tokens = 0.0
            else:
                self.tokens -= 1.0


class GoogleDriveVaultService:
    _service: Any = None
    _folder_cache: dict[str, str] = {}
    _rate_limiter = TokenBucketRateLimiter(rate=3.0, capacity=3.0)
    _concurrency_semaphore: asyncio.Semaphore | None = None

    @classmethod
    def _get_semaphore(cls) -> asyncio.Semaphore:
        if cls._concurrency_semaphore is None:
            cls._concurrency_semaphore = asyncio.Semaphore(3)
        return cls._concurrency_semaphore

    @classmethod
    def is_available(cls) -> bool:
        """Check whether Google Drive integration is fully configured and ready."""
        return GDRIVE_LIBS_AVAILABLE and settings.is_gdrive_configured

    @classmethod
    def _get_service(cls):
        """Build or retrieve authenticated Google Drive API service resource."""
        if not cls.is_available():
            raise RuntimeError("Google Drive vault is not configured or enabled in settings")

        if cls._service is None:
            creds = Credentials(
                None,
                refresh_token=settings.GDRIVE_REFRESH_TOKEN,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=settings.GDRIVE_CLIENT_ID,
                client_secret=settings.GDRIVE_CLIENT_SECRET,
            )
            cls._service = build("drive", "v3", credentials=creds, cache_discovery=False)
            logger.info("Initialized Google Drive Vault API client for root folder: %s", settings.GDRIVE_ROOT_FOLDER_ID)

        return cls._service

    # ==========================================
    # Synchronous Worker Methods (Run in Thread)
    # ==========================================

    @classmethod
    def _sync_get_or_create_project_folder(cls, project_title: str) -> str:
        """Ensure a subfolder for the project exists in Google Drive under GDRIVE_ROOT_FOLDER_ID."""
        service = cls._get_service()
        clean_name = sanitize_folder_name(project_title)
        root_id = settings.GDRIVE_ROOT_FOLDER_ID

        cache_key = f"{root_id}:{clean_name}"
        if cache_key in cls._folder_cache:
            return cls._folder_cache[cache_key]

        # Search for existing folder
        safe_q_name = clean_name.replace("'", "\\'")
        query = (
            f"mimeType = 'application/vnd.google-apps.folder' and "
            f"name = '{safe_q_name}' and "
            f"'{root_id}' in parents and "
            f"trashed = false"
        )
        resp = service.files().list(q=query, spaces="drive", fields="files(id, name)").execute()
        files = resp.get("files", [])
        if files:
            folder_id = files[0]["id"]
            cls._folder_cache[cache_key] = folder_id
            return folder_id

        # Create new project folder
        metadata = {
            "name": clean_name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [root_id],
        }
        folder = service.files().create(body=metadata, fields="id").execute()
        folder_id = folder["id"]
        logger.info("Created Google Drive project subfolder '%s' (ID: %s)", clean_name, folder_id)
        cls._folder_cache[cache_key] = folder_id
        return folder_id

    @classmethod
    def _sync_upload_chapter_audio(
        cls,
        file_bytes: bytes,
        filename: str,
        project_title: str,
        mime_type: str = "audio/wav",
    ) -> dict[str, Any]:
        """Upload audio bytes to Google Drive project folder."""
        service = cls._get_service()
        folder_id = cls._sync_get_or_create_project_folder(project_title)

        metadata = {
            "name": filename,
            "parents": [folder_id],
        }
        media = MediaIoBaseUpload(
            io.BytesIO(file_bytes),
            mimetype=mime_type,
            resumable=True,
            chunksize=2 * 1024 * 1024,
        )
        request = service.files().create(
            body=metadata,
            media_body=media,
            fields="id, name, size, mimeType, md5Checksum",
        )
        response = None
        while response is None:
            status, response = request.next_chunk()
            if status:
                logger.info(
                    "Google Drive upload progress for '%s': %d%%",
                    filename,
                    int(status.progress() * 100),
                )
        created = response

        logger.info(
            "Uploaded audio '%s' (%d bytes) to Google Drive (ID: %s)",
            filename,
            len(file_bytes),
            created.get("id"),
        )
        return created

    @classmethod
    def _sync_get_file_metadata(cls, file_id: str) -> dict[str, Any]:
        """Retrieve file size, name, and mime type from Google Drive."""
        service = cls._get_service()
        metadata = service.files().get(
            fileId=file_id,
            fields="id, name, size, mimeType, md5Checksum",
        ).execute()
        if "size" in metadata:
            metadata["size"] = int(metadata["size"])
        return metadata

    @classmethod
    def _sync_stream_file_chunk(cls, file_id: str, start_byte: int, end_byte: int) -> bytes:
        """Fetch a specific byte range chunk from Google Drive using Range header."""
        service = cls._get_service()
        request = service.files().get_media(fileId=file_id)
        request.headers["Range"] = f"bytes={start_byte}-{end_byte}"
        return request.execute()

    @classmethod
    def _sync_download_file_bytes(cls, file_id: str) -> bytes:
        """Download entire file bytes from Google Drive."""
        service = cls._get_service()
        request = service.files().get_media(fileId=file_id)
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, request, chunksize=2 * 1024 * 1024)
        done = False
        while not done:
            status, done = downloader.next_chunk()
            if status:
                logger.info("Google Drive download progress for %s: %d%%", file_id, int(status.progress() * 100))
        return fh.getvalue()

    @classmethod
    def _sync_delete_file(cls, file_id: str) -> bool:
        """Delete a file from Google Drive."""
        try:
            service = cls._get_service()
            service.files().delete(fileId=file_id).execute()
            logger.info("Deleted Google Drive file ID: %s", file_id)
            return True
        except Exception as exc:
            logger.warning("Failed to delete Google Drive file %s: %s", file_id, exc)
            return False

    # ==========================================
    # Asynchronous Non-Blocking Public API
    # ==========================================

    @classmethod
    async def get_or_create_project_folder(cls, project_title: str) -> str:
        return await asyncio.to_thread(cls._sync_get_or_create_project_folder, project_title)

    @classmethod
    async def upload_and_verify_chapter_audio(
        cls,
        file_bytes: bytes,
        filename: str,
        project_title: str,
        mime_type: str = "audio/wav",
        max_retries: int = 3,
    ) -> dict[str, Any]:
        """
        Upload audio bytes to Google Drive with token-bucket rate limiting,
        exponential backoff retry, and exact byte size & MD5 checksum verification.
        """
        if not file_bytes:
            raise ValueError("Cannot upload empty audio bytes to Google Drive")

        expected_size = len(file_bytes)
        expected_md5 = hashlib.md5(file_bytes).hexdigest().lower()
        semaphore = cls._get_semaphore()

        last_error: Exception | None = None
        for attempt in range(1, max_retries + 1):
            async with semaphore:
                await cls._rate_limiter.acquire()
                try:
                    logger.info(
                        "Google Drive upload attempt %d/%d for '%s' (expected: %d bytes, MD5: %s)",
                        attempt,
                        max_retries,
                        filename,
                        expected_size,
                        expected_md5,
                    )
                    created = await asyncio.to_thread(
                        cls._sync_upload_chapter_audio,
                        file_bytes,
                        filename,
                        project_title,
                        mime_type,
                    )
                    file_id = created.get("id")
                    if not file_id:
                        raise RuntimeError(f"Google Drive did not return a valid file ID for {filename}")

                    # Verify exact byte size
                    actual_size = int(created.get("size") or 0)
                    if actual_size != expected_size:
                        logger.warning(
                            "Google Drive file size mismatch for %s (ID: %s): expected %d, got %d. Deleting corrupt upload.",
                            filename,
                            file_id,
                            expected_size,
                            actual_size,
                        )
                        await cls.delete_file(file_id)
                        raise ValueError(f"Uploaded file size {actual_size} != expected {expected_size}")

                    # Verify MD5 checksum if provided by Google Drive
                    actual_md5 = (created.get("md5Checksum") or "").lower()
                    if actual_md5 and actual_md5 != expected_md5:
                        logger.warning(
                            "Google Drive MD5 checksum mismatch for %s (ID: %s): expected %s, got %s. Deleting corrupt upload.",
                            filename,
                            file_id,
                            expected_md5,
                            actual_md5,
                        )
                        await cls.delete_file(file_id)
                        raise ValueError(f"Uploaded file MD5 {actual_md5} != expected {expected_md5}")

                    logger.info(
                        "Google Drive upload verified for '%s' (ID: %s, size: %d bytes, MD5: %s)",
                        filename,
                        file_id,
                        actual_size,
                        actual_md5 or "matched",
                    )
                    created["verified"] = True
                    created["expected_md5"] = expected_md5
                    return created

                except Exception as exc:
                    last_error = exc
                    logger.warning(
                        "Google Drive upload attempt %d/%d failed for '%s': %s",
                        attempt,
                        max_retries,
                        filename,
                        exc,
                    )
                    if attempt < max_retries:
                        backoff = 2 ** (attempt - 1)
                        logger.info("Retrying Google Drive upload in %d seconds...", backoff)
                        await asyncio.sleep(backoff)

        raise RuntimeError(f"Google Drive upload and verification failed after {max_retries} attempts: {last_error}")

    @classmethod
    async def upload_chapter_audio(
        cls,
        file_bytes: bytes,
        filename: str,
        project_title: str,
        mime_type: str = "audio/wav",
    ) -> dict[str, Any]:
        return await asyncio.to_thread(
            cls._sync_upload_chapter_audio,
            file_bytes,
            filename,
            project_title,
            mime_type,
        )

    @classmethod
    async def get_file_metadata(cls, file_id: str) -> dict[str, Any]:
        return await asyncio.to_thread(cls._sync_get_file_metadata, file_id)

    @classmethod
    async def stream_file_chunk(cls, file_id: str, start_byte: int, end_byte: int) -> bytes:
        return await asyncio.to_thread(cls._sync_stream_file_chunk, file_id, start_byte, end_byte)

    @classmethod
    async def download_file_bytes(cls, file_id: str) -> bytes:
        return await asyncio.to_thread(cls._sync_download_file_bytes, file_id)

    @classmethod
    async def delete_file(cls, file_id: str) -> bool:
        return await asyncio.to_thread(cls._sync_delete_file, file_id)
