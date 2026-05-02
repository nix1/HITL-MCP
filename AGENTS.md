# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run compile` — webpack build (produces `dist/extension.js`, `dist/mcpStandalone.js`, `dist/webview.js`)
- `npm run watch` — webpack in watch mode
- `npm run package` — production webpack build (used by `vscode:prepublish` for VSIX)
- `npm run lint` — eslint over `src`
- `npm run test:unit` — fast mocha unit tests (no VS Code host required); runs `out/test/chatManager.test.js` and `out/test/mcpTools.test.js`
- `npm test` — full `vscode-test` integration suite (downloads/runs Electron VS Code)
- `npm run compile-tests` — `tsc -p . --outDir out` (compile tests into `out/`)
- Run a single unit test file: `npm run compile-tests && npx mocha out/test/<name>.test.js --ui tdd`
- Debug the extension: press F5 in VS Code → launches Extension Development Host. **Dev host uses port 3738; production uses 3737.**
- CI (`.github/workflows/ci.yml`) runs: `npm run compile`, `npm run compile-tests`, `npm run lint`, `npm run test:unit`. Match this locally before pushing.

### Dev reinstall shortcuts

The server (`dist/mcpStandalone.js`) is a separate process from the extension host. Changes to different layers need different update paths:

| What changed | Command | What it does |
|---|---|---|
| `src/mcp/**` or `src/webview/client/**` | `npm run dev` | Fast webpack compile + kills the server; VS Code restarts it automatically |
| `src/extension.ts`, `package.json`, webview provider | `npm run reinstall` | Full VSIX build + kills server + `code --install-extension`; then reload each VS Code window (`Ctrl+Shift+P → Developer: Reload Window`) |

`scripts/reinstall-dev.sh` uses `POST /shutdown` (graceful) → PID file → `lsof` port kill, in that order.  
Override port: `HITL_PORT=3738 npm run dev` (dev host uses 3738).  
If multiple editors are installed the script prompts you to choose. Pin one permanently:
`CODE_CLI="/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code" npm run reinstall`

## Architecture

This is a VS Code extension that exposes a **human-in-the-loop MCP server** to AI assistants (GitHub Copilot et al.). It is bundled as **three separate webpack outputs**, which is the most important fact for understanding the codebase:

1. **Extension bundle** (`src/extension.ts` → `dist/extension.js`, target `node`): the VS Code activation entry point. Registers commands, the chat tree view, the webview, and an `McpServerDefinitionProvider` so VS Code's native MCP client knows where to connect.
2. **Standalone MCP server bundle** (`src/mcp/mcpStandalone.ts` → `dist/mcpStandalone.js`, target `node`): an independent Node process that hosts the actual HTTP server. The extension does **not** run the MCP server in-process — `ServerManager` (`src/serverManager.ts`) spawns `mcpStandalone.js` as a child process and tracks it via a PID file. This means restarting the extension does not always restart the server, and bugs can manifest as cross-process state mismatches.
3. **Webview client bundle** (`src/webview/client/index.ts` → `dist/webview.js`, target `web`): the browser-side script loaded into both the VS Code webview panel and the standalone web UI at `localhost:3737/HITL`. It connects back to the spawned server over HTTP/SSE — it does **not** talk to the extension directly.

`__PACKAGE_VERSION__` is injected into the standalone bundle by `webpack.DefinePlugin` from `package.json#version`; tests stub it via `(global as any).__PACKAGE_VERSION__` (see `src/test/mcpTools.test.ts`).

### HTTP server layout (`src/mcp/`)

`McpServer` (`server.ts`) is the orchestrator and owns four collaborators:
- `McpHttpServer` (`httpServer.ts`) — HTTP routing. Three logical surfaces share port 3737 to avoid SSE/connection conflicts:
  - `/mcp` — Server-Sent Events to VS Code webview clients
  - `/mcp-tools` — MCP protocol for the VS Code MCP extension client
  - `/HITL` — browser-facing web UI
  - `/sessions`, `/sessions/register`, `/tools?sessionId=…`, `/response`, `/debug/tools` — session/tool management
- `ToolRegistry` (`toolRegistry.ts`) — defines the default MCP tools: `Ask_Human_Expert` (formerly `HITL_Chat`), `Ask_Oracle`, `Report_Completion`, `Request_Approval`, `Ask_Multiple_Choice`. Adding/renaming tools must be reflected here **and** in `src/test/mcpTools.test.ts`.
- `ChatManager` (`chatManager.ts`) — message history and pending-request resolver map (correlates AI tool calls with human responses).
- `ProxyServer` (`proxyServer.ts`) + `proxy/` — optional `mockttp`-based HTTPS interception with a JSONata-driven rule engine for transforming/redirecting/blocking requests. Toggled from the cog menu; affects all VS Code workspaces system-wide.

### Sessions and tool overrides

Sessions are scoped to a VS Code workspace:
- Workspace key = `workspace-${md5(workspaceRoot)}`; session ID = `session-${uuid}` persisted in `vscode.ExtensionContext.globalState` (with a `-dev` suffix when running in the Extension Development Host so dev/prod don't collide).
- Per-session tool overrides come from `.vscode/HITLOverride.json` in the workspace and are stored on the server in `McpServer.sessionTools` / `sessionMessageSettings`. The override schema can change tool descriptions, append reminders to every human reply (globally or per-tool), and replace the default quick-reply buttons. See README.md for the schema.
- The `McpHttpServerDefinition` version field is bumped to force VS Code to invalidate its cached tool list when descriptions change — a tool description edit that doesn't appear in Copilot is usually a missed version bump.

### Webview ↔ server

The VS Code webview (`src/webview/chatWebviewProvider.ts` + `chatWebviewHtml.ts`) loads the bundled `webview.js`. The client (`src/webview/client/`: `index.ts`, `network.ts`, `tools.ts`, `ui.ts`) opens an SSE connection to the spawned MCP server on `/mcp` and POSTs human replies to `/response`. Logic helpers in `src/webview/logic/` (`WebviewActionHandler`, `WebviewMessageHandler`, `WebviewStatusManager`) sit in the extension process and bridge VS Code commands to the webview.

### Things to watch for

- Editing `src/mcp/**` or `src/webview/client/**` requires rebuilding the relevant bundle — `dist/extension.js` does not contain those files. After `npm run compile`, fully restart the spawned server (cog menu → Restart MCP Server) or kill the process holding port 3737/3738; otherwise you will be testing the previous build.
- `port 3737 in use` after a crash usually means a stale `mcpStandalone.js` child is still running — check the PID file or `lsof -i :3737`.
- Tests under `src/test/` that import from `src/mcp/` need `__PACKAGE_VERSION__` defined on `global` before importing (see existing tests). Forgetting this throws at module load.
- This repo is a fork of `3DTek-xyz/HITL-MCP` with telemetry stripped. Do not reintroduce GA4, analytics, or any outbound telemetry — it is a deliberate, advertised guarantee in the README.

## Documentation

- `docs/Architecture.md` — endpoint and session-system overview
- `docs/Technical-Overview.md` — user-facing summary and override-file shape
- `docs/Proxy.md`, `docs/JSONata.md` — proxy mode and rule-builder details
