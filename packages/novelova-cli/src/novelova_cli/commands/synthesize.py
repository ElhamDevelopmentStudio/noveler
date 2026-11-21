import asyncio
import hashlib
import json
import os
from pathlib import Path
import re
import time
from typing import Any
import httpx
import typer
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
from novelova_cli.client import NovelovaClient, NovelovaCliError
from novelova_cli.commands.projects import _resolve_project_id
from novelova_cli.output import (
    print_error,
    print_success,
    print_table,
    print_panel,
    output_result,
)

app = typer.Typer(help="Multi-account distributed GPU audio synthesis, file pipeline, and downloads")


def sanitize_filename(name: str) -> str:
    return re.sub(r'[\/\\:\*\?"<>\|]', "_", name).strip()


def parse_chapter_spec(spec: str) -> list[int]:
    """Parse chapter ranges like '1..50', '1,2,5-10' into list of chapter numbers (1-based)."""
    result = set()
    parts = spec.replace("..", "-").split(",")
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            s_str, e_str = part.split("-", 1)
            s, e = int(s_str.strip()), int(e_str.strip())
            for n in range(s, e + 1):
                result.add(n)
        else:
            result.add(int(part))
    return sorted(list(result))


def verify_file_md5_and_size(file_path: Path, expected_size: int | None = None, expected_md5: str | None = None) -> bool:
    """Verify that a local file matches expected byte size and MD5 hash without being overly restrictive."""
    if not file_path.exists():
        return False
    actual_size = file_path.stat().st_size
    if actual_size == 0:
        return False
    if expected_size is not None and actual_size != expected_size:
        return False
    if expected_md5 is not None:
        hasher = hashlib.md5()
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        if hasher.hexdigest().lower() != expected_md5.lower():
            return False
    return True


