"""Thread-safe Kaggle API authentication helper."""

from contextlib import contextmanager
import os
import threading
from typing import Iterator

_KAGGLE_AUTH_LOCK = threading.Lock()


@contextmanager
def kaggle_authenticated_api(username: str, raw_key: str) -> Iterator[object]:
    """
    Serialize KaggleApi credential setup and authentication under a process-wide lock.

    Prevents concurrent multi-account dispatches or dataset probes from mutating
    process-global `KAGGLE_USERNAME` / `KAGGLE_KEY` / `KAGGLE_API_TOKEN` out from
    under each other.
    """
    from kaggle.api.kaggle_api_extended import KaggleApi

    with _KAGGLE_AUTH_LOCK:
        prev_username = os.environ.get("KAGGLE_USERNAME")
        prev_key = os.environ.get("KAGGLE_KEY")
        prev_token = os.environ.get("KAGGLE_API_TOKEN")
        try:
            os.environ["KAGGLE_USERNAME"] = username
            if raw_key.startswith("KGAT_"):
                os.environ["KAGGLE_API_TOKEN"] = raw_key
                os.environ.pop("KAGGLE_KEY", None)
            else:
                os.environ["KAGGLE_KEY"] = raw_key
                os.environ.pop("KAGGLE_API_TOKEN", None)

            api = KaggleApi()
            api.authenticate()
            yield api
        finally:
            if prev_username is None:
                os.environ.pop("KAGGLE_USERNAME", None)
            else:
                os.environ["KAGGLE_USERNAME"] = prev_username
            if prev_key is None:
                os.environ.pop("KAGGLE_KEY", None)
            else:
                os.environ["KAGGLE_KEY"] = prev_key
            if prev_token is None:
                os.environ.pop("KAGGLE_API_TOKEN", None)
            else:
                os.environ["KAGGLE_API_TOKEN"] = prev_token
