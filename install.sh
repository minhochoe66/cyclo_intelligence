#!/usr/bin/env bash
#
# Cyclo Intelligence installer.
#
# Default behavior:
#   - hosts named ffw* install the repository under /mnt/ssd/cyclo_intelligence
#     and expose it at ~/cyclo_intelligence via symlink.
#   - other hosts install under ~/cyclo_intelligence.
#   - the user starts the main container explicitly after installation.

set -euo pipefail

REPO_URL="${CYCLO_INSTALL_REPO_URL:-https://github.com/ROBOTIS-GIT/cyclo_intelligence.git}"
REF="main"
MODE="auto"
SSD_ROOT="${CYCLO_INSTALL_SSD_ROOT:-/mnt/ssd}"

usage() {
    cat <<EOF
Usage: install.sh [--robot|--local] [--ref <branch-or-tag>]

Options:
  --robot       Install under /mnt/ssd/cyclo_intelligence and symlink from home.
  --local       Install under ~/cyclo_intelligence.
  --ref REF     Git branch or tag to install (default: main).
  -h, --help    Show this help.
EOF
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --robot)
            MODE="robot"
            shift
            ;;
        --local)
            MODE="local"
            shift
            ;;
        --ref)
            if [ "$#" -lt 2 ] || [ -z "$2" ]; then
                echo "Error: --ref requires a value." >&2
                exit 1
            fi
            REF="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Error: unknown argument: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
done

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Error: required command not found: $1" >&2
        exit 1
    fi
}

hostname_short() {
    hostname -s 2>/dev/null || hostname 2>/dev/null || printf '%s\n' ""
}

detect_mode() {
    local host
    host="$(hostname_short | tr '[:upper:]' '[:lower:]')"
    case "$host" in
        ffw*) printf '%s\n' "robot" ;;
        *)    printf '%s\n' "local" ;;
    esac
}

path_exists_or_symlink() {
    [ -e "$1" ] || [ -L "$1" ]
}

assert_available_path() {
    local path="$1"
    local label="$2"
    if path_exists_or_symlink "$path"; then
        echo "Error: ${label} already exists: $path" >&2
        echo "Refusing to modify an existing Cyclo checkout automatically." >&2
        echo "Update it manually with:" >&2
        echo "  cd $path && git pull --ff-only && git submodule update --init --recursive" >&2
        exit 1
    fi
}

assert_ssd_ready() {
    local probe
    require_command mountpoint
    if ! mountpoint -q "$SSD_ROOT"; then
        echo "Error: robot mode requires mounted SSD: $SSD_ROOT" >&2
        exit 1
    fi
    if [ ! -d "$SSD_ROOT" ]; then
        echo "Error: SSD path is not a directory: $SSD_ROOT" >&2
        exit 1
    fi
    probe="${SSD_ROOT}/.cyclo-install-write-test.$$"
    if ! mkdir "$probe" 2>/dev/null; then
        echo "Error: SSD path is not writable: $SSD_ROOT" >&2
        exit 1
    fi
    rmdir "$probe" 2>/dev/null || true
}

clone_repo() {
    local install_dir="$1"
    local parent_dir
    parent_dir="$(dirname "$install_dir")"
    mkdir -p "$parent_dir"

    echo "[install] Cloning ${REPO_URL} (${REF}) into ${install_dir}"
    if ! git clone --recurse-submodules --branch "$REF" "$REPO_URL" "$install_dir"; then
        echo "[install] Clone failed; removing incomplete checkout: $install_dir" >&2
        rm -rf "$install_dir"
        exit 1
    fi
}

require_command git

if [ "$MODE" = "auto" ]; then
    MODE="$(detect_mode)"
fi

HOME_LINK="${HOME}/cyclo_intelligence"
case "$MODE" in
    robot)
        INSTALL_DIR="${SSD_ROOT%/}/cyclo_intelligence"
        assert_ssd_ready
        assert_available_path "$INSTALL_DIR" "SSD install path"
        assert_available_path "$HOME_LINK" "home link path"
        clone_repo "$INSTALL_DIR"
        ln -s "$INSTALL_DIR" "$HOME_LINK"
        echo "[install] Created symlink: ${HOME_LINK} -> ${INSTALL_DIR}"
        ;;
    local)
        INSTALL_DIR="$HOME_LINK"
        assert_available_path "$INSTALL_DIR" "local install path"
        clone_repo "$INSTALL_DIR"
        ;;
    *)
        echo "Error: invalid install mode: $MODE" >&2
        exit 1
        ;;
esac

echo "[install] Installed Cyclo Intelligence at: $INSTALL_DIR"
echo "[install] Start Cyclo Intelligence manually with:"
echo "  cd ${HOME_LINK}"
echo "  ./docker/container.sh start"