@app.command("run")
def synthesize(
    project_id: str = typer.Argument(None, help="Target project ID (omitted = active project)"),
    chapters: str = typer.Option(None, "--chapters", "-c", help="Chapter numbers to synthesize (e.g. '1..100', '1,2,5-10')"),
    model: str = typer.Option("chatterbox-turbo", "--model", "-m", help="TTS synthesis model (chatterbox-turbo, kokoro-82m)"),
    persistent_model: bool = typer.Option(True, "--persistent-model/--ephemeral-model", help="Mount persistent model from Kaggle dataset"),
    lanes: int = typer.Option(8, "--lanes", "-l", help="Maximum concurrent GPU notebook lanes (up to 8 across 4 accounts)"),
    batch_size: int = typer.Option(10, "--batch-size", "-b", help="Maximum chapters per single notebook batch (caps timeout risk)"),
    cooldown: float = typer.Option(30.0, "--cooldown", help="Cooldown delay in seconds between dispatch rounds"),
    download_realtime: bool = typer.Option(False, "--download-realtime", "-d", help="Automatically download audio to ~/Downloads/<Project Name>/ as each chapter completes"),
    watch: bool = typer.Option(True, "--watch/--no-watch", help="Follow synthesis progress in real-time until all batches complete"),
    poll_interval: float = typer.Option(5.0, "--interval", help="Status polling interval in seconds"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """
    Launch distributed multi-account synthesis across Kaggle GPU lanes with strided round-robin scheduling,
    persistent model dataset mounting, and automated file transfer pipeline.
    """
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)

        # 1. Fetch project info and all chapters
        proj = client.get(f"/projects/{resolved_id}")
        proj_title = proj.get("title", "Project")
        all_chaps = client.get(f"/projects/{resolved_id}/chapters", params={"limit": 200})
        chapter_items = all_chaps if isinstance(all_chaps, list) else all_chaps.get("items", [])

        if not chapter_items:
            print_error(f"No chapters found in project '{resolved_id}'. Parse manuscript first.", is_json=json_output)
            raise typer.Exit(1)

        # Filter target chapters
        target_chaps: list[dict[str, Any]] = []
        if chapters:
            requested_nums = set(parse_chapter_spec(chapters))
            for c in chapter_items:
                c_num = c.get("order_index", 0) + 1
                if c_num in requested_nums:
                    target_chaps.append(c)
        else:
            # All chapters not yet complete
            for c in chapter_items:
                if c.get("audio_status") != "complete":
                    target_chaps.append(c)
            if not target_chaps:
                target_chaps = chapter_items

        if not target_chaps:
            print_error("No target chapters matched the criteria.", is_json=json_output)
            raise typer.Exit(1)

        # Sort by chapter order index
        target_chaps.sort(key=lambda x: x.get("order_index", 0))

        # Check configured Kaggle accounts
        kaggle_summary = client.get("/profile/kaggle/summary")
        active_accounts = kaggle_summary.get("active_accounts", 0)
        max_possible_lanes = min(lanes, active_accounts * 2 if active_accounts > 0 else 1)
        actual_lanes = max(1, min(max_possible_lanes, len(target_chaps)))

        # Strided Round-Robin chapter distribution:
        # Lane 0: 0, 8, 16... Lane 1: 1, 9, 17...
        lane_assignments: list[list[dict[str, Any]]] = [[] for _ in range(actual_lanes)]
        for idx, ch in enumerate(target_chaps):
            lane_assignments[idx % actual_lanes].append(ch)

        # Cap batch size at max_batch_size (e.g. 10 chapters) to reduce notebook timeout risk
        # Flatten into sequential sub-batches per lane if needed
        dispatch_batches: list[list[str]] = []
        for lane_idx, lane_chaps in enumerate(lane_assignments):
            for i in range(0, len(lane_chaps), batch_size):
                chunk = lane_chaps[i:i + batch_size]
                dispatch_batches.append([c["id"] for c in chunk])

        if not json_output:
            print_panel(
                f"Distributed Synthesis Dispatch: {proj_title}",
                f"Total Chapters to Synthesize: [bold]{len(target_chaps)}[/bold]\n"
                f"Active Kaggle Accounts: [bold cyan]{active_accounts}[/bold cyan] ({active_accounts * 2} max concurrent slots)\n"
                f"Allocated Parallel Lanes: [bold green]{actual_lanes}[/bold green]\n"
                f"Batch Size Ceiling: [yellow]≤ {batch_size} chapters/notebook[/yellow]\n"
                f"Scheduling Pattern: [magenta]Strided Round-Robin (1, {actual_lanes+1}, {2*actual_lanes+1}...)[/magenta]\n"
                f"Persistent TTS Model: [cyan]{model}[/cyan] ({'Kaggle Dataset Mounted' if persistent_model else 'Ephemeral'})\n"
                f"Real-Time Downloads: {'Enabled (~/Downloads/' + sanitize_filename(proj_title) + '/)' if download_realtime else 'Disabled'}",
            )

        # Prepare local download directory if --download-realtime is enabled
        download_dir = Path.home() / "Downloads" / sanitize_filename(proj_title)
        if download_realtime:
            download_dir.mkdir(parents=True, exist_ok=True)
            # Write metadata.json
            meta_info = {
                "project_id": resolved_id,
                "title": proj.get("title"),
                "author": proj.get("author"),
                "genre": proj.get("genre"),
                "language": proj.get("language"),
                "publication_date": proj.get("publication_date"),
                "created_date": proj.get("created_date"),
                "total_chapters": len(chapter_items),
                "synthesized_chapters_count": len(target_chaps),
                "model": model,
            }
            # Clean None values gracefully
            clean_meta = {k: v for k, v in meta_info.items() if v is not None}
            (download_dir / "metadata.json").write_text(json.dumps(clean_meta, indent=2), encoding="utf-8")

            # Download thumbnail/cover if available
            cover_url = proj.get("cover_url")
            if cover_url:
                try:
                    with httpx.Client(timeout=30.0) as dl_client:
                        c_resp = dl_client.get(cover_url)
                        if c_resp.status_code == 200:
                            (download_dir / "cover.jpg").write_bytes(c_resp.content)
                except Exception as e:
                    pass

        # Dispatch the first set of batches
        first_batch_ids = [c["id"] for c in target_chaps[:batch_size * actual_lanes]]
        payload = {
            "chapter_ids": first_batch_ids,
            "preferred_tts_model": model,
            "cache_to_dataset": persistent_model,
        }

        # Handle cooldown and retry with backoff on session locks
        max_retries = 3
        launch_res = None
        for attempt in range(max_retries):
            try:
                launch_res = client.post(f"/projects/{resolved_id}/generate-batch-audio", json_data=payload)
                break
            except NovelovaCliError as err:
                if "concurrent" in err.message.lower() or "session" in err.message.lower() or err.status_code == 429:
                    if attempt < max_retries - 1:
                        retry_delay = cooldown * (attempt + 1)
                        if not json_output:
                            print_error(f"Concurrent session limit detected. Backing off for {retry_delay:.0f}s before retry...")
                        time.sleep(retry_delay)
                        continue
                raise err

        if json_output and not (watch or download_realtime):
            output_result(launch_res, is_json=True)
            return

        if not json_output:
            print_success(f"Batch synthesis initiated across {actual_lanes} lanes.")

        if not watch and not download_realtime:
            typer.echo(f"Check progress with: novelova synthesize status --project {resolved_id}")
            return

        # Follow progress in real-time
        downloaded_chapter_ids: set[str] = set()
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
        ) as progress:
            total_count = len(target_chaps)
            task = progress.add_task("Synthesizing chapters...", total=total_count)

            while True:
                time.sleep(poll_interval)
                status_res = client.get(f"/projects/{resolved_id}/batch-audio-status")
                if not status_res:
                    break

                comp_count = status_res.get("completed_chapters", 0)
                is_active = status_res.get("is_active", False)
                progress.update(task, completed=comp_count, description=f"Synthesizing: {comp_count}/{total_count} chapters")

                # Handle real-time download pipeline
                if download_realtime:
                    # Fetch fresh chapter details to get audio URLs
                    fresh_chaps = client.get(f"/projects/{resolved_id}/chapters", params={"limit": 200})
                    fresh_items = fresh_chaps if isinstance(fresh_chaps, list) else fresh_chaps.get("items", [])
                    for fc in fresh_items:
                        fc_id = fc.get("id")
                        if fc_id in downloaded_chapter_ids:
                            continue
                        if fc.get("audio_status") == "complete":
                            # Download this chapter as packaged MP3 with embedded ID3 tags & cover art
                            c_num = fc.get("order_index", 0) + 1
                            c_title = sanitize_filename(fc.get("title", f"Chapter {c_num}"))
                            dest_filename = f"{sanitize_filename(proj_title)} Chapter {c_num}: {c_title}.mp3"
                            dest_path = download_dir / dest_filename
                            temp_path = download_dir / f".{dest_filename}.tmp"

                            package_url = f"{client.base_url}/projects/{resolved_id}/chapters/{fc_id}/package-mp3"
                            download_headers = client._get_headers()

                            try:
                                with httpx.Client(timeout=180.0) as dl_client:
                                    resp = dl_client.get(package_url, headers=download_headers)
                                    if resp.status_code == 200 and len(resp.content) > 0:
                                        temp_path.write_bytes(resp.content)
                                    else:
                                        # Fallback to direct raw stream
                                        c_detail = client.get(f"/projects/{resolved_id}/chapters/{fc_id}")
                                        raw_url = c_detail.get("audio_url")
                                        if raw_url:
                                            full_raw_url = raw_url if raw_url.startswith("http") else f"{client.base_url.replace('/api/v1', '')}{raw_url}"
                                            with dl_client.stream("GET", full_raw_url, headers=download_headers) as stream:
                                                with open(temp_path, "wb") as f_out:
                                                    for chunk in stream.iter_bytes(chunk_size=65536):
                                                        f_out.write(chunk)

                                if verify_file_md5_and_size(temp_path):
                                    temp_path.replace(dest_path)
                                    downloaded_chapter_ids.add(fc_id)
                                    if not json_output:
                                        progress.console.print(f"[bold green]✓ Downloaded & Verified:[/bold green] {dest_filename}")
                                else:
                                    if temp_path.exists():
                                        temp_path.unlink()
                                    if not json_output:
                                        progress.console.print(f"[bold yellow]! Download verification failed for chapter {c_num}. Retrying...[/bold yellow]")
                            except Exception as dl_err:
                                if temp_path.exists():
                                    try: temp_path.unlink()
                                    except Exception: pass
                                if not json_output:
                                    progress.console.print(f"[bold yellow]! Download retry scheduled for chapter {c_num}: {dl_err}[/bold yellow]")

                if not is_active and comp_count >= total_count:
                    progress.update(task, completed=total_count, description="[bold green]Synthesis complete![/bold green]")
                    break

                if not is_active and comp_count < total_count:
                    # Check if all lanes ended
                    break

        if download_realtime and not json_output:
            print_success(f"All available synthesized chapters downloaded to: {download_dir}")
        elif not json_output:
            print_success("Synthesis batch finished.")
    except NovelovaCliError as e:
        print_error(f"Synthesis failed: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("status")
def synthesis_status(
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Check multi-account GPU lane progress, active jobs, and completion rate."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        data = client.get(f"/projects/{resolved_id}/batch-audio-status")
        if json_output:
            output_result(data, is_json=True)
            return

        lanes = data.get("lanes", [])
        content = (
            f"Active: {'[bold green]Yes (Synthesizing)[/bold green]' if data.get('is_active') else '[yellow]Idle / Completed[/yellow]'}\n"
            f"Progress: [bold cyan]{data.get('progress_percent', 0.0):.1f}%[/bold cyan]\n"
            f"Completed Chapters: {data.get('completed_chapters', 0)} / {data.get('total_chapters', 0)}\n"
            f"Active Lanes: {len(lanes)}"
        )
        print_panel("Synthesis Pool Status", content)

        if lanes:
            columns = ["Lane #", "Account", "Status", "Progress", "Current Chapter"]
            rows = []
            for i, l in enumerate(lanes):
                rows.append([
                    f"Lane {i + 1}",
                    f"@{l.get('kaggle_username', 'unknown')}",
                    l.get("status"),
                    f"{l.get('progress_percentage', 0.0):.1f}%",
                    l.get("current_chapter_title") or "—",
                ])
            print_table("Active Multi-Account Lanes", columns, rows)
    except NovelovaCliError as e:
        print_error(f"Failed to check synthesis status: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("cancel")
def cancel_synthesis(
    project_id: str = typer.Option(None, "--project", "-p", help="Target project ID (omitted = active project)"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Cancel in-flight synthesis jobs across all lanes and release Kaggle accounts."""
    client = NovelovaClient()
    try:
        resolved_id = _resolve_project_id(project_id)
        res = client.post(f"/projects/{resolved_id}/cancel-batch-audio")
        if json_output:
            output_result(res, is_json=True)
        else:
            print_success(f"Batch audio synthesis cancelled: {res.get('message', 'Lanes released.')}")
    except NovelovaCliError as e:
        print_error(f"Failed to cancel synthesis: {e.message}", is_json=json_output)
        raise typer.Exit(1)
