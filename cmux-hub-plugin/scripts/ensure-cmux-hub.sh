#!/bin/bash
set -euo pipefail

# Fork: never download release binaries. Build from the local source checkout
# so the installed binary always matches reviewed code.

INSTALL_DIR="${HOME}/.local/bin"
INSTALL_PATH="${INSTALL_DIR}/cmux-hub"
PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="${CMUX_HUB_SRC:-${HOME}/Documents/insider-projects/cmux-hub}"
REQUIRED_VERSION=$(grep '"version"' "${PLUGIN_ROOT}/.claude-plugin/plugin.json" | sed 's/.*"version": *"//;s/".*//')

if [ -z "$REQUIRED_VERSION" ]; then
  echo "Failed to read version from plugin.json" >&2
  exit 1
fi

# Check current version
CURRENT_VERSION=""
if [ -x "$INSTALL_PATH" ]; then
  CURRENT_VERSION=$("$INSTALL_PATH" --version 2>/dev/null || echo "")
fi

if [ "$CURRENT_VERSION" = "$REQUIRED_VERSION" ]; then
  exit 0
fi

if [ ! -f "${SRC_DIR}/package.json" ]; then
  echo "cmux-hub source not found at ${SRC_DIR} (set CMUX_HUB_SRC)" >&2
  exit 1
fi

SRC_VERSION=$(grep '"version"' "${SRC_DIR}/package.json" | head -1 | sed 's/.*"version": *"//;s/".*//')
if [ "$SRC_VERSION" != "$REQUIRED_VERSION" ]; then
  echo "cmux-hub source is v${SRC_VERSION}, plugin expects v${REQUIRED_VERSION}. Run: git -C ${SRC_DIR} pull" >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required to build cmux-hub (brew install oven-sh/bun/bun)" >&2
  exit 1
fi

echo "Building cmux-hub v${REQUIRED_VERSION} from ${SRC_DIR}..."
(cd "$SRC_DIR" && bun install --frozen-lockfile >/dev/null && bun run install:local >/dev/null)
echo "Installed cmux-hub v${REQUIRED_VERSION} to ${INSTALL_PATH}"
