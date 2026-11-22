import ast
import os

from app.services.audio_effects import (
    generate_synthesized_atmosphere_wav,
    overlay_atmosphere_to_master,
    read_pcm16_samples,
)
from app.services.kaggle_worker import build_kaggle_worker_script


def test_kaggle_worker_script_valid_python_and_gpu_optimizations():
    """Verify generated Kaggle worker script parses as valid Python and includes Phase 2 GPU optimizations."""
    for model_name in ("chatterbox-turbo", "kokoro-82m"):
        script = build_kaggle_worker_script(
            job_id="12345678-1234-1234-1234-1234567890ab",
            project_id="proj-123",
            tts_model=model_name,
            r2_endpoint="https://example.r2.cloudflarestorage.com",
            r2_bucket="novelova-test",
            r2_access_key="ak",
            r2_secret_key="sk",
            cache_to_dataset=True,
        )
        # Must compile cleanly without SyntaxError
        ast.parse(script)

        # Must guard Kokoro init on Chatterbox runs
        assert 'if "' + model_name + '" not in ("chatterbox-turbo", "chatterbox"):' in script
        # Must check shutdown.json cancellation signal
        assert "shutdown.json" in script
        assert "_is_job_cancelled()" in script
        # Must use torch.inference_mode() and sentence chunking
        assert "with torch.inference_mode():" in script
        assert "_split_tts_chunks" in script
        # Must support content-hash caching
        assert "existing_cache_keys" in script
        # Must handle alongside Foley cues and NumPy atmosphere mixing
        assert 'action") == "alongside"' in script
        assert "np.frombuffer" in script
        # Must flush chapter uploads BEFORE writing chapter completion receipt
        assert script.index("chapter_upload_futures.clear()") < script.index("ch_{ch_num}_complete.json")


def test_audio_effects_no_double_volume_attenuation():
    """Verify procedural atmosphere overlay does not square the volume factor."""
    # 1 second of silence as master WAV
    silent_master = generate_synthesized_atmosphere_wav("hum", duration_ms=1000, volume=0.0, sample_rate=24000)
    mixed = overlay_atmosphere_to_master(
        silent_master,
        atmosphere_spans=[
            {
                "atmosphere_id": "proc-rain",
                "atmosphere_name": "rain",
                "volume": 0.25,
                "start_ms": 0,
                "end_ms": 1000,
            }
        ],
        sample_rate=24000,
    )
    samples, _ = read_pcm16_samples(mixed)
    peak = max(abs(s) for s in samples)
    # With single 0.25 volume, rain peak (~16000 * 0.5 * 0.25) is well above 400; double attenuation would drop it <200
    assert peak > 400


def test_kaggle_auth_lock_restores_env(monkeypatch):
    """Verify kaggle_authenticated_api restores original env vars after exiting."""
    import sys
    import types
    from app.core.kaggle_auth import kaggle_authenticated_api

    class _DummyApi:
        def authenticate(self):
            self.seen_user = os.environ.get("KAGGLE_USERNAME")
            self.seen_token = os.environ.get("KAGGLE_API_TOKEN")

    fake_mod = types.ModuleType("kaggle.api.kaggle_api_extended")
    fake_mod.KaggleApi = _DummyApi
    monkeypatch.setitem(sys.modules, "kaggle", types.ModuleType("kaggle"))
    monkeypatch.setitem(sys.modules, "kaggle.api", types.ModuleType("kaggle.api"))
    monkeypatch.setitem(sys.modules, "kaggle.api.kaggle_api_extended", fake_mod)

    monkeypatch.setenv("KAGGLE_USERNAME", "orig-user")
    monkeypatch.delenv("KAGGLE_API_TOKEN", raising=False)

    with kaggle_authenticated_api("worker-user", "KGAT_secret123") as api:
        assert api.seen_user == "worker-user"
        assert api.seen_token == "KGAT_secret123"

    assert os.environ.get("KAGGLE_USERNAME") == "orig-user"
    assert os.environ.get("KAGGLE_API_TOKEN") is None
