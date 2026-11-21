"""Shared asynchronous HTTP client with connection pooling and HTTP keep-alive.

Eliminates TCP and TLS handshake overhead across sequential external calls
(Kaggle API, Telegram bot dispatch, remote audio chunk downloads).
"""

from typing import Any
import httpx
from novelova_core.logging import setup_logger

logger = setup_logger("novelova.http")

_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return the shared httpx.AsyncClient instance, creating it if needed."""
    global _client
    if _client is None or _client.is_closed:
        limits = httpx.Limits(
            max_keepalive_connections=20,
            max_connections=50,
            keepalive_expiry=60.0,
        )
        timeout = httpx.Timeout(
            connect=10.0,
            read=60.0,
            write=60.0,
            pool=10.0,
        )
        _client = httpx.AsyncClient(
            limits=limits,
            timeout=timeout,
            follow_redirects=True,
        )
        logger.debug("Initialized shared httpx.AsyncClient connection pool")
    return _client


async def close_http_client() -> None:
    """Close the shared httpx.AsyncClient connection pool during application shutdown."""
    global _client
    if _client is not None and not _client.is_closed:
        try:
            await _client.aclose()
            logger.debug("Closed shared httpx.AsyncClient connection pool")
        except Exception as exc:
            logger.warning("Error closing shared httpx client: %s", exc)
        finally:
            _client = None
