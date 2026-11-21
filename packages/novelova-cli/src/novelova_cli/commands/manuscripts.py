from pathlib import Path
import typer
from novelova_cli.client import NovelovaClient, NovelovaCliError
from novelova_cli.commands.projects import _resolve_project_id
from novelova_cli.output import print_error, print_success, print_panel, output_result

app = typer.Typer(help="Manuscript ingestion, URL scraping, and Stage A parsing")


@app.command("upload")
def upload_manuscript(
    file_path: Path = typer.Argument(..., help="Path to manuscript file (.txt, .epub, .md)"),
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    parse: bool = typer.Option(True, "--parse/--no-parse", help="Automatically trigger Stage A parsing after upload"),
    sentence_wise: bool = typer.Option(True, "--sentence-wise/--paragraph-wise", help="Split text sentence-wise"),
    background: bool = typer.Option(False, "--background", "-b", help="Run parsing in background queue"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Upload a manuscript file to a project and optionally parse into chapters."""
    if not file_path.exists():
        print_error(f"Manuscript file not found: {file_path}", is_json=json_output)
        raise typer.Exit(1)

    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)

        # 1. Upload attachment
        with open(file_path, "rb") as f:
            content_type = "text/plain"
            if file_path.suffix.lower() == ".epub":
                content_type = "application/epub+zip"
            elif file_path.suffix.lower() == ".md":
                content_type = "text/markdown"

            upload_res = client.post(
                "/attachments/upload",
                files={"file": (file_path.name, f, content_type)},
                timeout=180.0,
            )
        attachment_id = upload_res.get("id")

        # 2. Attach to project
        client.put(
            f"/projects/{resolved_id}",
            json_data={"manuscript_attachment_id": attachment_id},
        )

        parse_res = None
        if parse:
            parse_payload = {
                "separate_sentence_wise": sentence_wise,
            }
            parse_res = client.post(
                f"/projects/{resolved_id}/parse",
                params={"background": background},
                json_data=parse_payload,
                timeout=300.0,
            )

        if json_output:
            output_result(
                {
                    "success": True,
                    "project_id": resolved_id,
                    "attachment_id": attachment_id,
                    "filename": file_path.name,
                    "parsed": parse,
                    "parse_result": parse_res,
                },
                is_json=True,
            )
        else:
            print_success(f"Manuscript '{file_path.name}' uploaded and attached to project '{resolved_id}'.")
            if parse:
                if background:
                    print_success(f"Stage A parsing enqueued as background job for project '{resolved_id}'.")
                else:
                    total_chaps = len(parse_res.get("chapters", [])) if isinstance(parse_res, dict) else 0
                    print_success(f"Stage A parsing complete: {total_chaps} chapters segmented.")
    except NovelovaCliError as e:
        print_error(f"Failed to upload manuscript: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("import-url")
def import_url(
    url: str = typer.Argument(..., help="Web novel chapter or novel URL (RoyalRoad, WebNovel, etc.)"),
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    parse: bool = typer.Option(True, "--parse/--no-parse", help="Trigger parsing after import"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Scrape and import manuscript text directly from a web URL."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        res = client.post(
            f"/projects/{resolved_id}/import-url",
            json_data={"url": url.strip()},
            timeout=120.0,
        )

        if parse:
            parse_res = client.post(
                f"/projects/{resolved_id}/parse",
                json_data={"separate_sentence_wise": True},
                timeout=300.0,
            )
        else:
            parse_res = None

        if json_output:
            output_result(
                {
                    "success": True,
                    "project_id": resolved_id,
                    "url": url,
                    "import_result": res,
                    "parse_result": parse_res,
                },
                is_json=True,
            )
        else:
            print_success(f"Successfully scraped content from '{url}' into project '{resolved_id}'.")
            if parse:
                print_success("Stage A parsing complete.")
    except NovelovaCliError as e:
        print_error(f"Failed to import URL: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("parse")
def parse_manuscript(
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    sentence_wise: bool = typer.Option(True, "--sentence-wise/--paragraph-wise", help="Split text sentence-wise"),
    background: bool = typer.Option(False, "--background", "-b", help="Run parsing in background queue"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Trigger Stage A parsing on a project's attached manuscript."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        parse_payload = {
            "separate_sentence_wise": sentence_wise,
        }
        res = client.post(
            f"/projects/{resolved_id}/parse",
            params={"background": background},
            json_data=parse_payload,
            timeout=300.0,
        )
        if json_output:
            output_result(res, is_json=True)
        else:
            if background:
                print_success(f"Stage A parsing enqueued in background for project '{resolved_id}'.")
            else:
                total_chaps = len(res.get("chapters", [])) if isinstance(res, dict) else 0
                print_success(f"Stage A parsing complete for project '{resolved_id}': {total_chaps} chapters segmented.")
    except NovelovaCliError as e:
        print_error(f"Failed to parse manuscript: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("content")
def manuscript_content(
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    offset: int = typer.Option(0, "--offset", "-o", help="Character offset"),
    limit: int = typer.Option(5000, "--limit", "-l", help="Character limit to retrieve"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Inspect raw unparsed manuscript text for a project."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        res = client.get(
            f"/projects/{resolved_id}/raw-content",
            params={"offset": offset, "limit": limit},
        )
        if json_output:
            output_result(res, is_json=True)
        else:
            print_panel(
                f"Raw Manuscript Content ({offset}..{offset + limit})",
                res.get("content", ""),
            )
    except NovelovaCliError as e:
        print_error(f"Failed to retrieve manuscript content: {e.message}", is_json=json_output)
        raise typer.Exit(1)
