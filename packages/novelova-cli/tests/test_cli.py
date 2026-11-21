import json
from pathlib import Path
from typer.testing import CliRunner
import pytest
from novelova_cli.main import app
from novelova_cli.commands.synthesize import parse_chapter_spec, verify_file_md5_and_size
from novelova_cli.config import CliConfig, save_config, load_config

runner = CliRunner()


def test_cli_version():
    result = runner.invoke(app, ["--version"])
    assert result.exit_code == 0
    assert "novelova CLI v0.1.0" in result.output


def test_auth_status_json():
    result = runner.invoke(app, ["auth", "status", "--json"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert "authenticated" in data
    assert "api_url" in data


def test_parse_chapter_spec():
    assert parse_chapter_spec("1..5") == [1, 2, 3, 4, 5]
    assert parse_chapter_spec("1,3,5") == [1, 3, 5]
    assert parse_chapter_spec("1..3, 7-9, 15") == [1, 2, 3, 7, 8, 9, 15]


def test_verify_file_md5_and_size(tmp_path: Path):
    test_file = tmp_path / "test_audio.mp3"
    test_file.write_bytes(b"novelova_test_audio_stream_data_12345")

    # Correct size and md5
    import hashlib
    expected_md5 = hashlib.md5(b"novelova_test_audio_stream_data_12345").hexdigest()
    expected_size = len(b"novelova_test_audio_stream_data_12345")

    assert verify_file_md5_and_size(test_file, expected_size, expected_md5) is True
    assert verify_file_md5_and_size(test_file, expected_size + 1, expected_md5) is False
    assert verify_file_md5_and_size(test_file, expected_size, "invalid_hash") is False


def test_round_robin_striding():
    # 100 chapters across 8 lanes
    total_chapters = list(range(1, 101))
    num_lanes = 8

    lanes = [[] for _ in range(num_lanes)]
    for idx, ch in enumerate(total_chapters):
        lanes[idx % num_lanes].append(ch)

    # Lane 1 (index 0): 1, 9, 17, 25, 33...
    assert lanes[0][:5] == [1, 9, 17, 25, 33]
    # Lane 2 (index 1): 2, 10, 18, 26, 34...
    assert lanes[1][:5] == [2, 10, 18, 26, 34]
    # Lane 8 (index 7): 8, 16, 24, 32, 40...
    assert lanes[7][:5] == [8, 16, 24, 32, 40]
