#!/usr/bin/env bash
# HITL MCP — dev reinstall helper
#
# Two modes:
#   npm run dev       → fast: recompile only + kill server
#                       Use for src/mcp/** or src/webview/client/** changes.
#                       VS Code restarts the server automatically.
#
#   npm run reinstall → full: build VSIX + kill server + install extension
#                       Use for extension.ts / package.json / manifest changes.
#                       Still requires: Ctrl+Shift+P → Developer: Reload Window
#
# Port override:  HITL_PORT=3738 npm run dev   (dev host uses 3738)

set -euo pipefail
cd "$(dirname "$0")/.."

MODE=${1:-full}
PORT=${HITL_PORT:-3737}
VERSION=$(node -p "require('./package.json').version")
PID_FILE="dist/.hitl-mcp-server.pid"

# ── Find the VS Code / editor CLI ─────────────────────────────────────────────
# Searches PATH first, then common macOS app bundle locations.
find_code_cli() {
  # 1. PATH
  if command -v code >/dev/null 2>&1; then echo "code"; return; fi

  # 2. Known macOS .app bundles (VS Code, Insiders, Cursor, Windsurf, Positron…)
  local candidates=(
    "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
    "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code"
    "/Applications/Cursor.app/Contents/Resources/app/bin/code"
    "/Applications/Windsurf.app/Contents/Resources/app/bin/code"
    "/Applications/Positron.app/Contents/Resources/app/bin/code"
    "$HOME/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
    "$HOME/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code"
    "$HOME/Applications/Cursor.app/Contents/Resources/app/bin/code"
  )
  for c in "${candidates[@]}"; do
    if [ -x "$c" ]; then echo "$c"; return; fi
  done
}

# ── 1. Build ──────────────────────────────────────────────────────────────────
if [ "$MODE" = "fast" ]; then
  echo "⚡ Fast compile (server + webview)…"
  npm run compile 2>&1 | grep -E "compiled|error" | grep -v "^$" || true
else
  echo "🔨 Production build (VSIX)…"
  npx vsce package --no-git-tag-version 2>&1 | tail -3
fi

# ── 2. Stop the running server ─────────────────────────────────────────────────
echo "🔴 Stopping server on port ${PORT}…"

if curl -sf --max-time 2 -X POST "http://127.0.0.1:${PORT}/shutdown" >/dev/null 2>&1; then
  echo "   Shutdown accepted."
  sleep 0.8
else
  if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      echo "   Killing PID ${OLD_PID}…"
      kill "$OLD_PID" && sleep 0.5
    fi
  fi
  if lsof -ti ":${PORT}" >/dev/null 2>&1; then
    echo "   Port still occupied — force-killing…"
    lsof -ti ":${PORT}" | xargs kill -9 2>/dev/null || true
    sleep 0.5
  fi
fi

# ── 3. Install (full mode only) ────────────────────────────────────────────────
if [ "$MODE" = "full" ]; then
  VSIX="hitl-mcp-${VERSION}.vsix"
  if [ ! -f "$VSIX" ]; then
    echo "❌ VSIX not found: ${VSIX}" >&2
    exit 1
  fi

  CODE_CLI=$(find_code_cli)
  if [ -z "$CODE_CLI" ]; then
    echo "⚠️  No VS Code CLI found. To fix, open your editor and run:"
    echo "   Ctrl+Shift+P → Shell Command: Install 'code' command in PATH"
    echo ""
    echo "   Or install manually:"
    echo "   \"/path/to/code\" --install-extension ${VSIX} --force"
    echo ""
    echo "✅ VSIX built: ${VSIX}  (server stopped — install it manually)"
  else
    echo "📦 Installing ${VSIX} via: ${CODE_CLI}"
    "$CODE_CLI" --install-extension "${VSIX}" --force 2>&1 | grep -v "^$" || true
    echo ""
    echo "✅ Extension v${VERSION} installed."
    echo "   ➡  Reload each VS Code window:  Ctrl+Shift+P → Developer: Reload Window"
  fi
else
  echo ""
  echo "✅ Done. Server killed — VS Code will restart it automatically."
  echo "   (Or: cog menu → Restart MCP Server)"
fi
