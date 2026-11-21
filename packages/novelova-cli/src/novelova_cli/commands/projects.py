from pathlib import Path
from typing import Any
import typer
from novelova_cli.client import NovelovaClient, NovelovaCliError
from novelova_cli.config import load_config, set_active_project
from novelova_cli.output import (
    print_error,
    print_success,
    print_table,
    print_panel,
    output_result,
)

app = typer.Typer(help="Project lifecycle and catalog management")


def _resolve_project_id(project_id: str | None) -> str:
    if project_id:
        return project_id
    cfg = load_config()
    if cfg.active_project_id:
        return cfg.active_project_id
    raise NovelovaCliError("No project ID specified and no active project selected. Run 'novelova projects select <id>' or provide project ID.")


@app.command("list")
def list_projects(
    search: str = typer.Option(None, "--search", "-s", help="Filter by title or author"),
    status: str = typer.Option(None, "--status", help="Filter by status (in_production, review, complete)"),
    page: int = typer.Option(1, "--page", "-p", help="Page number"),
    page_size: int = typer.Option(50, "--limit", "-n", help="Results per page"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """List all studio projects with status, chapter counts, and metadata."""
    client = NovelovaClient()
    params: dict[str, Any] = {"page": page, "page_size": page_size}
    if search:
        params["search"] = search
    if status:
        params["status"] = status

    try:
        data = client.get("/projects", params=params)
        items = data.get("items", [])
        if json_output:
            output_result(data, is_json=True)
            return

        cfg = load_config()
        columns = ["ID", "Title", "Author", "Status", "Chapters", "Words", "Active"]
        rows = []
        for p in items:
            is_active = "*" if p.get("id") == cfg.active_project_id else ""
            rows.append([
                p.get("id"),
                p.get("title"),
                p.get("author") or "—",
                p.get("status_label") or p.get("status"),
                p.get("total_chapters", 0),
                p.get("total_words", 0),
                is_active,
            ])
        print_table("Studio Projects", columns, rows)
    except NovelovaCliError as e:
        print_error(f"Failed to list projects: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("create")
def create_project(
    title: str = typer.Option(..., "--title", "-t", help="Project title"),
    author: str = typer.Option(None, "--author", "-a", help="Author name"),
    owner: str = typer.Option(None, "--owner", "--publisher", help="Publisher / Creator owner"),
    publication_date: str = typer.Option(None, "--publication-date", help="Publication date (e.g. YYYY-MM-DD)"),
    created_date: str = typer.Option(None, "--created-date", help="Creation date (e.g. YYYY-MM-DD)"),
    genre: str = typer.Option(None, "--genre", "-g", help="Genre (e.g. Fantasy, LitRPG, Sci-Fi)"),
    language: str = typer.Option("en", "--language", "-l", help="Language code"),
    cover: Path = typer.Option(None, "--cover", "-c", help="Path to cover art image file"),
    select: bool = typer.Option(True, "--select/--no-select", help="Set as active project immediately"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Create a new novel audio drama project."""
    client = NovelovaClient()

    cover_attachment_id = None
    if cover:
        if not cover.exists():
            print_error(f"Cover file not found: {cover}", is_json=json_output)
            raise typer.Exit(1)
        try:
            with open(cover, "rb") as f:
                upload_res = client.post("/attachments/upload", files={"file": (cover.name, f, "image/jpeg")})
            cover_attachment_id = upload_res.get("id")
        except Exception as e:
            print_error(f"Failed to upload cover art: {e}", is_json=json_output)
            raise typer.Exit(1)

    payload = {
        "title": title.strip(),
        "author": author.strip() if author else None,
        "owner": owner.strip() if owner else None,
        "publication_date": publication_date.strip() if publication_date else None,
        "created_date": created_date.strip() if created_date else None,
        "genre": genre.strip() if genre else None,
        "language": language.strip(),
        "thumbnail_attachment_id": cover_attachment_id,
    }

    try:
        res = client.post("/projects", json_data=payload)
        project_id = res.get("id")
        if select and project_id:
            set_active_project(project_id)

        if json_output:
            output_result(res, is_json=True)
        else:
            print_success(f"Project '{title}' created successfully with ID: {project_id}")
            if select:
                print_success(f"Selected project '{project_id}' as active project.")
    except NovelovaCliError as e:
        print_error(f"Failed to create project: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("show")
def show_project(
    project_id: str = typer.Argument(None, help="Project ID (omitted = active project)"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Show detailed metadata and statistics for a project."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        data = client.get(f"/projects/{resolved_id}")
        if json_output:
            output_result(data, is_json=True)
            return

        content = (
            f"Title: [bold]{data.get('title')}[/bold]\n"
            f"Author: {data.get('author') or '—'}\n"
            f"Genre: {data.get('genre') or '—'}\n"
            f"Language: {data.get('language') or '—'}\n"
            f"Status: [cyan]{data.get('status_label') or data.get('status')}[/cyan]\n"
            f"Total Chapters: [bold]{data.get('total_chapters', 0)}[/bold]\n"
            f"Total Words: [bold]{data.get('total_words', 0):,}[/bold]\n"
            f"Cover Art: {'Attached' if data.get('cover_url') or data.get('thumbnail_attachment_id') else 'None'}\n"
            f"Created At: {data.get('created_at')}\n"
            f"Updated At: {data.get('updated_at')}"
        )
        print_panel(f"Project Detail: {resolved_id}", content)
    except NovelovaCliError as e:
        print_error(f"Failed to show project: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("update")
def update_project(
    project_id: str = typer.Argument(None, help="Project ID (omitted = active project)"),
    title: str = typer.Option(None, "--title", "-t", help="New title"),
    author: str = typer.Option(None, "--author", "-a", help="New author"),
    genre: str = typer.Option(None, "--genre", "-g", help="New genre"),
    status: str = typer.Option(None, "--status", "-s", help="New status (in_production, review, complete)"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Update project details and production state."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        payload: dict[str, Any] = {}
        if title: payload["title"] = title.strip()
        if author is not None: payload["author"] = author.strip()
        if genre is not None: payload["genre"] = genre.strip()
        if status: payload["status"] = status.strip()

        if not payload:
            print_error("No fields to update provided.", is_json=json_output)
            raise typer.Exit(1)

        res = client.patch(f"/projects/{resolved_id}", json_data=payload)
        if json_output:
            output_result(res, is_json=True)
        else:
            print_success(f"Project '{resolved_id}' updated successfully.")
    except NovelovaCliError as e:
        print_error(f"Failed to update project: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("delete")
def delete_project(
    project_id: str = typer.Argument(None, help="Project ID (omitted = active project)"),
    force: bool = typer.Option(False, "--force", "-f", help="Bypass confirmation prompt"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Delete a project and all associated chapters, cast assignments, and audio files."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        if not force and not json_output:
            confirm = typer.confirm(f"Are you sure you want to permanently delete project '{resolved_id}'?")
            if not confirm:
                raise typer.Abort()

        res = client.delete(f"/projects/{resolved_id}")
        cfg = load_config()
        if cfg.active_project_id == resolved_id:
            set_active_project(None)

        if json_output:
            output_result(res, is_json=True)
        else:
            print_success(f"Project '{resolved_id}' deleted successfully.")
    except NovelovaCliError as e:
        print_error(f"Failed to delete project: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("select")
def select_project(
    project_id: str = typer.Argument(..., help="Project ID to set as active"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Set the active workspace project for subsequent CLI commands."""
    client = NovelovaClient()
    try:
        # Verify project exists
        data = client.get(f"/projects/{project_id}")
        set_active_project(project_id)
        if json_output:
            output_result({"active_project_id": project_id, "project": data}, is_json=True)
        else:
            print_success(f"Active project set to '{data.get('title')}' ({project_id}).")
    except NovelovaCliError as e:
        print_error(f"Failed to select project: {e.message}", is_json=json_output)
        raise typer.Exit(1)
