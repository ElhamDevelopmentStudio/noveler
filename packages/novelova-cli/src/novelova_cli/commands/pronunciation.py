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

app = typer.Typer(help="Pronunciation dictionary overrides and phonetic respelling rules")


@app.command("list")
def list_rules(
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """List all pronunciation overrides defined for a project."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        data = client.get(f"/projects/{resolved_id}/pronunciation")
        rules = data.get("rules", [])

        if json_output:
            output_result(rules, is_json=True)
            return

        columns = ["ID", "Original Phrase", "Replacement / Respelling", "Match Case", "Scope", "Occurrences"]
        rows = []
        for r in rules:
            rows.append([
                r.get("id"),
                r.get("phrase"),
                r.get("replacement"),
                "Yes" if r.get("match_case") else "No",
                r.get("scope"),
                r.get("occurrences_count", 0),
            ])
        print_table(f"Pronunciation Overrides: Project {resolved_id}", columns, rows)
    except NovelovaCliError as e:
        print_error(f"Failed to list pronunciation rules: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("add")
def add_rule(
    phrase: str = typer.Argument(..., help="Original word or phrase to override (e.g. Mjolnir)"),
    replacement: str = typer.Argument(..., help="Phonetic replacement (e.g. Me-yol-neer)"),
    match_case: bool = typer.Option(False, "--match-case", "-c", help="Case-sensitive matching"),
    scope: str = typer.Option("entire_manuscript", "--scope", "-s", help="Rule scope: entire_manuscript or specific chapter_id"),
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Add a pronunciation override or phonetic respelling rule."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        payload = {
            "phrase": phrase.strip(),
            "replacement": replacement.strip(),
            "match_case": match_case,
            "scope": scope,
            "excluded_segment_ids": [],
        }
        res = client.post(f"/projects/{resolved_id}/pronunciation", json_data=payload)
        if json_output:
            output_result(res, is_json=True)
        else:
            print_success(f"Pronunciation override added: '{phrase}' -> '{replacement}' (ID: {res.get('id')}).")
    except NovelovaCliError as e:
        print_error(f"Failed to add pronunciation rule: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("delete")
def delete_rule(
    rule_id: str = typer.Argument(..., help="Pronunciation rule ID to delete"),
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Delete a pronunciation override rule."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        client.delete(f"/projects/{resolved_id}/pronunciation/{rule_id}")
        if json_output:
            output_result({"deleted_rule_id": rule_id}, is_json=True)
        else:
            print_success(f"Pronunciation rule '{rule_id}' deleted successfully.")
    except NovelovaCliError as e:
        print_error(f"Failed to delete pronunciation rule: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("find")
def find_phrase(
    word: str = typer.Argument(..., help="Word or phrase to search"),
    replacement: str = typer.Option("", "--replacement", "-r", help="Proposed replacement to preview changes"),
    match_case: bool = typer.Option(False, "--match-case", "-c", help="Case-sensitive matching"),
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Find occurrences of a word or name across manuscript chapters to preview respelling."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        payload = {
            "word": word.strip(),
            "replacement": replacement.strip(),
            "match_case": match_case,
            "scope": "entire_manuscript",
        }
        res = client.post(f"/projects/{resolved_id}/pronunciation/find", json_data=payload)
        occurrences = res.get("occurrences", [])

        if json_output:
            output_result(res, is_json=True)
            return

        columns = ["#", "Chapter", "Original Text", "Preview with Replacement"]
        rows = []
        for o in occurrences[:20]:
            rows.append([
                o.get("chapter_number"),
                o.get("chapter_title"),
                o.get("current_text")[:60] + "..." if len(o.get("current_text", "")) > 60 else o.get("current_text"),
                o.get("preview_text")[:60] + "..." if len(o.get("preview_text", "")) > 60 else o.get("preview_text"),
            ])
        print_table(f"Occurrences of '{word}' (Found {res.get('total_found', 0)})", columns, rows)
    except NovelovaCliError as e:
        print_error(f"Failed to find phrase occurrences: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("extract")
def extract_glossary(
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    sample_chapters: int = typer.Option(8, "--sample-chapters", help="Number of chapters to sample"),
    save_as_drafts: bool = typer.Option(True, "--save-drafts/--preview-only", help="Save extracted rules as inactive drafts"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Auto-extract fantasy names, foreign romanizations, and spells as phonetic pronunciation drafts."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        payload = {
            "sample_chapters": sample_chapters,
            "save_as_drafts": save_as_drafts,
        }
        res = client.post(f"/projects/{resolved_id}/pronunciation/extract", json_data=payload)
        if json_output:
            output_result(res, is_json=True)
        else:
            print_success(res.get("message", "Glossary extraction completed."))
    except NovelovaCliError as e:
        print_error(f"Failed to extract pronunciation glossary: {e.message}", is_json=json_output)
        raise typer.Exit(1)
