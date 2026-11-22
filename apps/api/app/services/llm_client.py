import asyncio
import json
import re
from typing import Any, TypeVar

import httpx
from app.core.config import settings
from novelova_core.exceptions import AppError
from novelova_core.logging import setup_logger
from pydantic import BaseModel, ValidationError

logger = setup_logger("novelova.llm_client")

T = TypeVar("T", bound=BaseModel)


class LLMClientError(AppError):
    """Structured error for OpenAI-compatible LLM calls across providers."""

    def __init__(
        self,
        message: str,
        error_type: str = "api_error",
        status_code: int = 502,
    ):
        super().__init__(
            message=message,
            code=error_type.upper(),
            status_code=status_code,
        )
        self.error_type = error_type


class StructuredLLMClient:
    """
    Shared OpenAI-compatible structured JSON LLM client built on hardened httpx + Pydantic v2.
    Works across ModelArts MaaS (deepseek-v4.1-flash-1017), DeepSeek, Gemini OpenAI-compat, etc.
    Provides automatic Pydantic validation and self-correction retries without external SDK bloat.
    """

    @staticmethod
    def resolve_chat_completions_url(base_url: str) -> str:
        cleaned = (base_url or "").strip().rstrip("/")
        if cleaned.endswith("/chat/completions"):
            return cleaned
        return f"{cleaned}/chat/completions"

    @staticmethod
    def resolve_model_name(base_url: str, model_name: str) -> str:
        if "googleapis.com" in (base_url or "") and not model_name.startswith("models/"):
            return f"models/{model_name}"
        return model_name

    @staticmethod
    def strip_markdown_json_fences(raw_content: Any) -> str:
        if not isinstance(raw_content, str):
            return ""
        text = raw_content.strip()
        if not text:
            return ""
        fenced = re.match(r"^```(?:json|JSON)?\s*\n?(.*?)\n?\s*```$", text, re.DOTALL)
        if fenced:
            return fenced.group(1).strip()
        return text

    @staticmethod
    def parse_json_payload(content: str) -> Any:
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            start_obj = content.find("{")
            end_obj = content.rfind("}")
            if start_obj != -1 and end_obj > start_obj:
                try:
                    return json.loads(content[start_obj : end_obj + 1])
                except json.JSONDecodeError:
                    pass
            raise

    @staticmethod
    def normalize_usage(raw_usage: dict[str, Any] | None) -> dict[str, int]:
        usage = raw_usage or {}
        prompt_tokens = int(usage.get("prompt_tokens") or 0)
        completion_tokens = int(usage.get("completion_tokens") or 0)
        total_tokens = int(usage.get("total_tokens") or (prompt_tokens + completion_tokens))
        cached_tokens = usage.get("prompt_cache_hit_tokens")
        if cached_tokens is None:
            details = usage.get("prompt_tokens_details") or {}
            cached_tokens = details.get("cached_tokens", 0) if isinstance(details, dict) else 0
        cached_tokens = int(cached_tokens or 0)
        reasoning_details = usage.get("completion_tokens_details") or {}
        reasoning_tokens = int(
            reasoning_details.get("reasoning_tokens", 0)
            if isinstance(reasoning_details, dict)
            else 0
        )
        return {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "cached_tokens": cached_tokens,
            "reasoning_tokens": reasoning_tokens,
        }

    @classmethod
    async def complete_json(
        cls,
        *,
        system_prompt: str,
        user_payload: dict[str, Any] | str,
        response_model: type[T],
        temperature: float = 0.1,
        max_tokens: int | None = None,
        timeout_seconds: float | None = None,
        max_network_attempts: int = 4,
        max_validation_retries: int = 2,
    ) -> tuple[T, dict[str, int]]:
        """
        Execute an OpenAI-compatible JSON completion and validate against `response_model`.
        If Pydantic validation fails, appends a concise self-correction turn and retries.
        """
        if not settings.DEEPSEEK_API_KEY:
            raise LLMClientError(
                "LLM API key (DEEPSEEK_API_KEY) is not configured.",
                error_type="missing_api_key",
                status_code=400,
            )

        schema_json = json.dumps(response_model.model_json_schema(), ensure_ascii=False)
        full_system_prompt = (
            f"{system_prompt.strip()}\n\n"
            "Return strictly valid JSON only matching this JSON Schema (no markdown fences, no commentary):\n"
            f"{schema_json}"
        )
        user_text = (
            user_payload
            if isinstance(user_payload, str)
            else json.dumps(user_payload, ensure_ascii=False)
        )

        messages: list[dict[str, str]] = [
            {"role": "system", "content": full_system_prompt},
            {"role": "user", "content": user_text},
        ]

        headers = {
            "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
        }
        endpoint_url = cls.resolve_chat_completions_url(settings.DEEPSEEK_BASE_URL)
        model_name = cls.resolve_model_name(settings.DEEPSEEK_BASE_URL, settings.DEEPSEEK_MODEL)
        effective_timeout = timeout_seconds or settings.DEEPSEEK_TIMEOUT_SECONDS
        effective_max_tokens = max_tokens or settings.DEEPSEEK_MAX_TOKENS

        total_usage = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "cached_tokens": 0,
            "reasoning_tokens": 0,
        }

        last_validation_error: str | None = None

        for val_attempt in range(max_validation_retries + 1):
            raw_content, usage = await cls._post_chat_completion(
                endpoint_url=endpoint_url,
                headers=headers,
                model_name=model_name,
                messages=messages,
                temperature=temperature,
                max_tokens=effective_max_tokens,
                timeout_seconds=effective_timeout,
                max_attempts=max_network_attempts,
            )
            for k in total_usage:
                total_usage[k] += usage.get(k, 0)

            cleaned = cls.strip_markdown_json_fences(raw_content)
            try:
                parsed = cls.parse_json_payload(cleaned)
                validated = response_model.model_validate(parsed)
                return validated, total_usage
            except (json.JSONDecodeError, ValidationError) as exc:
                last_validation_error = str(exc)
                logger.warning(
                    "StructuredLLMClient validation failed for %s (attempt %d/%d): %s",
                    response_model.__name__,
                    val_attempt + 1,
                    max_validation_retries + 1,
                    last_validation_error[:300],
                )
                if val_attempt < max_validation_retries:
                    messages.append({"role": "assistant", "content": cleaned[:4000] or "{}"})
                    messages.append(
                        {
                            "role": "user",
                            "content": (
                                "Your previous JSON response failed schema validation with the following error:\n"
                                f"{last_validation_error[:1200]}\n\n"
                                "Please fix the issues and return strictly valid JSON matching the schema."
                            ),
                        }
                    )
                    continue

        raise LLMClientError(
            f"LLM output failed {response_model.__name__} validation after {max_validation_retries + 1} attempts: {last_validation_error}",
            error_type="validation_error",
            status_code=502,
        )

    @classmethod
    async def _post_chat_completion(
        cls,
        *,
        endpoint_url: str,
        headers: dict[str, str],
        model_name: str,
        messages: list[dict[str, str]],
        temperature: float,
        max_tokens: int,
        timeout_seconds: float,
        max_attempts: int,
    ) -> tuple[str, dict[str, int]]:
        request_body = {
            "model": model_name,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"},
        }

        backoff = 3.0
        for attempt in range(1, max_attempts + 1):
            try:
                async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                    resp = await client.post(endpoint_url, json=request_body, headers=headers)

                    if resp.status_code == 401:
                        raise LLMClientError(
                            "LLM API authentication failed (HTTP 401): invalid or expired API key.",
                            error_type="auth_error",
                            status_code=401,
                        )
                    if resp.status_code == 402:
                        raise LLMClientError(
                            "LLM account has insufficient balance / quota exhausted (HTTP 402).",
                            error_type="quota_error",
                            status_code=402,
                        )
                    if resp.status_code == 429 or resp.status_code >= 500:
                        if attempt < max_attempts:
                            retry_after = resp.headers.get("Retry-After")
                            wait_s = (
                                max(float(retry_after.strip()), 10.0)
                                if retry_after and retry_after.strip().isdigit()
                                else min(backoff, 60.0)
                            )
                            logger.warning(
                                "LLM API HTTP %d; retrying in %.1fs (attempt %d/%d)...",
                                resp.status_code,
                                wait_s,
                                attempt,
                                max_attempts,
                            )
                            await asyncio.sleep(wait_s)
                            backoff = min(backoff * 2, 60.0)
                            continue
                        raise LLMClientError(
                            f"LLM API failed with HTTP {resp.status_code} after {max_attempts} attempts.",
                            error_type="rate_limit" if resp.status_code == 429 else "server_error",
                            status_code=502,
                        )

                    resp.raise_for_status()
                    data = resp.json()
                    choice = (data.get("choices") or [{}])[0]
                    message = choice.get("message") or {}
                    raw_content = message.get("content")
                    usage = cls.normalize_usage(data.get("usage"))

                    if not isinstance(raw_content, str) or not raw_content.strip():
                        if attempt < max_attempts:
                            logger.warning(
                                "LLM returned empty content (finish_reason=%s); retrying (attempt %d/%d)...",
                                choice.get("finish_reason"),
                                attempt,
                                max_attempts,
                            )
                            await asyncio.sleep(backoff)
                            backoff = min(backoff * 2, 30.0)
                            continue
                        raise LLMClientError(
                            f"LLM returned empty content (finish_reason={choice.get('finish_reason')}).",
                            error_type="malformed_response",
                            status_code=502,
                        )
                    return raw_content, usage

            except httpx.TimeoutException as exc:
                if attempt < max_attempts:
                    await asyncio.sleep(min(backoff, 30.0))
                    backoff = min(backoff * 2, 30.0)
                    continue
                raise LLMClientError(
                    f"LLM API request timed out after {max_attempts} attempts (timeout={timeout_seconds:.0f}s).",
                    error_type="timeout",
                    status_code=504,
                ) from exc
            except httpx.NetworkError as exc:
                if attempt < max_attempts:
                    await asyncio.sleep(2.0)
                    continue
                raise LLMClientError(
                    f"Failed to reach LLM API: {exc}",
                    error_type="network_error",
                    status_code=502,
                ) from exc

        raise LLMClientError("Unexpected LLM API failure after retries", error_type="unknown_error")
