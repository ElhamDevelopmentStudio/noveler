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
