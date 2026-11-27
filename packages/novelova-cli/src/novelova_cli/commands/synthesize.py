import asyncio
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import threading
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


def _colab_env_for_profile(profile: str) -> dict[str, str]:
    """Build isolated environment variables for a named Google Colab Pro profile."""
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    clean = (profile or "default").strip()
    if clean and clean.lower() != "default":
        prof_dir = Path.home() / ".novelova" / "colab_profiles" / clean
        (prof_dir / ".config" / "colab-cli").mkdir(parents=True, exist_ok=True)
        env["USERPROFILE"] = str(prof_dir)
        env["HOME"] = str(prof_dir)
        env["PYTHON_KEYRING_BACKEND"] = "keyring.backends.fail.Keyring"
    return env


def _run_colab_worker_thread(
    job_id: str,
    worker_script: str,
    profile: str,
    gpu: str,
    console: Any = None,
) -> None:
    """Provision a Colab Pro GPU session, execute worker_script, and always stop the VM afterward."""
    session_name = f"novelova_{job_id[:8]}"
    env = _colab_env_for_profile(profile)
    fallback_gpu = "L4" if gpu.upper() == "T4" else "T4"
    tmp_dir = tempfile.mkdtemp(prefix=f"novelova_colab_{job_id[:8]}_")
    script_path = Path(tmp_dir) / "worker.py"
    script_path.write_text(worker_script, encoding="utf-8")

    created = False
    try:
        res = subprocess.run(
            ["colab", "new", "--gpu", gpu.upper(), "-s", session_name],
            env=env,
            capture_output=True,
            text=True,
        )
        if res.returncode != 0:
            if console:
                console.print(f"[yellow]! Colab [{profile}] {gpu.upper()} unavailable, falling back to {fallback_gpu}...[/yellow]")
            res = subprocess.run(
                ["colab", "new", "--gpu", fallback_gpu, "-s", session_name],
                env=env,
                capture_output=True,
                text=True,
            )
        if res.returncode != 0:
            if console:
                console.print(f"[bold red]✗ Colab [{profile}] failed to provision GPU: {(res.stderr or res.stdout)[:200]}[/bold red]")
            return
        created = True
        if console:
            console.print(f"[bold cyan]→ Colab [{profile}] session '{session_name}' READY — synthesizing...[/bold cyan]")
        exec_res = subprocess.run(
            ["colab", "exec", "-s", session_name, "--timeout", "0", "-f", str(script_path)],
            env=env,
            capture_output=True,
            text=True,
        )
        if exec_res.returncode != 0 and console:
            console.print(f"[yellow]! Colab [{profile}] '{session_name}' exited ({exec_res.returncode}): {(exec_res.stderr or exec_res.stdout)[-200:]}[/yellow]")
    except Exception as exc:
        if console:
            console.print(f"[bold red]✗ Colab [{profile}] error: {exc}[/bold red]")
    finally:
        if created:
            subprocess.run(["colab", "stop", "-s", session_name], env=env, capture_output=True, text=True)
            if console:
                console.print(f"[dim]Colab [{profile}] session '{session_name}' stopped.[/dim]")
        try:
            script_path.unlink(missing_ok=True)
            Path(tmp_dir).rmdir()
        except Exception:
            pass


