from typing import Any
import typer
from novelova_cli.client import NovelovaClient, NovelovaCliError
from novelova_cli.commands.projects import _resolve_project_id
from novelova_cli.output import (
    print_error,
    print_success,
    print_table,
    output_result,
)

app = typer.Typer(help="Dramatis personae, character voice casting, and alias merging")


@app.command("list")
def list_cast(
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    unassigned_only: bool = typer.Option(False, "--unassigned", "-u", help="Show only characters without voice assigned"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """List characters, speaking counts, assigned voices, and aliases for a project."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        data = client.get(f"/projects/{resolved_id}/characters")
        chars = data.get("characters", [])

        if unassigned_only:
            chars = [c for c in chars if not c.get("assigned_voice_id")]

        if json_output:
            output_result(chars, is_json=True)
            return

        columns = ["ID", "Character Name", "Gender", "Lines", "Assigned Voice", "Aliases"]
        rows = []
        for c in chars:
            voice_name = c.get("assigned_voice", {}).get("name") if c.get("assigned_voice") else "— (Unassigned)"
            aliases = ", ".join(c.get("aliases") or []) or "—"
            rows.append([
                c.get("id"),
                c.get("name"),
                c.get("inferred_gender") or c.get("gender") or "unknown",
                c.get("dialogue_line_count", 0),
                voice_name,
                aliases,
            ])
        print_table(f"Dramatis Personae & Cast: Project {resolved_id}", columns, rows)
    except NovelovaCliError as e:
        print_error(f"Failed to list cast: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("assign")
def assign_voice(
    character_id: str = typer.Argument(..., help="Character ID or Name"),
    voice_id: str = typer.Option(..., "--voice", "-v", help="Voice model ID or short name (e.g. af_sarah, am_adam)"),
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Assign a voice model to a character."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)

        # If user passed character name instead of UUID, look up by name
        actual_char_id = character_id
        if not character_id.startswith("char-") and len(character_id) < 32:
            data = client.get(f"/projects/{resolved_id}/characters")
            chars = data.get("characters", [])
            matched = [c for c in chars if c.get("name", "").lower() == character_id.lower()]
            if matched:
                actual_char_id = matched[0]["id"]

        res = client.patch(
            f"/projects/{resolved_id}/characters/{actual_char_id}",
            json_data={"assigned_voice_id": voice_id},
        )
        if json_output:
            output_result(res, is_json=True)
        else:
            print_success(f"Assigned voice '{voice_id}' to character '{res.get('name', actual_char_id)}'.")
    except NovelovaCliError as e:
        print_error(f"Failed to assign voice: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("merge")
def merge_characters(
    source_id: str = typer.Argument(..., help="Source character ID or alias to be merged and deleted"),
    target_id: str = typer.Argument(..., help="Target canonical character ID or name to receive all lines"),
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Merge a duplicate character or alias into a canonical character."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        payload = {
            "source_character_id": source_id,
            "target_character_id": target_id,
        }
        res = client.post(f"/projects/{resolved_id}/characters/merge", json_data=payload)
        if json_output:
            output_result(res, is_json=True)
        else:
            print_success(f"Merged source character '{source_id}' into canonical character '{res.get('name', target_id)}'.")
    except NovelovaCliError as e:
        print_error(f"Failed to merge characters: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("sync")
def sync_characters(
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Scan and discover all unique character speakers across parsed dialogue segments."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        chars = client.post(f"/projects/{resolved_id}/characters/sync")
        if json_output:
            output_result(chars, is_json=True)
        else:
            print_success(f"Discovered and synced {len(chars)} unique characters for project '{resolved_id}'.")
    except NovelovaCliError as e:
        print_error(f"Failed to sync characters: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("auto-cast")
def auto_cast_by_gender(
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Automatically assign default voice models based on inferred character genders."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        chars = client.post(f"/projects/{resolved_id}/characters/set-defaults-by-gender")
        if json_output:
            output_result(chars, is_json=True)
        else:
            print_success(f"Auto-assigned voices by gender for {len(chars)} characters in project '{resolved_id}'.")
    except NovelovaCliError as e:
        print_error(f"Failed to auto-cast voices: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("build-dossiers")
def build_dossiers(
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    character_ids: list[str] = typer.Option(None, "--character-id", "-c", help="Specific character ID(s) to profile"),
    refresh: bool = typer.Option(False, "--refresh", help="Regenerate dossiers even if already present"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Build or refresh structured Character Dossiers and VoiceDesign prompts from tagged chapters."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        payload = {
            "character_ids": character_ids if character_ids else None,
            "refresh": refresh,
        }
        res = client.post(f"/projects/{resolved_id}/characters/dossiers/generate", json_data=payload)
        if json_output:
            output_result(res, is_json=True)
        else:
            print_success(
                f"Generated {res.get('generated_count', 0)} dossier(s) "
                f"(skipped {res.get('skipped_count', 0)}, failed {res.get('failed_count', 0)})."
            )
    except NovelovaCliError as e:
        print_error(f"Failed to build dossiers: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("voice-design")
def voice_design(
    character_ids: list[str] = typer.Option(..., "--character-id", "-c", help="Character ID(s) to design custom voices for"),
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    auto_assign: bool | None = typer.Option(
        None,
        "--auto-assign/--no-auto-assign",
        help="Automatically assign generated voices to characters (omitted = interactive y/n prompt defaulting to Yes; pass flag for non-interactive/agent use)",
    ),
    cache_to_dataset: bool = typer.Option(
        True,
        "--cache-dataset/--no-cache-dataset",
        help="Mount cached Kaggle Dataset for Qwen3-TTS-12Hz-1.7B-VoiceDesign",
    ),
    is_global: bool = typer.Option(False, "--global/--project-only", help="Make generated voices globally available"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON (implies non-interactive default auto-assign=True if flag omitted)"),
) -> None:
    """Trigger Kaggle Qwen3-TTS-12Hz-1.7B-VoiceDesign for selected characters."""
    import sys

    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)

        # Resolve auto_assign: explicit flag > non-interactive/JSON default (True) > interactive y/n prompt (default Y)
        if auto_assign is None:
            if json_output or not sys.stdin.isatty():
                effective_auto_assign = True
            else:
                effective_auto_assign = typer.confirm(
                    "Should all the generated voices be automatically assigned?",
                    default=True,
                )
        else:
            effective_auto_assign = auto_assign

        payload = {
            "project_id": resolved_id,
            "character_ids": character_ids,
            "auto_assign": effective_auto_assign,
            "is_global": is_global,
            "cache_to_dataset": cache_to_dataset,
            "auto_build_missing_dossiers": True,
        }
        job = client.post("/voice-design", json_data=payload)
        if json_output:
            output_result(job, is_json=True)
        else:
            print_success(
                f"VoiceDesign job enqueued (Job ID: {job.get('id')}) for {job.get('total_characters')} character(s) "
                f"[auto_assign={'YES' if effective_auto_assign else 'NO'}]."
            )
    except NovelovaCliError as e:
        print_error(f"Failed to start VoiceDesign job: {e.message}", is_json=json_output)
        raise typer.Exit(1)
