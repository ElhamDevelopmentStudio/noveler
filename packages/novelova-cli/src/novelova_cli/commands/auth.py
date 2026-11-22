import typer
from rich.prompt import Prompt
from novelova_cli.client import NovelovaClient, NovelovaCliError
from novelova_cli.config import (
    load_config,
    save_config,
    get_effective_token,
    get_api_url,
    normalize_api_url,
    CliConfig,
)
from novelova_cli.output import print_error, print_success, print_panel, output_result

app = typer.Typer(help="Authentication and identity management")


@app.command("login")
def login(
    token: str = typer.Option(
        None, "--token", "-t", help="Permanent API token (nv_live_...)"
    ),
    email: str = typer.Option(
        None, "--email", "-e", help="Account email address"
    ),
    password: str = typer.Option(
        None, "--password", "-p", help="Account password"
    ),
    api_url: str = typer.Option(
        None, "--api-url", "--url", "-u", help="Override backend API URL"
    ),
    json_output: bool = typer.Option(
        False, "--json", help="Output machine-readable JSON"
    ),
) -> None:
    """Authenticate with the Novelova backend using an API Token or user credentials."""
    target_api_url = normalize_api_url(api_url or get_api_url())
    cfg = load_config()
    cfg.api_base_url = target_api_url

    if not token and not email and not password:
        # Interactive mode
        typer.echo("Choose authentication method:")
        typer.echo("  1) Permanent API Token (Recommended for AI agents & CLI)")
        typer.echo("  2) Email & Password")
        choice = Prompt.ask("Select option", choices=["1", "2"], default="1")
        if choice == "1":
            token = Prompt.ask("Enter your API Token (nv_live_...)")
        else:
            email = Prompt.ask("Email")
            password = Prompt.ask("Password", password=True)

    if token:
        token = token.strip()
        client = NovelovaClient(base_url=target_api_url, token=token)
        try:
            user_data = client.get("/auth/me")
            cfg.api_token = token
            cfg.user_email = user_data.get("email")
            cfg.user_name = user_data.get("name")
            save_config(cfg)
            print_success(
                f"Successfully authenticated as {cfg.user_name} ({cfg.user_email}) via API token.",
                is_json=json_output,
            )
            if json_output:
                output_result({"authenticated": True, "method": "api_token", "user": user_data}, is_json=True)
        except NovelovaCliError as e:
            print_error(f"Authentication failed: {e.message}", is_json=json_output, code="AUTH_FAILED")
            raise typer.Exit(1)
    elif email and password:
        client = NovelovaClient(base_url=target_api_url)
        try:
            res = client.post("/auth/login", json_data={"email": email.strip(), "password": password})
            access_token = res.get("access_token")
            user_data = res.get("user") or {}
            cfg.access_token = access_token
            cfg.user_email = user_data.get("email") or email
            cfg.user_name = user_data.get("name")
            save_config(cfg)
            print_success(
                f"Successfully authenticated as {cfg.user_name} ({cfg.user_email}) via password login.",
                is_json=json_output,
            )
            if json_output:
                output_result({"authenticated": True, "method": "jwt", "user": user_data}, is_json=True)
        except NovelovaCliError as e:
            print_error(f"Login failed: {e.message}", is_json=json_output, code="LOGIN_FAILED")
            raise typer.Exit(1)
    else:
        print_error("Please provide either --token or both --email and --password.", is_json=json_output)
        raise typer.Exit(1)


@app.command("status")
def status(
    json_output: bool = typer.Option(
        False, "--json", help="Output machine-readable JSON"
    ),
) -> None:
    """Check current authentication status and active configuration."""
    cfg = load_config()
    token = get_effective_token()
    api_url = get_api_url()

    if not token:
        if json_output:
            output_result(
                {
                    "authenticated": False,
                    "api_url": api_url,
                    "active_project_id": cfg.active_project_id,
                },
                is_json=True,
            )
        else:
            print_panel(
                "Novelova CLI Status",
                f"[bold red]Not Authenticated[/bold red]\n"
                f"API Endpoint: [cyan]{api_url}[/cyan]\n"
                f"Active Project: [yellow]{cfg.active_project_id or 'None'}[/yellow]\n\n"
                f"Run [bold green]novelova auth login[/bold green] to authenticate.",
            )
        return

    # Verify token with backend
    client = NovelovaClient(base_url=api_url, token=token)
    try:
        user_data = client.get("/auth/me")
        token_type = "API Token (nv_live_...)" if token.startswith("nv_live_") else "JWT Session"
        token_preview = f"{token[:12]}..." if len(token) > 12 else token

        if json_output:
            output_result(
                {
                    "authenticated": True,
                    "token_type": token_type,
                    "api_url": api_url,
                    "user": user_data,
                    "active_project_id": cfg.active_project_id,
                },
                is_json=True,
            )
        else:
            print_panel(
                "Novelova CLI Status",
                f"[bold green]Authenticated[/bold green]\n"
                f"User: [bold]{user_data.get('name')}[/bold] ({user_data.get('email')})\n"
                f"Role: [cyan]{user_data.get('role')}[/cyan]\n"
                f"Token Type: [magenta]{token_type}[/magenta] ({token_preview})\n"
                f"API Endpoint: [cyan]{api_url}[/cyan]\n"
                f"Active Project ID: [yellow]{cfg.active_project_id or 'None'}[/yellow]\n"
                f"Preferred TTS Model: [green]{user_data.get('preferred_tts_model') or 'chatterbox-turbo'}[/green]",
            )
    except NovelovaCliError as e:
        if json_output:
            output_result(
                {
                    "authenticated": False,
                    "error": e.message,
                    "api_url": api_url,
                    "active_project_id": cfg.active_project_id,
                },
                is_json=True,
            )
        else:
            print_panel(
                "Novelova CLI Status",
                f"[bold red]Authentication Invalid or Expired[/bold red]\n"
                f"Error: {e.message}\n"
                f"API Endpoint: [cyan]{api_url}[/cyan]\n\n"
                f"Run [bold green]novelova auth login[/bold green] to reconnect.",
            )


@app.command("logout")
def logout(
    json_output: bool = typer.Option(
        False, "--json", help="Output machine-readable JSON"
    ),
) -> None:
    """Clear locally cached authentication tokens."""
    cfg = load_config()
    cfg.api_token = None
    cfg.access_token = None
    cfg.user_email = None
    cfg.user_name = None
    save_config(cfg)
    print_success("Logged out successfully.", is_json=json_output)
