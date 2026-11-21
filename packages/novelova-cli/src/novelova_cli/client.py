from typing import Any
import httpx
from novelova_cli.config import get_api_url, get_effective_token


class NovelovaCliError(Exception):
    def __init__(self, message: str, status_code: int = 500, details: Any = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details


class NovelovaClient:
    def __init__(self, base_url: str | None = None, token: str | None = None):
        self.base_url = (base_url or get_api_url()).rstrip("/")
        self.token = token or get_effective_token()

    def _get_headers(self) -> dict[str, str]:
        headers: dict[str, str] = {
            "Accept": "application/json",
            "User-Agent": "Novelova-CLI/0.1.0",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
            if self.token.startswith("nv_live_"):
                headers["X-API-Key"] = self.token
        return headers

    def request(
        self,
        method: str,
        path: str,
        params: dict[str, Any] | None = None,
        json_data: Any = None,
        data: Any = None,
        files: Any = None,
        timeout: float = 60.0,
    ) -> Any:
        url = f"{self.base_url}{path}" if path.startswith("/") else f"{self.base_url}/{path}"
        headers = self._get_headers()
        try:
            with httpx.Client(timeout=timeout) as client:
                resp = client.request(
                    method=method,
                    url=url,
                    headers=headers,
                    params=params,
                    json=json_data,
                    data=data,
                    files=files,
                )
        except httpx.ConnectError as exc:
            raise NovelovaCliError(
                f"Failed to connect to backend server at {self.base_url}. Is the server running? Details: {exc}",
                status_code=503,
            ) from exc
        except httpx.TimeoutException as exc:
            raise NovelovaCliError(
                f"Request timed out after {timeout} seconds.",
                status_code=504,
            ) from exc
        except Exception as exc:
            raise NovelovaCliError(f"HTTP request failed: {exc}", status_code=500) from exc

        # Handle HTTP error codes
        if resp.status_code >= 400:
            try:
                err_body = resp.json()
                msg = (
                    err_body.get("detail")
                    or err_body.get("message")
                    or (err_body.get("error", {}).get("message") if isinstance(err_body.get("error"), dict) else None)
                    or resp.text
                )
            except Exception:
                msg = resp.text or f"HTTP {resp.status_code}"
            raise NovelovaCliError(msg, status_code=resp.status_code)

        try:
            body = resp.json()
            if isinstance(body, dict) and "data" in body:
                return body["data"]
            return body
        except Exception:
            return resp.text

    def get(self, path: str, params: dict[str, Any] | None = None, timeout: float = 60.0) -> Any:
        return self.request("GET", path, params=params, timeout=timeout)

    def post(self, path: str, json_data: Any = None, files: Any = None, data: Any = None, timeout: float = 60.0) -> Any:
        return self.request("POST", path, json_data=json_data, files=files, data=data, timeout=timeout)

    def put(self, path: str, json_data: Any = None, timeout: float = 60.0) -> Any:
        return self.request("PUT", path, json_data=json_data, timeout=timeout)

    def patch(self, path: str, json_data: Any = None, timeout: float = 60.0) -> Any:
        return self.request("PATCH", path, json_data=json_data, timeout=timeout)

    def delete(self, path: str, timeout: float = 60.0) -> Any:
        return self.request("DELETE", path, timeout=timeout)
