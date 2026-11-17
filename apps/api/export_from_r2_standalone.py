import asyncio
import json
import os
import re
import sys
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import settings
from app.services.attachment import get_s3_client
from mutagen.id3 import ID3, APIC, COMM, TALB, TCON, TDRC, TIT2, TPE1, TRCK
from mutagen.mp3 import MP3

sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)

PROJECT_TITLE = "The Villain Wants to Live"
AUTHOR = "Novelova"
GENRE = "Fantasy/Fiction"
TOTAL_BOOK_CHAPTERS = 130
DOWNLOAD_DIR = Path.home() / "Downloads" / "The Villain Wants to Live"

COVER_IMAGE_KEY = "attachments/50796cc6-9d8a-40b9-8803-568aaffb91cb/The_Villain_Wants_to_Live_cover.jpeg"

# Mapping of DB Chapter Number -> (Job ID, Safe Title, Novel Chapter Number)
CHAPTER_SPECS = {
    # Lane 0 (Job: 4b2897aa-f252-44ec-a161-4794129f1fa8)
    116: ("4b2897aa-f252-44ec-a161-4794129f1fa8", "Chapter 117: Sophien (three)", 117),
    118: ("4b2897aa-f252-44ec-a161-4794129f1fa8", "Chapter 119: Story (two)", 119),
    120: ("4b2897aa-f252-44ec-a161-4794129f1fa8", "Chapter 121: The Hearing (one)", 121),
    122: ("4b2897aa-f252-44ec-a161-4794129f1fa8", "Chapter 123: The Hearing (three)", 123),
    124: ("4b2897aa-f252-44ec-a161-4794129f1fa8", "Chapter 125: Phantom’s Island. (two)", 125),
    126: ("4b2897aa-f252-44ec-a161-4794129f1fa8", "Chapter 127: Mist. (one)", 127),
    128: ("4b2897aa-f252-44ec-a161-4794129f1fa8", "Chapter 129: Mist. (three)", 129),

    # Lane 1 (Job: eb33f788-81b3-4844-8348-98a4c0bc0558)
    117: ("eb33f788-81b3-4844-8348-98a4c0bc0558", "Chapter 118: Story (one)", 118),
    119: ("eb33f788-81b3-4844-8348-98a4c0bc0558", "Chapter 120: Story (three)", 120),
    121: ("eb33f788-81b3-4844-8348-98a4c0bc0558", "Chapter 122: The Hearing (two)", 122),
    123: ("eb33f788-81b3-4844-8348-98a4c0bc0558", "Chapter 124: Phantom’s Island. (one)", 124),
    125: ("eb33f788-81b3-4844-8348-98a4c0bc0558", "Chapter 126: Phantom’s Island (three)", 126),
    127: ("eb33f788-81b3-4844-8348-98a4c0bc0558", "Chapter 128: Mist (two)", 128),
    129: ("eb33f788-81b3-4844-8348-98a4c0bc0558", "Chapter 130: Missa. (one)", 130),
}

def find_ffmpeg():
    # Check standard path or PATH
    import shutil
    p = shutil.which("ffmpeg")
    if p:
        return p
    # Check local tools or chocolatey/scoop/winget
    candidates = [
        Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages",
        Path("C:/ProgramData/chocolatey/bin/ffmpeg.exe"),
        Path("C:/ffmpeg/bin/ffmpeg.exe"),
    ]
    for c in candidates:
        if c.exists():
            if c.is_file():
                return str(c)
            found = list(c.glob("**/ffmpeg.exe"))
            if found:
                return str(found[0])
    return "ffmpeg"

