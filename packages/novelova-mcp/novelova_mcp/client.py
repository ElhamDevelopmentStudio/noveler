"""Novelova HTTP API Client for MCP Server.

Provides resilient, authenticated async HTTP communication with Novelova backend services.
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from novelova_core.logging import setup_logger

logger = setup_logger("novelova.mcp.client")

DEFAULT_API_URL = "http://127.0.0.1:8000/api/v1"
DEFAULT_EMAIL = "elhamullah.hossaini@gmail.com"
DEFAULT_PASSWORD = "Admin123!"


class NovelovaClient:
    """Async API client connecting the MCP server to the Novelova FastAPI backend."""

    def __init__(
        self,
        base_url: str | None = None,
        token: str | None = None,
        email: str | None = None,
        password: str | None = None,
        timeout: float = 60.0,
    ) -> None:
        self.base_url = (base_url or os.getenv("NOVELOVA_API_URL", DEFAULT_API_URL)).rstrip("/")
        self.token = token or os.getenv("NOVELOVA_API_TOKEN")
        self.email = email or os.getenv("NOVELOVA_EMAIL", DEFAULT_EMAIL)
        self.password = password or os.getenv("NOVELOVA_PASSWORD", DEFAULT_PASSWORD)
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def get_http_client(self) -> httpx.AsyncClient:
        """Provide or create persistent async HTTP client session."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(self.timeout, connect=10.0),
                headers={"Accept": "application/json"},
            )
        return self._client

    async def close(self) -> None:
        """Close underlying HTTP client connections."""
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def authenticate(self) -> str:
        """Acquire a fresh JWT bearer token using credentials."""
        if self.token:
            return self.token

        client = await self.get_http_client()
        login_url = f"{self.base_url}/auth/login"
        payload = {"email": self.email, "password": self.password}
        try:
            resp = await client.post(login_url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                token_data = data.get("data", {})
                self.token = token_data.get("access_token")
                logger.info("Novelova MCP client successfully authenticated as %s", self.email)
                return self.token or ""
            error_detail = resp.text
            logger.error("Authentication failed (HTTP %d): %s", resp.status_code, error_detail)
            raise RuntimeError(f"Authentication failed with status {resp.status_code}: {error_detail}")
        except httpx.RequestError as exc:
            logger.error("Could not reach Novelova API at %s: %s", login_url, exc)
            raise ConnectionError(
                f"Failed to connect to Novelova backend at {self.base_url}. "
                "Ensure Novelova API is running (`docker compose up` or `uv run uvicorn app.main:app`)."
            ) from exc

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json_data: Any | None = None,
        params: dict[str, Any] | None = None,
        retry_auth: bool = True,
    ) -> Any:
        """Execute authenticated request with automatic token refresh on 401."""
        client = await self.get_http_client()
        if not self.token:
            await self.authenticate()

        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        clean_path = path if path.startswith("/") else f"/{path}"

        try:
            resp = await client.request(
                method=method,
                url=clean_path,
                json=json_data,
                params=params,
                headers=headers,
            )
        except httpx.RequestError as exc:
            raise ConnectionError(
                f"Network request to {self.base_url}{clean_path} failed: {exc}"
            ) from exc

        if resp.status_code == 401 and retry_auth:
            logger.info("Received 401 Unauthorized; attempting token refresh...")
            self.token = None
            await self.authenticate()
            return await self._request(method, path, json_data=json_data, params=params, retry_auth=False)

        if resp.status_code >= 400:
            error_data = None
            try:
                error_data = resp.json()
            except Exception:
                error_data = resp.text
            raise RuntimeError(f"API Error (HTTP {resp.status_code}) on {method} {path}: {error_data}")

        data = resp.json()
        if isinstance(data, dict) and "data" in data:
            return data["data"]
        return data

    # -------------------------------------------------------------------------
    # Health & Diagnostics
    # -------------------------------------------------------------------------
    async def get_health(self) -> dict[str, Any]:
        """Check system health of Novelova backend service."""
        client = await self.get_http_client()
        resp = await client.get("/health")
        return resp.json()

    # -------------------------------------------------------------------------
    # Projects & Manuscripts
    # -------------------------------------------------------------------------
    async def list_projects(self) -> list[dict[str, Any]]:
        """List all novel projects."""
        return await self._request("GET", "/projects")

    async def get_project(self, project_id: str) -> dict[str, Any]:
        """Fetch novel project details by ID."""
        return await self._request("GET", f"/projects/{project_id}")

    async def create_project(
        self,
        title: str,
        description: str | None = None,
        narrative_pov: str = "third_person_limited",
        protagonist_character_id: str | None = None,
    ) -> dict[str, Any]:
        """Create a new novel audio project."""
        payload = {
            "title": title,
            "description": description or "",
            "narrative_pov": narrative_pov,
            "protagonist_character_id": protagonist_character_id,
        }
        return await self._request("POST", "/projects", json_data=payload)

    # -------------------------------------------------------------------------
    # Chapters & Script Segments
    # -------------------------------------------------------------------------
    async def get_project_chapters(self, project_id: str) -> list[dict[str, Any]]:
        """Fetch all chapters belonging to a project."""
        return await self._request("GET", f"/projects/{project_id}/chapters")

    async def create_chapter(self, project_id: str, title: str, text: str | None = None) -> dict[str, Any]:
        """Create a new chapter within a project."""
        payload: dict[str, Any] = {"title": title}
        if text is not None:
            payload["text"] = text
        return await self._request("POST", f"/projects/{project_id}/chapters", json_data=payload)

    async def delete_chapter(self, project_id: str, chapter_id: str) -> None:
        """Delete a chapter and its script segments from a project."""
        await self._request("DELETE", f"/projects/{project_id}/chapters/{chapter_id}")

    async def split_segment(self, project_id: str, segment_id: str, split_index: int) -> list[dict[str, Any]]:
        """Split a script segment into two at character index."""
        payload = {"split_index": split_index}
        return await self._request("POST", f"/projects/{project_id}/segments/{segment_id}/split", json_data=payload)

    async def merge_segments(self, project_id: str, segment_id: str, neighbor_segment_id: str) -> dict[str, Any]:
        """Merge a segment with an adjacent segment."""
        payload = {"neighbor_segment_id": neighbor_segment_id}
        return await self._request("POST", f"/projects/{project_id}/segments/{segment_id}/merge", json_data=payload)

    async def get_chapter(self, project_id: str, chapter_id: str) -> dict[str, Any]:
        """Fetch detailed chapter record including script segments and status."""
        return await self._request("GET", f"/projects/{project_id}/chapters/{chapter_id}")

    async def save_chapter_text(self, project_id: str, chapter_id: str, text: str) -> dict[str, Any]:
        """Save or update raw text content for a chapter, triggering segmentation."""
        payload = {"text": text}
        return await self._request("POST", f"/projects/{project_id}/chapters/{chapter_id}/text", json_data=payload)

    async def get_chapter_audio_stream(self, project_id: str, chapter_id: str) -> dict[str, Any]:
        """Retrieve chapter audio stream info, master URL, and segment alignments."""
        return await self._request("GET", f"/projects/{project_id}/chapters/{chapter_id}/audio-stream")

    # -------------------------------------------------------------------------
    # Stage A Parsing
    # -------------------------------------------------------------------------
    async def parse_manuscript(
        self,
        project_id: str,
        options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Trigger asynchronous Stage A parsing job for manuscript."""
        payload = options or {
            "normalize_numbers": True,
            "normalize_ligatures": True,
            "split_by_headings": True,
        }
        return await self._request("POST", f"/projects/{project_id}/parse-manuscript", json_data=payload)

    async def get_latest_parse_job(self, project_id: str, job_type: str = "parse") -> dict[str, Any]:
        """Fetch latest parse or format job status."""
        return await self._request("GET", f"/projects/{project_id}/parse-jobs/latest", params={"job_type": job_type})

    async def format_script(
        self,
        project_id: str,
        chapter_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        """Format and re-segment existing chapters according to formatting rules."""
        payload = {"chapter_ids": chapter_ids}
        return await self._request("POST", f"/projects/{project_id}/format-script", json_data=payload)

    # -------------------------------------------------------------------------
    # Stage B Dialogue Attribution & Linguistics
    # -------------------------------------------------------------------------
    async def attribute_dialogue(
        self,
        project_id: str,
        chapter_id: str | None = None,
        mode: str = "resume",
        use_offline_heuristics: bool = False,
    ) -> dict[str, Any]:
        """Trigger Stage B speaker attribution and emotion tagging."""
        payload = {
            "chapter_id": chapter_id,
            "mode": mode,
            "use_offline_heuristics": use_offline_heuristics,
        }
        return await self._request("POST", f"/projects/{project_id}/tagging-jobs", json_data=payload)

    async def get_latest_tagging_job(self, project_id: str) -> dict[str, Any]:
        """Get latest tagging job status and progress."""
        return await self._request("GET", f"/projects/{project_id}/tagging-jobs/latest")

    async def cancel_tagging_job(self, project_id: str) -> dict[str, Any]:
        """Cancel an in-flight Stage B dialogue attribution job."""
        return await self._request("POST", f"/projects/{project_id}/tag/cancel")

    async def list_pronunciation_rules(self, project_id: str) -> list[dict[str, Any]]:
        """List pronunciation phonetic overrides for project."""
        return await self._request("GET", f"/projects/{project_id}/pronunciation")

    async def add_pronunciation_rule(
        self,
        project_id: str,
        grapheme: str,
        phoneme: str,
        category: str = "general",
    ) -> dict[str, Any]:
        """Add pronunciation override rule (orthographic -> IPA / phonetic)."""
        payload = {
            "grapheme": grapheme,
            "phoneme": phoneme,
            "category": category,
        }
        return await self._request("POST", f"/projects/{project_id}/pronunciation", json_data=payload)

    async def delete_pronunciation_rule(self, project_id: str, rule_id: str) -> None:
        """Delete a pronunciation override rule."""
        await self._request("DELETE", f"/projects/{project_id}/pronunciation/{rule_id}")

    async def find_pronunciation_occurrences(
        self,
        project_id: str,
        word: str,
        replacement: str | None = None,
    ) -> dict[str, Any]:
        """Search manuscript for all occurrences of a word or phrase with contextual preview."""
        payload = {"word": word, "replacement": replacement or ""}
        return await self._request("POST", f"/projects/{project_id}/pronunciation/find", json_data=payload)

    # -------------------------------------------------------------------------
    # Characters & Voices
    # -------------------------------------------------------------------------
    async def list_characters(self, project_id: str) -> list[dict[str, Any]]:
        """List characters in project with vocal assignments and aliases."""
        data = await self._request("GET", f"/projects/{project_id}/characters")
        if isinstance(data, dict) and "characters" in data:
            return data["characters"]
        return data

    async def get_character_lines(
        self,
        project_id: str,
        character_id: str,
        limit: int = 200,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Fetch all dialogue lines/segments spoken by a specific character across chapters."""
        params = {"limit": limit, "offset": offset}
        return await self._request(
            "GET",
            f"/projects/{project_id}/characters/{character_id}/lines",
            params=params,
        )

    async def sync_characters(self, project_id: str) -> list[dict[str, Any]]:
        """Sync and discover characters from parsed dialogue segments."""
        return await self._request("POST", f"/projects/{project_id}/characters/sync")

    async def set_defaults_by_gender(self, project_id: str) -> list[dict[str, Any]]:
        """Assign default voices to all characters based on their inferred gender."""
        return await self._request("POST", f"/projects/{project_id}/characters/set-defaults-by-gender")

    async def reset_all_cast(self, project_id: str) -> list[dict[str, Any]]:
        """Reset all voice assignments for characters in a project."""
        return await self._request("POST", f"/projects/{project_id}/characters/reset-all")

    async def merge_characters(
        self,
        project_id: str,
        source_character_id: str,
        target_character_id: str,
    ) -> dict[str, Any]:
        """Merge redundant or alias character into canonical target character."""
        payload = {
            "source_character_id": source_character_id,
            "target_character_id": target_character_id,
        }
        return await self._request("POST", f"/projects/{project_id}/characters/merge", json_data=payload)

    async def preview_character_merge(
        self,
        project_id: str,
        source_character_id: str,
        target_character_id: str | None = None,
    ) -> dict[str, Any]:
        """Preview merge impact on lines, words, and affected chapters."""
        params: dict[str, Any] = {"source_character_id": source_character_id}
        if target_character_id:
            params["target_character_id"] = target_character_id
        return await self._request("GET", f"/projects/{project_id}/characters/merge-preview", params=params)

    async def get_alias_suggestions(self, project_id: str) -> list[dict[str, Any]]:
        """Get AI-detected character alias merge suggestions."""
        return await self._request("GET", f"/projects/{project_id}/characters/alias-suggestions")

    async def delete_character(self, project_id: str, character_id: str) -> None:
        """Delete character from project."""
        await self._request("DELETE", f"/projects/{project_id}/characters/{character_id}")

    async def create_character(
        self,
        project_id: str,
        name: str,
        aliases: list[str] | None = None,
        gender: str = "unknown",
        assigned_voice_id: str | None = None,
        voice_filter_id: str | None = None,
    ) -> dict[str, Any]:
        """Create a new character in the project."""
        payload = {
            "project_id": project_id,
            "name": name,
            "aliases": aliases or [],
            "gender": gender,
            "assigned_voice_id": assigned_voice_id,
            "voice_filter_id": voice_filter_id,
        }
        return await self._request("POST", "/characters", json_data=payload)

    async def update_character(
        self,
        character_id: str,
        name: str | None = None,
        aliases: list[str] | None = None,
        gender: str | None = None,
        assigned_voice_id: str | None = None,
        voice_filter_id: str | None = None,
    ) -> dict[str, Any]:
        """Update existing character profile or vocal attributes."""
        payload: dict[str, Any] = {}
        if name is not None:
            payload["name"] = name
        if aliases is not None:
            payload["aliases"] = aliases
        if gender is not None:
            payload["gender"] = gender
        if assigned_voice_id is not None:
            payload["assigned_voice_id"] = assigned_voice_id
        if voice_filter_id is not None:
            payload["voice_filter_id"] = voice_filter_id
        return await self._request("PUT", f"/characters/{character_id}", json_data=payload)

    async def list_voices(self, project_id: str | None = None) -> list[dict[str, Any]]:
        """List cloned voices and audio references."""
        params = {"project_id": project_id} if project_id else None
        data = await self._request("GET", "/voices", params=params)
        if isinstance(data, dict) and "voices" in data:
            return data["voices"]
        return data

    async def make_voice_default(self, project_id: str, voice_id: str) -> dict[str, Any]:
        """Set this voice as the default voice for its gender on a project."""
        return await self._request("POST", f"/voices/{voice_id}/make-default", params={"project_id": project_id})

    async def delete_voice(self, voice_id: str) -> dict[str, Any]:
        """Delete custom voice and its associated storage assets."""
        return await self._request("DELETE", f"/voices/{voice_id}")

    # -------------------------------------------------------------------------
    # Soundstage & Foley / SFX
    # -------------------------------------------------------------------------
    async def list_sfx(self, project_id: str | None = None, category: str | None = None) -> list[dict[str, Any]]:
        """List SFX library items (foley and atmosphere)."""
        params: dict[str, Any] = {}
        if project_id:
            params["project_id"] = project_id
        if category:
            params["category"] = category
        data = await self._request("GET", "/sfx", params=params or None)
        if isinstance(data, dict) and "items" in data:
            return data["items"]
        return data

    async def update_sfx(
        self,
        sfx_id: str,
        name: str | None = None,
        category: str | None = None,
        default_volume: float | None = None,
        triggers: list[str] | None = None,
    ) -> dict[str, Any]:
        """Update metadata, category, default volume, or triggers of an SFX item."""
        payload: dict[str, Any] = {}
        if name is not None:
            payload["name"] = name
        if category is not None:
            payload["category"] = category
        if default_volume is not None:
            payload["default_volume"] = default_volume
        if triggers is not None:
            payload["triggers"] = triggers
        return await self._request("PATCH", f"/sfx/{sfx_id}", json_data=payload)

    async def delete_sfx(self, sfx_id: str) -> dict[str, Any]:
        """Delete a sound effect item and associated audio file."""
        return await self._request("DELETE", f"/sfx/{sfx_id}")

    async def scan_foley_occurrences(
        self,
        sfx_id: str,
        project_id: str,
        triggers: list[str] | None = None,
        chapter_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        """Scan manuscript text for Foley trigger matches."""
        payload = {
            "project_id": project_id,
            "triggers": triggers or [],
            "chapter_ids": chapter_ids or [],
        }
        return await self._request("POST", f"/sfx/{sfx_id}/scan", json_data=payload)

    async def apply_foley_cue(
        self,
        project_id: str,
        segment_id: str,
        sfx_id: str,
        action: str = "after",
        target_word: str | None = None,
        volume: float = 1.0,
    ) -> dict[str, Any]:
        """Attach Foley sound effect to a specific segment."""
        payload = {
            "sfx_id": sfx_id,
            "action": action,
            "target_word": target_word,
            "volume": volume,
        }
        return await self._request("POST", f"/projects/{project_id}/segments/{segment_id}/apply-foley", json_data=payload)

    async def batch_atmosphere(
        self,
        project_id: str,
        atmosphere_id: str | None,
        segment_ids: list[str],
        volume: float = 0.3,
    ) -> dict[str, Any]:
        """Apply ambient background atmosphere across a span of segments."""
        payload = {
            "atmosphere_id": atmosphere_id,
            "segment_ids": segment_ids,
            "volume": volume,
        }
        return await self._request("POST", f"/projects/{project_id}/segments/batch-atmosphere", json_data=payload)

    # -------------------------------------------------------------------------
    # Stage C Compute & Kaggle Synthesis
    # -------------------------------------------------------------------------
    async def probe_kaggle_pool(self) -> list[dict[str, Any]]:
        """Query status and remaining weekly GPU quota of all Kaggle accounts."""
        return await self._request("GET", "/profile/kaggle/quota")

    async def preflight_audio_check(
        self,
        project_id: str,
        chapter_id: str,
        preferred_tts_model: str = "kokoro-82m",
        kaggle_account_id: str | None = None,
    ) -> dict[str, Any]:
        """Preflight audio check verifying model availability on account dataset."""
        payload = {
            "preferred_tts_model": preferred_tts_model,
            "kaggle_account_id": kaggle_account_id,
        }
        return await self._request(
            "POST",
            f"/projects/{project_id}/chapters/{chapter_id}/preflight-audio",
            json_data=payload,
        )

    async def generate_chapter_audio(
        self,
        project_id: str,
        chapter_id: str,
        preferred_tts_model: str = "kokoro-82m",
        cache_to_dataset: bool = True,
        kaggle_account_id: str | None = None,
        allow_dev_offline: bool = False,
    ) -> dict[str, Any]:
        """Dispatch chapter audio synthesis to Kaggle GPU session worker."""
        payload = {
            "preferred_tts_model": preferred_tts_model,
            "cache_to_dataset": cache_to_dataset,
            "kaggle_account_id": kaggle_account_id,
            "allow_dev_offline": allow_dev_offline,
        }
        return await self._request(
            "POST",
            f"/projects/{project_id}/chapters/{chapter_id}/generate-audio",
            json_data=payload,
        )

    async def batch_generate_audio(
        self,
        project_id: str,
        chapter_ids: list[str],
        preferred_tts_model: str = "kokoro-82m",
        cache_to_dataset: bool = True,
        lanes: int = 1,
        allow_dev_offline: bool = False,
    ) -> dict[str, Any]:
        """Dispatch multi-lane parallel chapter synthesis across Kaggle account pool."""
        payload = {
            "chapter_ids": chapter_ids,
            "preferred_tts_model": preferred_tts_model,
            "cache_to_dataset": cache_to_dataset,
            "lanes": lanes,
            "allow_dev_offline": allow_dev_offline,
        }
        return await self._request(
            "POST",
            f"/projects/{project_id}/chapters/batch-generate-audio",
            json_data=payload,
        )

    async def dispatch_novel_audio(
        self,
        project_id: str,
        preferred_tts_model: str = "kokoro-82m",
        cache_to_dataset: bool = True,
        ungenerated_only: bool = True,
        lanes: int = 1,
        allow_dev_offline: bool = False,
    ) -> dict[str, Any]:
        """Dispatch full novel synthesis across all chapters in the project."""
        chapters = await self.get_project_chapters(project_id)
        if not chapters:
            return {"status": "noop", "message": "No chapters found in project"}

        target_chapters = chapters
        if ungenerated_only:
            target_chapters = [
                c for c in chapters
                if c.get("status") != "complete" and c.get("audio_job_status") != "complete"
            ]

        if not target_chapters:
            return {
                "status": "noop",
                "message": f"All {len(chapters)} chapters already have synthesized audio.",
                "total_chapters": len(chapters),
            }

        target_ids = [c["id"] for c in target_chapters]
        result = await self.batch_generate_audio(
            project_id=project_id,
            chapter_ids=target_ids,
            preferred_tts_model=preferred_tts_model,
            cache_to_dataset=cache_to_dataset,
            lanes=lanes,
            allow_dev_offline=allow_dev_offline,
        )
        return {
            "status": "dispatched",
            "novel_total_chapters": len(chapters),
            "dispatched_chapters": len(target_ids),
            "chapter_ids": target_ids,
            "batch_result": result,
        }

    # -------------------------------------------------------------------------
    # Kaggle Account Pool Management & Switching
    # -------------------------------------------------------------------------
    async def list_kaggle_accounts(self) -> list[dict[str, Any]]:
        """List all configured Kaggle accounts with quota usage, priority, and status."""
        return await self._request("GET", "/profile/kaggle/accounts")

    async def get_kaggle_pool_summary(self) -> dict[str, Any]:
        """Get high-level pool capacity, active quota hours, and account counts."""
        return await self._request("GET", "/profile/kaggle/summary")

    async def create_kaggle_account(
        self,
        username: str,
        key: str,
        priority: int = 1,
        is_active: bool = True,
        verify_first: bool = True,
    ) -> dict[str, Any]:
        """Add and verify a new Kaggle account in the failover pool."""
        payload = {
            "username": username,
            "key": key,
            "priority": priority,
            "is_active": is_active,
            "verify_first": verify_first,
        }
        return await self._request("POST", "/profile/kaggle/accounts", json_data=payload)

    async def update_kaggle_account(
        self,
        account_id: str,
        username: str | None = None,
        key: str | None = None,
        priority: int | None = None,
        is_active: bool | None = None,
        status: str | None = None,
        total_hours_used: float | None = None,
        verify_first: bool = False,
    ) -> dict[str, Any]:
        """Update Kaggle account priority, active status, or credentials."""
        payload: dict[str, Any] = {}
        if username is not None:
            payload["username"] = username
        if key is not None:
            payload["key"] = key
        if priority is not None:
            payload["priority"] = priority
        if is_active is not None:
            payload["is_active"] = is_active
        if status is not None:
            payload["status"] = status
        if total_hours_used is not None:
            payload["total_hours_used"] = total_hours_used
        payload["verify_first"] = verify_first
        return await self._request("PUT", f"/profile/kaggle/accounts/{account_id}", json_data=payload)

    async def switch_primary_kaggle_account(self, account_id: str, is_active: bool = True) -> dict[str, Any]:
        """Switch primary dispatcher account by setting its priority to 1 and ensuring active status."""
        return await self.update_kaggle_account(account_id, priority=1, is_active=is_active)

    async def delete_kaggle_account(self, account_id: str) -> dict[str, Any]:
        """Permanently delete a Kaggle account from the user's pool."""
        return await self._request("DELETE", f"/profile/kaggle/accounts/{account_id}")

    async def test_kaggle_account(self, account_id: str) -> dict[str, Any]:
        """Test connection and GPU quota access for a saved Kaggle account."""
        return await self._request("POST", f"/profile/kaggle/accounts/{account_id}/test")

    async def check_kaggle_dataset(self, account_id: str) -> dict[str, Any]:
        """Check whether pre-mounted runtime dataset is registered on this account."""
        return await self._request("POST", f"/profile/kaggle/accounts/{account_id}/check-dataset")

    async def initialize_kaggle_dataset(self, account_id: str) -> dict[str, Any]:
        """Initialize or register pre-mounted models dataset on account for instant boot."""
        return await self._request("POST", f"/profile/kaggle/accounts/{account_id}/initialize-dataset")

    async def cancel_batch_audio(self, project_id: str) -> dict[str, Any]:
        """Cancel in-flight batch synthesis lanes and release in-use Kaggle accounts."""
        return await self._request("POST", f"/projects/{project_id}/cancel-batch-audio")

    async def regenerate_segment_audio(
        self,
        project_id: str,
        segment_id: str,
        speed: float = 1.0,
        preferred_tts_model: str | None = None,
        character_voice_id: str | None = None,
        allow_dev_offline: bool = False,
    ) -> dict[str, Any]:
        """Perform surgical single-line GPU retake with zero wasted quota."""
        payload = {
            "speed": speed,
            "preferred_tts_model": preferred_tts_model,
            "character_voice_id": character_voice_id,
            "allow_dev_offline": allow_dev_offline,
        }
        return await self._request(
            "POST",
            f"/projects/{project_id}/segments/{segment_id}/regenerate-audio",
            json_data=payload,
        )

    # -------------------------------------------------------------------------
    # Distribution & Delivery
    # -------------------------------------------------------------------------
    async def deliver_chapter_to_telegram(
        self,
        project_id: str,
        chapter_id: str,
        force_preview: bool = False,
    ) -> dict[str, Any]:
        """Transmit completed chapter audio directly to user's Telegram."""
        payload = {"force_preview": force_preview}
        return await self._request(
            "POST",
            f"/projects/{project_id}/chapters/{chapter_id}/send-telegram",
            json_data=payload,
        )

    async def verify_telegram_connection(
        self,
        bot_token: str | None = None,
        chat_id: str | None = None,
    ) -> dict[str, Any]:
        """Ping Telegram Bot API to verify bot credentials and chat access."""
        payload = {"bot_token": bot_token, "chat_id": chat_id}
        return await self._request("POST", "/telegram/verify", json_data=payload)

    async def get_package_preview(self, project_id: str) -> dict[str, Any]:
        """Fetch packaging preview metadata, cover art status, and chapter availability."""
        return await self._request("GET", f"/projects/{project_id}/package-preview")
