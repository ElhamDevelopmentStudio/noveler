import argparse
import sys
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/drive"]

def main():
    parser = argparse.ArgumentParser(description="Generate Google Drive Refresh Token for Novelova")
    parser.add_argument("--client-id", required=True, help="Google OAuth Client ID")
    parser.add_argument("--client-secret", required=True, help="Google OAuth Client Secret")
    args = parser.parse_args()

    client_config = {
        "installed": {
            "client_id": args.client_id.strip(),
            "client_secret": args.client_secret.strip(),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost", "urn:ietf:wg:oauth:2.0:oob"],
        }
    }

    print("\nStarting Google OAuth flow...")
    print("A browser window will open. Please log in with your 5 TB Google account and click 'Allow'.\n")

    try:
        flow = InstalledAppFlow.from_client_config(client_config, scopes=SCOPES)
        # prompt='consent' and access_type='offline' guarantees a refresh_token is returned
        creds = flow.run_local_server(port=0, prompt="consent", access_type="offline")
    except Exception as exc:
        print(f"Error during authorization: {exc}")
        sys.exit(1)

    print("\n" + "=" * 60)
    print("SUCCESS! Here is your Google Drive Refresh Token:")
    print("=" * 60)
    print(f"GDRIVE_REFRESH_TOKEN=\"{creds.refresh_token}\"")
    print("=" * 60 + "\n")
    print("Add this line along with your CLIENT_ID and CLIENT_SECRET into your .env file!")

if __name__ == "__main__":
    main()
