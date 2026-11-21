from typing import Any
import typer
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
import time
from novelova_cli.client import NovelovaClient, NovelovaCliError
from novelova_cli.commands.projects import _resolve_project_id
from novelova_cli.output import (
    print_error,
    print_success,
    print_table,
    print_panel,
    output_result,
)

app = typer.Typer(help="Chapter inspection, script segment review, and Stage B tagging")


@app.command("list")
def list_chapters(
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    search: str = typer.Option(None, "--search", "-s", help="Search by title or chapter number"),
    limit: int = typer.Option(100, "--limit", "-n", help="Number of chapters to fetch"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """List all chapters in the active or specified project."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        params: dict[str, Any] = {"limit": limit}
        if search:
            params["search"] = search
        data = client.get(f"/projects/{resolved_id}/chapters", params=params)

        items = data if isinstance(data, list) else data.get("items", [])
        if json_output:
            output_result(items, is_json=True)
            return

        columns = ["#", "Chapter ID", "Title", "Words", "Segments", "Tagged", "Audio Status"]
        rows = []
        for c in items:
            rows.append([
                c.get("order_index", 0) + 1,
                c.get("id"),
                c.get("title"),
                c.get("total_words", 0),
                c.get("segment_count", 0),
                "✓" if c.get("is_tagged") else "✗",
                c.get("audio_status") or "pending",
            ])
        print_table(f"Chapters for Project {resolved_id}", columns, rows)
    except NovelovaCliError as e:
        print_error(f"Failed to list chapters: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("show")
def show_chapter(
    chapter_id: str = typer.Argument(..., help="Chapter ID"),
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    limit_segments: int = typer.Option(20, "--limit-segments", "-l", help="Number of script segments to display"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """View chapter details and script segments with dialogue and speaker attributions."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        data = client.get(f"/projects/{resolved_id}/chapters/{chapter_id}")
        if json_output:
            output_result(data, is_json=True)
            return

        segments = data.get("segments", [])
        content = (
            f"Title: [bold]{data.get('title')}[/bold]\n"
            f"Order: Chapter #{data.get('order_index', 0) + 1}\n"
            f"Words: {data.get('total_words', 0):,}\n"
            f"Tagged: {'✓ Yes' if data.get('is_tagged') else '✗ No'}\n"
            f"Audio Status: [cyan]{data.get('audio_status') or 'pending'}[/cyan]\n"
            f"Total Segments: {len(segments)}"
        )
        print_panel(f"Chapter Detail: {chapter_id}", content)

        if segments:
            preview_segments = segments[:limit_segments]
            columns = ["#", "Speaker", "Delivery", "Text"]
            rows = []
            for s in preview_segments:
                speaker = s.get("speaker") or "Narrator"
                delivery = s.get("delivery_type") or "narration"
                txt = s.get("text", "")
                if len(txt) > 80:
                    txt = txt[:77] + "..."
                rows.append([s.get("order_index", 0), speaker, delivery, txt])
            print_table(f"Script Segments (Showing first {len(preview_segments)} of {len(segments)})", columns, rows)
    except NovelovaCliError as e:
        print_error(f"Failed to show chapter: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("tag")
def tag_chapters(
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    start_chapter: int = typer.Option(None, "--start", "-s", help="Start chapter number (1-based)"),
    end_chapter: int = typer.Option(None, "--end", "-e", help="End chapter number (1-based)"),
    chapter_ids: list[str] = typer.Option(None, "--id", help="Specific chapter ID(s) to tag"),
    resume: bool = typer.Option(True, "--resume/--no-resume", help="Resume and skip already tagged chapters"),
    force: bool = typer.Option(False, "--force", "-f", help="Force re-tagging of already tagged chapters"),
    offline: bool = typer.Option(False, "--offline", help="Use local fast heuristics without external LLM"),
    watch: bool = typer.Option(True, "--watch/--no-watch", help="Follow job progress in real-time until completion"),
    poll_interval: float = typer.Option(2.0, "--interval", help="Polling interval in seconds"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Launch Stage B character and dialogue attribution (LLM or heuristic)."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        payload = {
            "resume": resume,
            "force": force,
            "allow_offline_heuristic": offline,
            "start_chapter": start_chapter,
            "end_chapter": end_chapter,
            "chapter_ids": chapter_ids if chapter_ids else None,
        }

        job = client.post(f"/projects/{resolved_id}/tag", json_data=payload)
        job_id = job.get("id")

        if not watch or json_output:
            if json_output:
                output_result(job, is_json=True)
            else:
                print_success(f"Stage B tagging job enqueued (Job ID: {job_id}).")
                typer.echo(f"Check status with: novelova chapters tag-status --project {resolved_id}")
            return

        # Interactive progress watching
        print_success(f"Stage B tagging job started (Job ID: {job_id}). Following progress...")
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
        ) as progress:
            task = progress.add_task("Tagging chapters...", total=100)
            while True:
                time.sleep(poll_interval)
                status_res = client.get(f"/projects/{resolved_id}/tag/status")
                if not status_res:
                    break
                pct = status_res.get("progress_percentage", 0)
                state = status_res.get("status", "running")
                current_chap = status_res.get("current_chapter_title") or ""
                desc = f"Tagging: {current_chap}" if current_chap else f"Status: {state}"
                progress.update(task, completed=pct, description=desc)

                if state in ("completed", "failed", "cancelled"):
                    if state == "completed":
                        progress.update(task, completed=100, description="[bold green]Tagging completed![/bold green]")
                        print_success("Stage B dialogue and character tagging completed successfully.")
                    elif state == "failed":
                        err = status_res.get("error_message") or "Unknown error"
                        print_error(f"Tagging job failed: {err}")
                        raise typer.Exit(1)
                    else:
                        print_error("Tagging job was cancelled.")
                    break
    except NovelovaCliError as e:
        print_error(f"Failed to start tagging: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("tag-status")
def tag_status(
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Check the real-time status and metrics of the latest Stage B tagging job."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        data = client.get(f"/projects/{resolved_id}/tag/status")
        if json_output:
            output_result(data, is_json=True)
            return

        if not data:
            print_panel("Stage B Tagging Status", "No tagging jobs found for this project.")
            return

        pct = data.get("progress_percentage", 0)
        content = (
            f"Job ID: {data.get('id')}\n"
            f"Status: [bold cyan]{data.get('status')}[/bold cyan]\n"
            f"Progress: [bold green]{pct:.1f}%[/bold green]\n"
            f"Current Chapter: {data.get('current_chapter_title') or '—'}\n"
            f"Tagged Chapters: {data.get('completed_chapters', 0)} / {data.get('total_chapters', 0)}\n"
            f"Total Segments Tagged: {data.get('completed_segments', 0)}\n"
            f"Started At: {data.get('created_at')}\n"
            f"Completed At: {data.get('completed_at') or '—'}\n"
            f"Error: {data.get('error_message') or 'None'}"
        )
        print_panel("Stage B Tagging Status", content)
    except NovelovaCliError as e:
        print_error(f"Failed to check tag status: {e.message}", is_json=json_output)
        raise typer.Exit(1)