async def main():
    print(f"Target Destination: {DOWNLOAD_DIR}")
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

    s3 = get_s3_client()
    ffmpeg_bin = find_ffmpeg()
    print(f"FFmpeg binary: {ffmpeg_bin}")

    # 1. Fetch cover art from R2
    cover_bytes = None
    try:
        print(f"Fetching cover image from R2 key: {COVER_IMAGE_KEY}...")
        resp = s3.get_object(Bucket=settings.R2_BUCKET, Key=COVER_IMAGE_KEY)
        cover_bytes = resp['Body'].read()
        print(f"Fetched cover art: {len(cover_bytes)} bytes")
    except Exception as e:
        print(f"Warning: Could not fetch cover art: {e}")

    total_chapters = len(CHAPTER_SPECS)
    completed_chapters = set()

    # Pre-check what is already in Downloads
    for db_ch, (j_id, title, novel_ch) in CHAPTER_SPECS.items():
        clean_title = title.replace(":", " -")
        clean_title = re.sub(r'[\\/*?"<>|]', "", clean_title)
        clean_title = re.sub(r"\s+", " ", clean_title).strip()
        expected_path = DOWNLOAD_DIR / f"{PROJECT_TITLE} - {clean_title}.mp3"
        if expected_path.exists() and expected_path.stat().st_size > 1024 * 1024:
            print(f"  [Already Downloaded] {expected_path.name}")
            completed_chapters.add(db_ch)

    print(f"\nMonitoring / Downloading {total_chapters - len(completed_chapters)} remaining chapters from Cloudflare R2...")

    for db_ch, (job_id, safe_title, novel_ch_num) in sorted(CHAPTER_SPECS.items()):
        if db_ch in completed_chapters:
            continue

        receipt_key = f"jobs/{job_id}/receipts/ch_{db_ch}_complete.json"
        try:
            receipt_resp = s3.get_object(Bucket=settings.R2_BUCKET, Key=receipt_key)
            receipt_data = json.loads(receipt_resp['Body'].read().decode('utf-8'))
        except Exception:
            print(f"  [Pending] Ch {novel_ch_num} (DB {db_ch}) receipt not yet found on R2.")
            continue

        audio_key = receipt_data.get('audio_key')
        dur = receipt_data.get('duration_seconds', 0)
        print(f"\n[RECEIPT FOUND] Ch {novel_ch_num}: '{safe_title}' (Duration: {dur}s, Audio Key: {audio_key})")

        print(f"  Downloading master WAV from R2 ({audio_key})...")
        audio_resp = s3.get_object(Bucket=settings.R2_BUCKET, Key=audio_key)
        wav_bytes = audio_resp['Body'].read()
        print(f"  Downloaded {len(wav_bytes)/(1024*1024):.2f} MB WAV")

        clean_filename_title = safe_title.replace(":", " -")
        clean_filename_title = re.sub(r'[\\/*?"<>|]', "", clean_filename_title)
        clean_filename_title = re.sub(r"\s+", " ", clean_filename_title).strip()
        mp3_filename = f"{PROJECT_TITLE} - {clean_filename_title}.mp3"
        mp3_dest_path = DOWNLOAD_DIR / mp3_filename

        print(f"  Transcoding to 192k MP3 via FFmpeg...")
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_wav = Path(tmp_dir) / "input.wav"
            output_mp3 = Path(tmp_dir) / "output.mp3"
            input_wav.write_bytes(wav_bytes)

            cmd = [
                ffmpeg_bin,
                "-y",
                "-i", str(input_wav),
                "-vn",
                "-ar", "44100",
                "-ac", "2",
                "-b:a", "192k",
                "-f", "mp3",
                str(output_mp3),
            ]
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await proc.communicate()

            if not output_mp3.exists() or output_mp3.stat().st_size == 0:
                print(f"  ERROR: FFmpeg failed to encode MP3 for Novel Ch {novel_ch_num}")
                continue

            # Embed ID3 Tags
            audio = MP3(str(output_mp3), ID3=ID3)
            try:
                audio.add_tags()
            except Exception:
                pass

            audio.tags.add(TIT2(encoding=3, text=safe_title))
            audio.tags.add(TALB(encoding=3, text=PROJECT_TITLE))
            audio.tags.add(TPE1(encoding=3, text=AUTHOR))
            audio.tags.add(TRCK(encoding=3, text=f"{novel_ch_num}/{TOTAL_BOOK_CHAPTERS}"))
            audio.tags.add(TCON(encoding=3, text=GENRE))
            audio.tags.add(TDRC(encoding=3, text=str(datetime.now(UTC).year)))
            audio.tags.add(COMM(encoding=3, lang="eng", desc="Production", text="Synthesized via Chatterbox-Turbo Voice Cloning"))

            if cover_bytes:
                is_png = cover_bytes[:8] == b"\x89PNG\r\n\x1a\n"
                mime = "image/png" if is_png else "image/jpeg"
                audio.tags.add(APIC(encoding=3, mime=mime, type=3, desc="Cover Art", data=cover_bytes))

            audio.save()
            out_bytes = output_mp3.read_bytes()
            mp3_dest_path.write_bytes(out_bytes)
            print(f"  -> Successfully saved: {mp3_dest_path.name} ({len(out_bytes)/(1024*1024):.2f} MB)")

        completed_chapters.add(db_ch)

    print(f"\n=======================================================")
    print(f"Processed: {len(completed_chapters)}/{total_chapters} chapters present in {DOWNLOAD_DIR}")

if __name__ == '__main__':
    asyncio.run(main())
