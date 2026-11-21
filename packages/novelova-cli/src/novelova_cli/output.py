import json
import sys
from typing import Any
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

console = Console()
err_console = Console(stderr=True)


def output_result(data: Any, is_json: bool = False, title: str | None = None) -> None:
    if is_json:
        if hasattr(data, "model_dump"):
            data = data.model_dump()
        print(json.dumps(data, indent=2, default=str))
        return

    if isinstance(data, str):
        console.print(data)
    elif isinstance(data, dict):
        console.print_json(data=data)
    else:
        console.print(data)


def print_success(msg: str, is_json: bool = False) -> None:
    if is_json:
        print(json.dumps({"success": True, "message": msg}))
    else:
        console.print(f"[bold green]✓[/bold green] {msg}")


def print_error(msg: str, is_json: bool = False, code: str = "ERROR") -> None:
    if is_json:
        print(json.dumps({"success": False, "error": {"code": code, "message": msg}}))
    else:
        err_console.print(f"[bold red]✗ Error:[/bold red] {msg}")


def print_table(
    title: str,
    columns: list[str],
    rows: list[list[Any]],
    is_json: bool = False,
    raw_data: Any = None,
) -> None:
    if is_json:
        if raw_data is not None:
            output_result(raw_data, is_json=True)
        else:
            dict_rows = [dict(zip(columns, r)) for r in rows]
            output_result(dict_rows, is_json=True)
        return

    table = Table(title=title, show_lines=False, header_style="bold cyan")
    for col in columns:
        table.add_column(col)
    for r in rows:
        table.add_row(*[str(c) if c is not None else "" for c in r])
    console.print(table)


def print_panel(title: str, content: str, is_json: bool = False, raw_data: Any = None) -> None:
    if is_json:
        if raw_data is not None:
            output_result(raw_data, is_json=True)
        else:
            output_result({"title": title, "content": content}, is_json=True)
        return

    console.print(Panel(content, title=title, border_style="cyan"))
