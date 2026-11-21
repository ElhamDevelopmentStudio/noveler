from typing import Any
import typer
from rich.prompt import Prompt
from novelova_cli.client import NovelovaClient, NovelovaCliError
from novelova_cli.output import (
    print_error,
    print_success,
    print_table,
    print_panel,
    output_result,
)

app = typer.Typer(help="Multi-account Kaggle GPU pool and notebook quota orchestration")


@app.command("list")
def list_accounts(
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """List all configured Kaggle accounts, priority, quota, and dataset status."""
    client = NovelovaClient()
    try:
        accounts = client.get("/profile/kaggle/accounts")
        if json_output:
            output_result(accounts, is_json=True)
            return

        columns = ["ID", "Username", "Status", "Priority", "Dataset Status", "Hours Used", "Active"]
        rows = []
        for a in accounts:
            rows.append([
                a.get("id"),
                f"@{a.get('username')}",
                a.get("status"),
                a.get("priority", 1),
                a.get("dataset_status") or "uninitialized",
                f"{a.get('total_hours_used', 0.0):.1f}h",
                "✓ Yes" if a.get("is_active") else "✗ No",
            ])
        print_table("Kaggle Multi-Account GPU Pool", columns, rows)
    except NovelovaCliError as e:
        print_error(f"Failed to list Kaggle accounts: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("add")
def add_account(
    username: str = typer.Option(None, "--username", "-u", help="Kaggle username"),
    key: str = typer.Option(None, "--key", "-k", help="Kaggle API key secret"),
    priority: int = typer.Option(1, "--priority", "-p", help="Dispatch priority (1 = highest)"),
    verify: bool = typer.Option(True, "--verify/--no-verify", help="Verify credentials against Kaggle API before saving"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Add a new Kaggle account to the distributed GPU synthesis pool."""
    if not username:
        username = Prompt.ask("Enter Kaggle username")
    if not key:
        key = Prompt.ask("Enter Kaggle API key", password=True)

    client = NovelovaClient()
    try:
        payload = {
            "username": username.strip(),
            "key": key.strip(),
            "priority": priority,
            "is_active": True,
            "verify_first": verify,
        }
        res = client.post("/profile/kaggle/accounts", json_data=payload)
        if json_output:
            output_result(res, is_json=True)
        else:
            print_success(f"Kaggle account '@{username}' added to GPU pool (ID: {res.get('id')}).")
    except NovelovaCliError as e:
        print_error(f"Failed to add Kaggle account: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("test")
def test_account(
    account_id: str = typer.Argument(..., help="Kaggle account ID to test"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Validate credentials and API connectivity for a Kaggle account."""
    client = NovelovaClient()
    try:
        res = client.post(f"/profile/kaggle/accounts/{account_id}/test")
        if json_output:
            output_result(res, is_json=True)
        else:
            if res.get("success"):
                print_success(f"Kaggle account test PASSED: {res.get('message', 'Valid')}")
            else:
                print_error(f"Kaggle account test FAILED: {res.get('message', 'Invalid credentials')}")
    except NovelovaCliError as e:
        print_error(f"Test request failed: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("delete")
def delete_account(
    account_id: str = typer.Argument(..., help="Kaggle account ID to remove"),
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Remove a Kaggle account from the GPU pool."""
    client = NovelovaClient()
    try:
        client.delete(f"/profile/kaggle/accounts/{account_id}")
        if json_output:
            output_result({"deleted_account_id": account_id}, is_json=True)
        else:
            print_success(f"Kaggle account '{account_id}' removed from pool.")
    except NovelovaCliError as e:
        print_error(f"Failed to delete Kaggle account: {e.message}", is_json=json_output)
        raise typer.Exit(1)


@app.command("status")
def pool_status(
    json_output: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
) -> None:
    """Display overall GPU synthesis pool capacity, active lanes, and quota."""
    client = NovelovaClient()
    try:
        summary = client.get("/profile/kaggle/summary")
        if json_output:
            output_result(summary, is_json=True)
            return

        total_accs = summary.get("total_accounts", 0)
        active_accs = summary.get("active_accounts", 0)
        # Each account allows 2 concurrent GPU notebooks
        max_lanes = active_accs * 2
        content = (
            f"Configured Accounts: [bold]{total_accs}[/bold]\n"
            f"Active Accounts: [bold green]{active_accs}[/bold green]\n"
            f"Maximum Concurrent Lanes: [bold cyan]{max_lanes}[/bold cyan] (2 notebooks / account)\n"
            f"Available GPU Hours: [green]{summary.get('available_hours', 0.0):.1f}h[/green] / {summary.get('total_weekly_quota', 0.0):.1f}h\n"
            f"Total Hours Used: {summary.get('total_hours_used', 0.0):.1f}h\n"
            f"Active Syntheses: {summary.get('active_jobs_count', 0)}"
        )
        print_panel("Kaggle Multi-Account GPU Pool Status", content)
    except NovelovaCliError as e:
        print_error(f"Failed to get pool status: {e.message}", is_json=json_output)
        raise typer.Exit(1)
