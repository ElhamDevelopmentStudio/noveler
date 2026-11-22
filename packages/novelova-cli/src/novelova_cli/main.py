import sys
import typer

# Ensure UTF-8 output streams across all platforms (prevents Windows charmap UnicodeEncodeError)
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from novelova_cli import __version__
from novelova_cli.commands import (
    auth,
    projects,
    manuscripts,
    chapters,
    cast,
    pronunciation,
    kaggle,
    synthesize,
)

app = typer.Typer(
    name="novelova",
    help="Novelova Headless CLI & Autonomous AI Agent Studio Suite",
    no_args_is_help=True,
    add_completion=False,
)

# Register command modules
app.add_typer(auth.app, name="auth")
app.add_typer(projects.app, name="projects")
app.add_typer(manuscripts.app, name="manuscripts")
app.add_typer(chapters.app, name="chapters")
app.add_typer(cast.app, name="cast")
app.add_typer(pronunciation.app, name="pronunciation")
app.add_typer(kaggle.app, name="kaggle")
app.add_typer(synthesize.app, name="synthesize")


def version_callback(value: bool):
    if value:
        typer.echo(f"novelova CLI v{__version__}")
        raise typer.Exit()


@app.callback()
def main(
    version: bool = typer.Option(
        None,
        "--version",
        "-v",
        callback=version_callback,
        is_eager=True,
        help="Show CLI version and exit",
    ),
):
    """Novelova Autonomous Audio Drama Studio CLI."""
    pass


if __name__ == "__main__":
    app()
