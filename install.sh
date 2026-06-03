#!/usr/bin/env bash
set -euo pipefail

REPO="ohosvscode/mcp"
BINARY_NAME="arkts-mcp"
GITHUB_API="https://api.github.com/repos/${REPO}"

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
  curl -fsSL https://cdn.jsdelivr.net/gh/${REPO}/main/install.sh | bash
  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash
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

fetch_release_json() {
  local endpoint="$1"
  curl -fsSL \
    -H "Accept: application/vnd.github+json" \
    -H "User-Agent: arkts-mcp-installer" \
    "${GITHUB_API}/${endpoint}"
}

pick_asset_field() {
  local platform="$1"
  local field="$2"
  local release_json="$3"

  if command -v jq >/dev/null 2>&1; then
    echo "$release_json" | jq -r --arg platform "$platform" --arg field "$field" '
      .assets[]
      | select(.name | test("^" + $platform + "-.*\\.zip$"))
      | .[$field]
      ' | head -n 1
    return
  fi

  require_cmd python3
  echo "$release_json" | python3 -c '
import json, re, sys
platform, field = sys.argv[1], sys.argv[2]
data = json.load(sys.stdin)
pattern = re.compile(rf"^{re.escape(platform)}-.*\.zip$")
for asset in data.get("assets", []):
    if pattern.match(asset.get("name", "")):
        print(asset[field])
        break
' "$platform" "$field"
}

resolve_release_json() {
  if [[ -z "$VERSION" ]]; then
    local release_json releases_list
    release_json="$(fetch_release_json "releases/latest" 2>/dev/null || true)"
    if [[ -n "$release_json" ]]; then
      echo "$release_json"
      return
    fi

    # GitHub /releases/latest returns 404 when the newest release is a prerelease.
    releases_list="$(fetch_release_json "releases?per_page=1")"
    if command -v jq >/dev/null 2>&1; then
      echo "$releases_list" | jq -c '.[0]'
      return
    fi
    require_cmd python3
    echo "$releases_list" | python3 -c 'import json, sys; print(json.dumps(json.load(sys.stdin)[0]))'
    return
  fi

  local tag normalized candidate release_json
  tag="$VERSION"
  normalized="${tag#v}"
  normalized="${normalized#@arkts/mcp@}"

  for candidate in "$tag" "v${normalized}" "@arkts/mcp@${normalized}"; do
    if release_json="$(fetch_release_json "releases/tags/${candidate}" 2>/dev/null || true)"; then
      if [[ -n "$release_json" && "$release_json" != *"Not Found"* ]]; then
        echo "$release_json"
        return
      fi
    fi
  done

  echo "Release not found for version: $VERSION" >&2
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
  local platform release_json asset_url asset_name zip_path install_dir_abs binary_path
  platform="$(detect_platform)"
  install_dir_abs="$(cd "$INSTALL_DIR" && pwd)"
  mkdir -p "$install_dir_abs"

  echo "Platform: ${platform}"
  echo "Install directory: ${install_dir_abs}"

  release_json="$(resolve_release_json)"
  asset_url="$(pick_asset_field "$platform" "browser_download_url" "$release_json")"
  asset_name="$(pick_asset_field "$platform" "name" "$release_json")"

  if [[ -z "$asset_url" || "$asset_url" == "null" || -z "$asset_name" || "$asset_name" == "null" ]]; then
    echo "No release asset found for platform: ${platform}" >&2
    exit 1
  fi

  zip_path="${install_dir_abs}/${asset_name}"
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
