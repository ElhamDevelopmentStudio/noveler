import json
import os
from pathlib import Path
from pydantic import BaseModel, Field


CONFIG_DIR = Path.home() / ".novelova"
CONFIG_FILE = CONFIG_DIR / "config.json"
DEFAULT_API_URL = os.getenv("NOVELOVA_API_BASE_URL", "http://localhost:8000/api/v1")


class CliConfig(BaseModel):
    api_base_url: str = Field(default_factory=lambda: DEFAULT_API_URL)
    api_token: str | None = None
    access_token: str | None = None
    user_email: str | None = None
    user_name: str | None = None
    active_project_id: str | None = None


def ensure_config_dir() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(CONFIG_DIR, 0o700)


def load_config() -> CliConfig:
    ensure_config_dir()
    if not CONFIG_FILE.exists():
        return CliConfig()
    try:
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        return CliConfig.model_validate(data)
    except Exception:
        return CliConfig()


def save_config(cfg: CliConfig) -> None:
    ensure_config_dir()
    CONFIG_FILE.write_text(cfg.model_dump_json(indent=2), encoding="utf-8")
    os.chmod(CONFIG_FILE, 0o600)


def get_effective_token() -> str | None:
    # 1. Environment variable NOVELOVA_API_TOKEN has highest priority
    env_token = os.getenv("NOVELOVA_API_TOKEN")
    if env_token and env_token.strip():
        return env_token.strip()

    # 2. Local config token
    cfg = load_config()
    if cfg.api_token:
        return cfg.api_token
    if cfg.access_token:
        return cfg.access_token
    return None


def get_api_url() -> str:
    env_url = os.getenv("NOVELOVA_API_BASE_URL")
    if env_url and env_url.strip():
        return env_url.strip().rstrip("/")
    cfg = load_config()
    return cfg.api_base_url.rstrip("/")


def set_active_project(project_id: str | None) -> None:
    cfg = load_config()
    cfg.active_project_id = project_id
    save_config(cfg)
