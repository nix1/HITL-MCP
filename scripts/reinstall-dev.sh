#!/usr/bin/env bash
# HITL MCP — dev reinstall helper
#
# Two modes:
#   npm run dev       → fast: recompile only + kill server
#                       Use this for server / webview changes.
#                       VS Code will restart the server automatically.
#
#   npm run reinstall → full: build VSIX + kill server + install extension
#                       Use this for extension.ts / package.json manifest changes.
#                       You must still reload each VS Code window afterwards.
#
# Override the port:  HITL_PORT=3738 npm run reinstall

set -euo pipefail
cd "$(dirname "$0")/.."

MODE=${1:-full}
PORT=${HITL_PORT:-3737}
VERSION=$(node -p "require('./package.json').version")
PID_FILE="dist/.hitl-mcp-server.pid"

# ── 1. Build ──────────────────────────────────────────────────────────────────
if [ "$MODE" = "fast" ]; then
  echo "⚡ Fast compile (server + webview only)…"
  npm run compile 2>&1 | grep -E "compiled|error" | grep -iv "^$" || true
else
  echo "🔨 Production build (VSIX)…"
  npx vsce package --no-git-tag-version 2>&1 | tail -3
fi

# ── 2. Stop the running server ─────────────────────────────────────────────────
echo "🔴 Stopping server on port ${PORT}…"

# Try graceful HTTP shutdown first
if curl -sf --max-time 2 -X POST "http://127.0.0.1:${PORT}/shutdown" >/dev/null 2>&1; then
  echo "   Shutdown request accepted."
  sleep 0.8
else
  # Fall back to PID file
  if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      echo "   Killing PID ${OLD_PID}…"
      kill "$OLD_PID" && sleep 0.5
    fi
  fi
  # Last resort: kill any mcpStandalone.js process
  if lsof -ti ":${PORT}" >/dev/null 2>&1; then
    echo "   Port still in use — force-killing…"
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

  if ! command -v code >/dev/null 2>&1; then
    echo "⚠️  'code' CLI not found — install it via VS Code:"
    echo "   Ctrl+Shift+P → Shell Command: Install 'code' command in PATH"
    echo "   Then run: code --install-extension ${VSIX} --force"
  else
    echo "📦 Installing ${VSIX}…"
    code --install-extension "${VSIX}" --force 2>&1 | grep -v "^$" || true
  fi

  echo ""
  echo "✅ Extension v${VERSION} installed."
  echo "   ➡  Reload each VS Code window that uses HITL MCP:"
  echo "      Ctrl+Shift+P → Developer: Reload Window"
else
  echo ""
  echo "✅ Compiled. Server killed — VS Code will restart it on next activation."
  echo "   (Or: cog menu → Restart MCP Server)"
fi
