from types import SimpleNamespace

from app.models.project import DEFAULT_PROJECT_SETTINGS, ProjectModel
from app.services.pronunciation import PronunciationService


def test_project_default_settings_deep_copied():
    """Ensure mutating one project's nested active_paralinguistic_tags does not pollute DEFAULT_PROJECT_SETTINGS."""
    default_fn = ProjectModel.__table__.c.settings.default.arg
    s1 = default_fn(None)
    s2 = default_fn(None)
    s1["active_paralinguistic_tags"]["laugh"] = False
    assert s2["active_paralinguistic_tags"]["laugh"] is True
    assert DEFAULT_PROJECT_SETTINGS["active_paralinguistic_tags"]["laugh"] is True


def test_pronunciation_rules_backslash_safe_and_scoped():
    """Verify pronunciation replacements containing backslashes don't crash and chapter scope is honored."""
    rule_global = SimpleNamespace(
        is_active=True,
        phrase="Aether",
        replacement=r"Ay\1ther",
        match_case=False,
        scope="project",
        excluded_segment_ids=[],
    )
    rule_ch2 = SimpleNamespace(
        is_active=True,
        phrase="Sol",
        replacement="Sohl",
        match_case=True,
        scope="ch-2",
        excluded_segment_ids=[],
    )
    out_ch1 = PronunciationService.apply_rules_to_text(
        "Aether and Sol",
        [rule_global, rule_ch2],
        segment_id="seg-1",
        chapter_id="ch-1",
    )
    assert out_ch1 == r"Ay\1ther and Sol"

    out_ch2 = PronunciationService.apply_rules_to_text(
        "Aether and Sol",
        [rule_global, rule_ch2],
        segment_id="seg-1",
        chapter_id="ch-2",
    )
    assert out_ch2 == r"Ay\1ther and Sohl"
