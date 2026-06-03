#!/usr/bin/env bash
set -euo pipefail

REPO="ohosvscode/mcp"
BINARY_NAME="arkts-mcp"
JSDELIVR_GH="https://fastly.jsdelivr.net/gh/${REPO}"
JSDELIVR_API="https://data.jsdelivr.com/v1/package/gh/${REPO}"
RELEASE_ASSETS_DIR="release-assets"
GIT_REF="main"

INSTALL_DIR="$(pwd)"
VERSION=""
GLOBAL=1

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Download the arkts-mcp executable for this platform, extract it here, and link it globally.

Options:
  -d, --dir DIR       Install directory (default: current directory)
  -v, --version TAG   Release tag or version (default: latest release)
  --no-global         Do not create a global command symlink
  -h, --help          Show this help

Examples:
  curl -fsSL ${JSDELIVR_GH}@${GIT_REF}/install.sh | bash
  ./install.sh --version 0.0.1-alpha.2
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -d | --dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    -v | --version)
      VERSION="$2"
      shift 2
      ;;
    --no-global)
      GLOBAL=0
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

detect_platform() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$os" in
    darwin)
      case "$arch" in
        x86_64 | amd64) echo "darwin-x64" ;;
        arm64 | aarch64) echo "darwin-arm64" ;;
        *) echo "Unsupported macOS architecture: $arch" >&2; return 1 ;;
      esac
      ;;
    linux)
      case "$arch" in
        x86_64 | amd64) echo "linux-x64" ;;
        arm64 | aarch64) echo "linux-arm64" ;;
        *) echo "Unsupported Linux architecture: $arch" >&2; return 1 ;;
      esac
      ;;
    *)
      echo "Unsupported operating system: $os" >&2
      echo "On Windows, use install.ps1 instead." >&2
      return 1
      ;;
  esac
}

normalize_version() {
  local version="$1"
  version="${version#v}"
  version="${version#@arkts/mcp@}"
  printf '%s' "$version"
}

resolve_latest_version() {
  local json version
  json="$(curl -fsSL "$JSDELIVR_API")"
  version="$(printf '%s' "$json" | sed -n 's/.*"versions"[[:space:]]*:[[:space:]]*\[[[:space:]]*"\([^"]*\)".*/\1/p')"
  if [[ -z "$version" ]]; then
    echo "Failed to resolve the latest version from jsDelivr." >&2
    exit 1
  fi
  printf '%s\n' "$version"
}

asset_download_url() {
  local version="$1"
  local asset_name="$2"
  local git_ref="${3:-$GIT_REF}"
  printf '%s@%s/%s/%s' "$JSDELIVR_GH" "$git_ref" "$RELEASE_ASSETS_DIR" "$asset_name"
}

release_asset_exists() {
  local url="$1"
  curl -fsSI "$url" >/dev/null 2>&1
}

resolve_release_version() {
  local platform="$1"
  local version normalized asset_url git_ref

  if [[ -z "$VERSION" ]]; then
    version="$(resolve_latest_version)"
  else
    version="$(normalize_version "$VERSION")"
  fi

  asset_name="${platform}-${version}.zip"
  for git_ref in "$GIT_REF" "$version" "v${version}"; do
    asset_url="$(asset_download_url "$version" "$asset_name" "$git_ref")"
    if release_asset_exists "$asset_url"; then
      printf '%s\n' "$version"
      printf '%s\n' "$asset_url"
      printf '%s\n' "$asset_name"
      return 0
    fi
  done

  echo "No release asset found for platform: ${platform}" >&2
  echo "Version: ${version}" >&2
  exit 1
}

download_with_progress() {
  local url="$1"
  local dest="$2"
  echo "Downloading..."
  if command -v curl >/dev/null 2>&1; then
    curl -fL --progress-bar -o "$dest" "$url"
    echo
    return
  fi
  if command -v wget >/dev/null 2>&1; then
    wget --show-progress -O "$dest" "$url"
    return
  fi
  echo "curl or wget is required to download release assets." >&2
  exit 1
}

install_global() {
  local binary_path="$1"
  local bin_dir="${HOME}/.local/bin"
  mkdir -p "$bin_dir"
  ln -sf "$binary_path" "${bin_dir}/${BINARY_NAME}"

  case ":${PATH}:" in
    *":${bin_dir}:"*) ;;
    *)
      echo
      echo "Add this directory to your PATH:"
      echo "  export PATH=\"${bin_dir}:\$PATH\""
      ;;
  esac

  echo "Global command installed: ${bin_dir}/${BINARY_NAME}"
}

main() {
  require_cmd unzip
  local platform version asset_url asset_name zip_path install_dir_abs binary_path
  platform="$(detect_platform)"
  install_dir_abs="$(cd "$INSTALL_DIR" && pwd)"
  mkdir -p "$install_dir_abs"

  echo "Platform: ${platform}"
  echo "Install directory: ${install_dir_abs}"

  {
    read -r version
    read -r asset_url
    read -r asset_name
  } < <(resolve_release_version "$platform")

  zip_path="${install_dir_abs}/${asset_name}"
  echo "Version: ${version}"
  echo "Asset: ${asset_name}"
  download_with_progress "$asset_url" "$zip_path"

  echo "Extracting..."
  unzip -oq "$zip_path" -d "$install_dir_abs"
  rm -f "$zip_path"

  binary_path="${install_dir_abs}/${BINARY_NAME}"
  if [[ ! -f "$binary_path" ]]; then
    echo "Expected binary not found after extraction: ${binary_path}" >&2
    exit 1
  fi
  chmod +x "$binary_path"

  if [[ "$GLOBAL" -eq 1 ]]; then
    install_global "$binary_path"
  fi

  echo
  echo "Installation complete."
  echo "Run: ${BINARY_NAME} --help"
}

main "$@"
