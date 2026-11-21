#!/usr/bin/env bash
# ==============================================================================
# Novelova CLI One-Line Remote Installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/novelova/novelova/main/packages/novelova-cli/scripts/install.sh | bash
#   or with custom installation directory:
#   INSTALL_DIR=$HOME/bin bash install.sh
# ==============================================================================

set -euo pipefail

BOLD="$(tput bold 2>/dev/null || echo '')"
GREEN="$(tput setaf 2 2>/dev/null || echo '')"
YELLOW="$(tput setaf 3 2>/dev/null || echo '')"
RED="$(tput setaf 1 2>/dev/null || echo '')"
CYAN="$(tput setaf 6 2>/dev/null || echo '')"
RESET="$(tput sgr0 2>/dev/null || echo '')"

echo "${CYAN}${BOLD}==> Novelova CLI Remote Installer${RESET}"

# 1. Detect Architecture and OS
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
    Linux)
        OS_NAME="linux"
        ;;
    Darwin)
        OS_NAME="darwin"
        ;;
    CYGWIN*|MINGW*|MSYS*)
        OS_NAME="windows"
        ;;
    *)
        echo "${RED}Error: Unsupported operating system: $OS${RESET}" >&2
        exit 1
        ;;
esac

case "$ARCH" in
    x86_64|amd64)
        ARCH_NAME="x64"
        ;;
    arm64|aarch64)
        ARCH_NAME="arm64"
        ;;
    *)
        echo "${RED}Error: Unsupported architecture: $ARCH${RESET}" >&2
        exit 1
        ;;
esac

BINARY_NAME="novelova"
if [ "$OS_NAME" = "windows" ]; then
    BINARY_NAME="novelova.exe"
fi

TARGET_TAG="${NOVELOVA_VERSION:-latest}"
REPO="${NOVELOVA_REPO:-novelova/novelova}"
TARGET_ASSET="novelova-${OS_NAME}-${ARCH_NAME}"
if [ "$OS_NAME" = "windows" ]; then
    TARGET_ASSET="${TARGET_ASSET}.exe"
fi

# 2. Determine Installation Path
if [ -n "${INSTALL_DIR:-}" ]; then
    BIN_DIR="$INSTALL_DIR"
elif [ "$(id -u)" -eq 0 ]; then
    BIN_DIR="/usr/local/bin"
elif [ -d "$HOME/.local/bin" ] || [[ ":$PATH:" == *":$HOME/.local/bin:"* ]]; then
    BIN_DIR="$HOME/.local/bin"
else
    BIN_DIR="/usr/local/bin"
fi

mkdir -p "$BIN_DIR"

DEST_FILE="$BIN_DIR/$BINARY_NAME"
TEMP_FILE="$(mktemp -t novelova_download.XXXXXX)"

cleanup() {
    rm -f "$TEMP_FILE"
}
trap cleanup EXIT

echo "Detected Platform: ${BOLD}${OS_NAME}-${ARCH_NAME}${RESET}"
echo "Installing to:     ${BOLD}${DEST_FILE}${RESET}"

# 3. Download Release Asset
if [ "$TARGET_TAG" = "latest" ]; then
    DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${TARGET_ASSET}"
else
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TARGET_TAG}/${TARGET_ASSET}"
fi

echo "${YELLOW}Fetching binary from: ${DOWNLOAD_URL}${RESET}"

HTTP_CODE=$(curl -sSL -w "%{http_code}" -o "$TEMP_FILE" "$DOWNLOAD_URL" || true)

if [ "$HTTP_CODE" != "200" ]; then
    echo "${YELLOW}Prebuilt binary release asset not found (HTTP $HTTP_CODE).${RESET}"
    echo "${YELLOW}Falling back to uv/pip tool installation...${RESET}"

    if command -v uv >/dev/null 2>&1; then
        echo "Using uv tool install..."
        uv tool install --force "git+https://github.com/${REPO}.git#subdirectory=packages/novelova-cli"
        echo "${GREEN}${BOLD}✓ Novelova CLI installed successfully via uv tool!${RESET}"
        exit 0
    elif command -v pipx >/dev/null 2>&1; then
        echo "Using pipx install..."
        pipx install --force "git+https://github.com/${REPO}.git#subdirectory=packages/novelova-cli"
        echo "${GREEN}${BOLD}✓ Novelova CLI installed successfully via pipx!${RESET}"
        exit 0
    else
        echo "${RED}Error: Precompiled binary unavailable and neither 'uv' nor 'pipx' was detected.${RESET}" >&2
        echo "Please install uv (https://docs.astral.sh/uv/) or pipx, then re-run." >&2
        exit 1
    fi
fi

# 4. Install and Set Executable Permissions
if [ -w "$BIN_DIR" ]; then
    mv "$TEMP_FILE" "$DEST_FILE"
else
    echo "${YELLOW}Elevated permissions required to write to $BIN_DIR. Requesting sudo...${RESET}"
    sudo mv "$TEMP_FILE" "$DEST_FILE"
fi

chmod +x "$DEST_FILE"

# 5. Check PATH and Verify
echo ""
echo "${GREEN}${BOLD}✓ Novelova CLI installed successfully!${RESET}"
echo ""

if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo "${YELLOW}${BOLD}Note: ${BIN_DIR} is not in your current PATH.${RESET}"
    echo "Add it to your shell configuration file (~/.bashrc, ~/.zshrc, or ~/.config/fish/config.fish):"
    echo "    export PATH=\"$BIN_DIR:\$PATH\""
    echo ""
fi

# Verify executable works
if [ -x "$DEST_FILE" ]; then
    echo "Version Verification:"
    "$DEST_FILE" --version || "$DEST_FILE" --help | head -n 4
fi

echo ""
echo "${CYAN}Next Steps:${RESET}"
echo "  1. Authenticate with your Novelova Studio backend:"
echo "     ${BOLD}novelova auth login --token nv_live_...${RESET}"
echo "     or with credentials:"
echo "     ${BOLD}novelova auth login --email user@example.com${RESET}"
echo ""
echo "  2. For headless AI agent usage, set environment variables:"
echo "     ${BOLD}export NOVELOVA_API_TOKEN=\"nv_live_...\"${RESET}"
echo "     ${BOLD}export NOVELOVA_API_BASE_URL=\"https://your-domain.com/api/v1\"${RESET}"
echo ""
echo "  3. Verify connection:"
echo "     ${BOLD}novelova auth status --json${RESET}"
