"""
Build standalone single-executable binary for Novelova CLI using PyInstaller.
Produces a binary with zero external Python or runtime dependencies.
"""

import os
from pathlib import Path
import subprocess
import sys


def build():
    repo_root = Path(__file__).resolve().parents[3]
    cli_root = repo_root / "packages" / "novelova-cli"
    entrypoint = cli_root / "src" / "novelova_cli" / "main.py"
    dist_dir = repo_root / "dist"
    build_dir = cli_root / "build"

    dist_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--name=novelova",
        "--onefile",
        "--clean",
        f"--distpath={dist_dir}",
        f"--workpath={build_dir}",
        f"--paths={cli_root / 'src'}",
        "--collect-all=novelova_cli",
        "--collect-all=novelova_core",
        "--hidden-import=typer",
        "--hidden-import=rich",
        "--hidden-import=httpx",
        "--hidden-import=pydantic",
        str(entrypoint),
    ]

    print(f"Executing: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=repo_root)
    if result.returncode != 0:
        print("Standalone binary build failed!", file=sys.stderr)
        sys.exit(result.returncode)

    binary_path = dist_dir / "novelova"
    if binary_path.exists():
        os.chmod(binary_path, 0o755)
        size_mb = binary_path.stat().st_size / (1024 * 1024)
        print(f"\n✓ Standalone binary successfully compiled: {binary_path} ({size_mb:.1f} MB)")
    else:
        print("Binary was not found at expected path!", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    build()