@app.command("colab-login")
def colab_login(
    profile: str = typer.Argument("acct2", help="Named Colab Pro profile (e.g. 'acct2'; 'default' uses main colab login)"),
) -> None:
    """Authenticate an additional Google Colab Pro account under an isolated profile name."""
    env = _colab_env_for_profile(profile)
    clean = (profile or "default").strip()
    if clean.lower() == "default":
        res = subprocess.run(["colab", "usage"], env=env)
        if res.returncode != 0:
            raise typer.Exit(res.returncode)
        return

    # Save OAuth token directly to the isolated profile's token.json so it never collides with Account 1's OS keyring
    prof_dir = Path.home() / ".novelova" / "colab_profiles" / clean
    tok_path = prof_dir / ".config" / "colab-cli" / "token.json"
    tok_path.parent.mkdir(parents=True, exist_ok=True)

    # Locate the python executable inside google-colab-cli's tool venv
    colab_exe = subprocess.run(["where" if os.name == "nt" else "which", "colab"], capture_output=True, text=True).stdout.strip().splitlines()
    colab_python = None
    if colab_exe:
        cand = Path(colab_exe[0]).parent / ("python.exe" if os.name == "nt" else "python")
        if cand.exists():
            colab_python = str(cand)
        else:
            cand2 = Path.home() / "AppData" / "Roaming" / "uv" / "tools" / "google-colab-cli" / "Scripts" / "python.exe"
            if cand2.exists():
                colab_python = str(cand2)

    if not colab_python:
        print_error("Could not locate google-colab-cli Python runtime. Install with: uv tool install google-colab-cli")
        raise typer.Exit(1)

    auth_helper = (
        "import json, pathlib; from importlib import resources; "
        "from colab_cli.auth import _run_remote_flow; "
        "cfg = json.loads(resources.files('colab_cli').joinpath('oauth_config.json').read_text()); "
        "creds = _run_remote_flow(cfg); "
        f"p = pathlib.Path(r'{tok_path}'); p.parent.mkdir(parents=True, exist_ok=True); "
        "p.write_text(creds.to_json(), encoding='utf-8'); "
        "print('Saved isolated Colab OAuth token to', p)"
    )
    typer.echo(f"Launching isolated Google Colab OAuth for profile '{clean}'...")
    res = subprocess.run([colab_python, "-c", auth_helper], env=env)
    if res.returncode != 0:
        print_error(f"Colab login failed for profile '{clean}' (exit code {res.returncode}).")
        raise typer.Exit(res.returncode)

    # Verify live balance immediately!
    verify = subprocess.run(["colab", "usage"], env=env)
    if verify.returncode == 0:
        print_success(f"Colab Pro profile '{clean}' authenticated & verified! Use with: --colab-profiles default,{clean}")
    else:
        print_error(f"Token saved, but 'colab usage' verification failed for '{clean}'.")
        raise typer.Exit(verify.returncode)


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
    model: str = typer.Option("cosyvoice-3", "--model", "-m", help="TTS synthesis model (cosyvoice-3, indextts-2.5, chatterbox-turbo, kokoro-82m)"),
    backend: str = typer.Option("kaggle", "--backend", help="GPU execution backend: 'kaggle', 'colab', or 'hybrid' (Kaggle + Colab Pro in parallel)"),
    colab_gpu: str = typer.Option("T4", "--colab-gpu", help="Google Colab Pro GPU type (T4, L4, A100)"),
    colab_profiles: str = typer.Option("default", "--colab-profiles", help="Comma-separated Colab Pro profiles (e.g. 'default,acct2')"),
    persistent_model: bool = typer.Option(True, "--persistent-model/--ephemeral-model", help="Mount persistent model from Kaggle dataset"),
    lanes: int = typer.Option(8, "--lanes", "-l", help="Maximum concurrent GPU notebook lanes"),
    batch_size: int = typer.Option(10, "--batch-size", "-b", help="Maximum chapters per single notebook batch (caps timeout risk)"),
    cooldown: float = typer.Option(30.0, "--cooldown", help="Cooldown delay in seconds between dispatch rounds"),
    download_realtime: bool = typer.Option(False, "--download-realtime", "-d", help="Automatically download audio to ~/Downloads/<Project Name>/ as each chapter completes"),
    watch: bool = typer.Option(True, "--watch/--no-watch", help="Follow synthesis progress in real-time until all batches complete"),
    poll_interval: float = typer.Option(15.0, "--interval", help="Status polling interval in seconds"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """
    Launch distributed multi-account synthesis across Kaggle and/or Google Colab Pro GPU lanes
    with strided round-robin scheduling and real-time MP3 downloads.
    """
    client = NovelovaClient()
    backend_l = (backend or "kaggle").strip().lower()
    if backend_l not in ("kaggle", "colab", "hybrid"):
        print_error(f"Invalid --backend '{backend}'. Choose 'kaggle', 'colab', or 'hybrid'.", is_json=json_output)
        raise typer.Exit(1)

    colab_profile_list = [p.strip() for p in (colab_profiles or "default").split(",") if p.strip()]
    if not colab_profile_list:
        colab_profile_list = ["default"]

    try:
        resolved_id = _resolve_project_id(project_id)

        # 1. Fetch project info and all chapters
        proj = client.get(f"/projects/{resolved_id}")
        proj_title = proj.get("title", "Project")
        all_chaps = client.get(f"/projects/{resolved_id}/chapters")
        chapter_items = all_chaps if isinstance(all_chaps, list) else all_chaps.get("items", [])

        if not chapter_items:
            print_error(f"No chapters found in project '{resolved_id}'. Parse manuscript first.", is_json=json_output)
            raise typer.Exit(1)

        # Filter target chapters
        target_chaps: list[dict[str, Any]] = []
        if chapters:
            requested_nums = set(parse_chapter_spec(chapters))
            for c in chapter_items:
                c_num = c.get("chapter_number") or (c.get("order_index", 0) + 1)
                if c_num in requested_nums:
                    target_chaps.append(c)
        else:
            # All chapters not yet complete
            for c in chapter_items:
                if c.get("audio_job_status") != "complete" and c.get("status") != "complete":
                    target_chaps.append(c)
            if not target_chaps:
                target_chaps = chapter_items

        if not target_chaps:
            print_error("No target chapters matched the criteria.", is_json=json_output)
            raise typer.Exit(1)

        # Sort by chapter_number / order_index
        target_chaps.sort(key=lambda x: x.get("chapter_number") or (x.get("order_index", 0) + 1))

        # Determine available lanes across Kaggle and/or Colab Pro
        kaggle_lanes = 0
        colab_lanes = 0
        active_kaggle_accounts = 0
        if backend_l in ("kaggle", "hybrid"):
            kaggle_summary = client.get("/profile/kaggle/summary")
            active_kaggle_accounts = kaggle_summary.get("available_accounts", 0) or kaggle_summary.get("active_accounts", 0)
            kaggle_lanes = active_kaggle_accounts * 2 if active_kaggle_accounts > 0 else (1 if backend_l == "kaggle" else 0)
        if backend_l in ("colab", "hybrid"):
            colab_lanes = len(colab_profile_list)

        total_lanes = max(1, min(lanes, kaggle_lanes + colab_lanes, len(target_chaps)))
        if backend_l == "hybrid":
            actual_colab_lanes = min(colab_lanes, total_lanes)
            actual_kaggle_lanes = max(0, total_lanes - actual_colab_lanes)
        elif backend_l == "colab":
            actual_colab_lanes = total_lanes
            actual_kaggle_lanes = 0
        else:
            actual_kaggle_lanes = total_lanes
            actual_colab_lanes = 0

        actual_lanes = max(1, actual_kaggle_lanes + actual_colab_lanes)
        wave_size = max(1, batch_size * actual_lanes)
        waves: list[list[dict[str, Any]]] = [
            target_chaps[i:i + wave_size] for i in range(0, len(target_chaps), wave_size)
        ]

        if not json_output:
            print_panel(
                f"Distributed Synthesis Dispatch: {proj_title}",
                f"Total Chapters to Synthesize: [bold]{len(target_chaps)}[/bold] ({len(waves)} wave(s) of up to {wave_size} chapters)\n"
                f"GPU Backend: [bold magenta]{backend_l.upper()}[/bold magenta] "
                f"(Kaggle lanes: [cyan]{actual_kaggle_lanes}[/cyan], Colab Pro lanes: [green]{actual_colab_lanes}[/green] [{colab_gpu.upper()} via {', '.join(colab_profile_list[:actual_colab_lanes]) if actual_colab_lanes else 'none'}])\n"
                f"Batch Size Ceiling: [yellow]≤ {batch_size} chapters/notebook[/yellow]\n"
                f"TTS Model: [cyan]{model}[/cyan] ({'Kaggle Dataset Mounted' if persistent_model else 'Ephemeral HuggingFace'})\n"
                f"Real-Time Downloads: {'Enabled (~/Downloads/' + sanitize_filename(proj_title) + '/)' if download_realtime else 'Disabled'}",
            )

        # Prepare local download directory if --download-realtime is enabled
        download_dir = Path.home() / "Downloads" / sanitize_filename(proj_title)
        if download_realtime:
            download_dir.mkdir(parents=True, exist_ok=True)
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
            clean_meta = {k: v for k, v in meta_info.items() if v is not None}
            (download_dir / "metadata.json").write_text(json.dumps(clean_meta, indent=2), encoding="utf-8")

            cover_url = proj.get("cover_url")
            if cover_url:
                try:
                    with httpx.Client(timeout=30.0) as dl_client:
                        c_resp = dl_client.get(cover_url)
                        if c_resp.status_code == 200:
                            (download_dir / "cover.jpg").write_bytes(c_resp.content)
                except Exception:
                    pass

        def _download_chapter(fc: dict[str, Any], console: Any) -> bool:
            fc_id = fc.get("id")
            c_num = fc.get("chapter_number") or (fc.get("order_index", 0) + 1)
            raw_title = fc.get("title") or f"Chapter {c_num}"
            dest_filename = sanitize_filename(f"{proj_title} - Ch {c_num:04d} - {raw_title}.mp3")
            dest_path = download_dir / dest_filename
            temp_path = download_dir / f".{dest_filename}.tmp"

            if dest_path.exists() and dest_path.stat().st_size > 0:
                return True

            package_url = f"{client.base_url}/projects/{resolved_id}/chapters/{fc_id}/package-mp3"
            download_headers = client._get_headers()

            try:
                with httpx.Client(timeout=180.0, follow_redirects=True) as dl_client:
                    resp = dl_client.get(package_url, headers=download_headers)
                    if resp.status_code == 200 and len(resp.content) > 0:
                        temp_path.write_bytes(resp.content)
                    else:
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
                    if not json_output and console:
                        console.print(f"[bold green]✓ Downloaded & Verified:[/bold green] {dest_filename}")
                    return True
                else:
                    if temp_path.exists():
                        temp_path.unlink()
                    if not json_output and console:
                        console.print(f"[bold yellow]! Download verification failed for chapter {c_num}. Retrying...[/bold yellow]")
                    return False
            except Exception as dl_err:
                if temp_path.exists():
                    try:
                        temp_path.unlink()
                    except Exception:
                        pass
                if not json_output and console:
                    console.print(f"[bold yellow]! Download retry scheduled for chapter {c_num}: {dl_err}[/bold yellow]")
                return False

        active_colab_threads: list[threading.Thread] = []

        def _dispatch_wave(wave_ids: list[str], console: Any = None) -> Any:
            nonlocal active_colab_threads
            active_colab_threads = [t for t in active_colab_threads if t.is_alive()]

            # Split wave chapters across Kaggle lanes and Colab Pro lanes proportionally
            kaggle_ids: list[str] = []
            colab_buckets: list[list[str]] = [[] for _ in range(actual_colab_lanes)]

            if actual_kaggle_lanes > 0 and actual_colab_lanes > 0:
                total_slots = actual_kaggle_lanes + actual_colab_lanes
                for idx_c, cid in enumerate(wave_ids):
                    slot = idx_c % total_slots
                    if slot < actual_kaggle_lanes:
                        kaggle_ids.append(cid)
                    else:
                        colab_buckets[slot - actual_kaggle_lanes].append(cid)
            elif actual_colab_lanes > 0:
                for idx_c, cid in enumerate(wave_ids):
                    colab_buckets[idx_c % actual_colab_lanes].append(cid)
            else:
                kaggle_ids = list(wave_ids)

            res_summary: dict[str, Any] = {"kaggle": None, "colab_jobs": []}

            if kaggle_ids:
                payload = {
                    "chapter_ids": kaggle_ids,
                    "preferred_tts_model": model,
                    "cache_to_dataset": persistent_model,
                }
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        res_summary["kaggle"] = client.post(
                            f"/projects/{resolved_id}/generate-batch-audio", json_data=payload
                        )
                        break
                    except NovelovaCliError as err:
                        if "concurrent" in err.message.lower() or "session" in err.message.lower() or err.status_code == 429:
                            if attempt < max_retries - 1:
                                retry_delay = cooldown * (attempt + 1)
                                if not json_output:
                                    print_error(f"Concurrent session limit detected. Backing off for {retry_delay:.0f}s before retry...")
                                time.sleep(retry_delay)
                                continue
                        if actual_colab_lanes > 0 and "quota" in err.message.lower():
                            # Automatically spill Kaggle chapters into Colab Pro lanes if Kaggle quota ran out!
                            if not json_output:
                                print_error(f"Kaggle quota exhausted — spilling {len(kaggle_ids)} chapters onto Colab Pro lanes.")
                            for idx_s, cid in enumerate(kaggle_ids):
                                colab_buckets[idx_s % actual_colab_lanes].append(cid)
                            break
                        raise err

            for c_idx, bucket_ids in enumerate(colab_buckets):
                if not bucket_ids:
                    continue
                prof_name = colab_profile_list[c_idx % len(colab_profile_list)]
                prep = client.post(
                    f"/projects/{resolved_id}/prepare-worker-job",
                    json_data={
                        "chapter_ids": bucket_ids,
                        "preferred_tts_model": model,
                        "worker_label": f"colab-{prof_name}",
                        "lane_index": actual_kaggle_lanes + c_idx,
                        "cache_to_dataset": False,
                    },
                )
                job_id = prep["job_id"]
                worker_script = prep["worker_script"]
                res_summary["colab_jobs"].append({"job_id": job_id, "profile": prof_name, "chapters": len(bucket_ids)})
                t = threading.Thread(
                    target=_run_colab_worker_thread,
                    args=(job_id, worker_script, prof_name, colab_gpu, console),
                    daemon=True,
                )
                t.start()
                active_colab_threads.append(t)

            return res_summary

        # Check if a wave is already active on the backend so we can resume/attach cleanly
        existing_status = None
        try:
            existing_status = client.get(f"/projects/{resolved_id}/batch-audio-status")
        except Exception:
            existing_status = None

        already_active = bool(existing_status and existing_status.get("is_active"))
        if already_active:
            launch_res = existing_status
            if not json_output:
                print_success("Detected active synthesis lanes on server — attaching watcher & real-time downloader to in-flight wave.")
        else:
            # Dispatch wave 1 immediately
            launch_res = _dispatch_wave([c["id"] for c in waves[0]])

            if json_output and not (watch or download_realtime):
                output_result(launch_res, is_json=True)
                return

            if not json_output:
                w0_first = waves[0][0].get("chapter_number") or (waves[0][0].get("order_index", 0) + 1)
                w0_last = waves[0][-1].get("chapter_number") or (waves[0][-1].get("order_index", 0) + 1)
                print_success(f"Wave 1/{len(waves)} initiated (Ch {w0_first}..{w0_last}, {len(waves[0])} chapters) across {actual_lanes} lanes.")

        if not watch and not download_realtime:
            typer.echo(f"Check progress with: novelova synthesize status --project {resolved_id}")
            return

        # Follow progress in real-time across ALL waves
        downloaded_chapter_ids: set[str] = set()
        completed_target_ids: set[str] = set()
        total_count = len(target_chaps)

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
        ) as progress:
            task = progress.add_task(f"Synthesizing Wave 1/{len(waves)}...", total=total_count)

            for wave_idx, wave_chaps in enumerate(waves):
                wave_ids = {c["id"] for c in wave_chaps}
                w_first = wave_chaps[0].get("chapter_number") or (wave_chaps[0].get("order_index", 0) + 1)
                w_last = wave_chaps[-1].get("chapter_number") or (wave_chaps[-1].get("order_index", 0) + 1)

                if wave_idx > 0:
                    if cooldown > 0:
                        time.sleep(cooldown)
                    _dispatch_wave([c["id"] for c in wave_chaps], console=progress.console)
                    if not json_output:
                        progress.console.print(
                            f"[bold cyan]→ Dispatched Wave {wave_idx + 1}/{len(waves)} (Ch {w_first}..{w_last}, {len(wave_chaps)} chapters)[/bold cyan]"
                        )

                consecutive_poll_errors = 0
                while True:
                    time.sleep(poll_interval)
                    try:
                        status_res = client.get(f"/projects/{resolved_id}/batch-audio-status")
                        colab_alive = any(t.is_alive() for t in active_colab_threads)
                        is_active = bool(status_res and status_res.get("is_active", False)) or colab_alive

                        # Fetch fresh chapter states for this wave
                        fresh_chaps = client.get(f"/projects/{resolved_id}/chapters")
                        fresh_items = fresh_chaps if isinstance(fresh_chaps, list) else fresh_chaps.get("items", [])
                        consecutive_poll_errors = 0
                    except (NovelovaCliError, httpx.RequestError, Exception) as poll_err:
                        consecutive_poll_errors += 1
                        if not json_output and consecutive_poll_errors in (1, 5, 15):
                            progress.console.print(
                                f"[bold yellow]! Transient network error while polling (attempt {consecutive_poll_errors}): {poll_err}. Retrying...[/bold yellow]"
                            )
                        continue

                    wave_done_count = 0
                    for fc in fresh_items:
                        fc_id = fc.get("id")
                        if fc_id not in wave_ids:
                            continue
                        is_ch_done = (fc.get("audio_job_status") == "complete") or (fc.get("status") == "complete" and bool(fc.get("audio_url")))
                        if is_ch_done:
                            wave_done_count += 1
                            completed_target_ids.add(fc_id)
                            if download_realtime and fc_id not in downloaded_chapter_ids:
                                if _download_chapter(fc, progress.console):
                                    downloaded_chapter_ids.add(fc_id)

                    progress.update(
                        task,
                        completed=len(completed_target_ids),
                        description=f"Wave {wave_idx + 1}/{len(waves)} (Ch {w_first}..{w_last}): {len(completed_target_ids)}/{total_count} done, {len(downloaded_chapter_ids)} downloaded",
                    )

                    if wave_done_count >= len(wave_ids):
                        # Ensure all chapters in this wave finished downloading before moving to next wave
                        if not download_realtime or wave_ids.issubset(downloaded_chapter_ids):
                            break

                    if not is_active and wave_done_count < len(wave_ids):
                        # Wave stopped without finishing all chapters (e.g. quota exhausted or error)
                        if not json_output:
                            progress.console.print(
                                f"[bold yellow]! Wave {wave_idx + 1}/{len(waves)} ended with {wave_done_count}/{len(wave_ids)} complete.[/bold yellow]"
                            )
                        break

                # If wave exited because pool became inactive/exhausted, stop dispatching further waves
                if wave_done_count < len(wave_ids):
                    break

            progress.update(task, completed=len(completed_target_ids), description="[bold green]Synthesis run finished![/bold green]")

        if download_realtime and not json_output:
            print_success(f"Downloaded {len(downloaded_chapter_ids)} chapters to: {download_dir}")
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
