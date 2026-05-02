# Human-in-the-Loop (HITL) MCP

> **Note:** This is a fork of [3DTek-xyz/HITL-MCP](https://github.com/3DTek-xyz/HITL-MCP) by [Ben Harper](https://github.com/3DTek-xyz). This version adds structured Gate tools, a production-grade chat UI, multi-workspace web control, and comprehensive tests.

Forces AI agents to talk to you before acting. Stops runaway agents, surfaces blockers early, and lets you manage multiple workspaces from one browser tab.

---

## What's in this version

| Feature | Details |
|---------|---------|
| 🏁 **Gate Completion System** | `Gate_Start`, `Gate_Checkpoint`, `Gate_Close`, `Gate_Blocked` — structured JSON tools that give agents a formal protocol for starting, reporting progress, and closing tasks. |
| 🔐 **Approval & Oracle Tools** | `Request_Approval` for explicit sign-off on destructive actions; `Ask_Oracle` for unblocking stuck agents; `Ask_Multiple_Choice` for structured option selection. |
| 💬 **Chat-Like Tool UI** | Tool calls render as natural chat bubbles with sender icons (🏁 🔐 🔮 …). No more dark context-header boxes. Rich structured cards for Gate reports: requirement grid, validation pass/fail, blocker details. |
| ⏱️ **Auto-Decision Timer** | Both the VS Code panel and the web control run a 120-second countdown that auto-selects the primary action. A **✕ Cancel** button lets you pause and decide manually. |
| 🌐 **Web HITL Control** | All workspace chats in one browser tab at `http://localhost:3737/HITL`. Sessions are discovered dynamically — opening the page before VS Code starts still works. |
| ⚡ **Modular Architecture** | TypeScript + Webpack. Decoupled modules: `McpHttpServer`, `ToolRegistry`, `ChatManager`, `ProxyServer`. |
| 🚀 **5× Faster Builds** | esbuild minifier replaces terser — build time ~11 s instead of ~60 s. |
| 🧪 **Tested & Stable** | 24 tests covering tool schemas, session persistence, and core logic. |
| 🚫 **Zero Telemetry** | All tracking code removed. Your data stays on your machine. |

---

## Installation

1. Download the latest `.vsix` from [Releases](https://github.com/nix1/HITL-MCP/releases).
2. VS Code → Extensions (Ctrl+Shift+X) → `...` menu → **Install from VSIX…**
3. Or build from source:

```bash
git clone https://github.com/nix1/HITL-MCP.git
cd HITL-MCP && npm install && npm run package
```

---

## How to Use

### Basic Workflow

1. **Start an AI agent** in any VS Code workspace — the extension registers the HITL tools automatically.
2. **Agent calls a Gate tool** — the chat panel opens and plays a notification beep.
3. **You respond** — click a quick-reply chip, or type a custom response and press Enter.
4. **Agent continues** — receives your response and proceeds.

### VS Code Chat Panel

Located in the left sidebar (Activity Bar → HITL icon).

- **🟢 / 🔴 dot** — server connected / disconnected (auto-reconnects)
- **Quick-reply chips** — one click sends the pre-written response; chips ending with `: ` open the textarea for you to finish the sentence before sending
- **Auto-decision timer** — counts down to 0, then auto-clicks the primary chip; click **✕ Cancel** to stay in manual mode
- **Policy selector** — `Timed` (default, 120 s) · `Manual` · `Instant`
- **⚙️ Cog menu** — Server controls, Proxy controls, session naming, open web view

### Web HITL Control

Open via cog menu → **Open Web View**, or navigate directly to `http://localhost:3737/HITL`.

- All active workspace sessions appear in the left sidebar
- Sessions are discovered automatically — the page does not need to be refreshed after VS Code starts
- Each session has its own chat panel, quick-reply bar, and auto-decision timer with cancel
- Proxy Logs, Rules, and Debug panels on the left

---

## Gate Completion System

The Gate tools give agents a structured protocol for completing tasks. The AI is expected to call them in order:

| Tool | When to call | Key fields |
|------|-------------|------------|
| `Gate_Start` | Before beginning a multi-step task | `plan_summary`, `expected_requirements` |
| `Gate_Checkpoint` | At milestones or when surfacing a risk | `checkpoint_type`, `requirement_delta`, `blockers`, `next_expected_step` |
| `Gate_Close` | When the task is done (or stuck) | `final_state` (completed/partial/blocked), `requirement_coverage`, `validations`, `next_suggestion` |
| `Gate_Blocked` | Immediate blocker requiring human input | `blocker_details` (severity, description, needed_input, next_unblock_step) |

**Rich UI for Gate_Close** — the chat bubble shows a structured report card:
- **Status badge** — ✅ Completed · ⚠️ Partial · 🚫 Blocked
- **Requirements grid** — each `requirement_id` with ✅/⚠️/❌ and optional evidence reference
- **Validations list** — each check with pass/warn/fail icon and details
- **Blocker card** — severity, description, what's needed, next step (displayed prominently in red when `final_state: blocked`)

### Prompt your agent to use the Gate system

Add this to your agent instructions or `.vscode/HITLOverride.json`:

```
Before starting a task call Gate_Start.
Report milestones with Gate_Checkpoint.
When done, call Gate_Close with full requirement coverage.
If you are blocked, call Gate_Blocked immediately and stop.
```

---

## Other Tools

| Tool | Purpose |
|------|---------|
| `Request_Approval` | Ask for explicit sign-off before a destructive or irreversible action. Shows Action / Impact / Justification. |
| `Ask_Oracle` | Unblock the agent when it hits an ambiguous error. Offers "Try best solution / Ignore / Try instead… / Fixed manually". |
| `Ask_Multiple_Choice` | Present a structured set of options. One can be marked as the recommended choice. |
| `Ask_Human_Expert` | General open-ended question to the human. Falls back to custom quick replies. |

---

## Tool Customization (HITLOverride.json)

Create `.vscode/HITLOverride.json` to tailor the AI's behavior for your project:

```json
{
  "version": "1.0.0",
  "tools": {
    "Gate_Close": {
      "description": "MANDATORY: Call this when every task is finished. Include full requirement_coverage."
    }
  },
  "messageSettings": {
    "toolSpecific": {
      "Gate_Close": {
        "autoAppendEnabled": true,
        "autoAppendText": "Always run the full test suite before calling Gate_Close."
      }
    }
  },
  "quickReplies": {
    "enabled": true,
    "options": [
      "Ship it! 🚀",
      "Needs more tests 🧪",
      "Explain the trade-offs",
      "Let's iterate on this"
    ]
  }
}
```

---

## Proxy Mode

Captures and optionally transforms HTTP/HTTPS traffic from VS Code — useful for debugging AI requests or enforcing policies.

**Setup:**
1. Cog menu → **Install Proxy Certificate**
2. Cog menu → **Enable Proxy**
3. View captured traffic in the web interface under **Proxy Logs**
4. Add rules under **Proxy Rules** — URL pattern matching with JSONata transforms, redirects, or request dropping

See [docs/Proxy.md](docs/Proxy.md) and [docs/JSONata.md](docs/JSONata.md) for details.

---

## Documentation

- [🏗️ Architecture & Development](docs/Architecture.md)
- [🚀 Technical Overview](docs/Technical-Overview.md)
- [🛡️ Proxy Mode & Interceptors](docs/Proxy.md)
- [🎯 JSONata Rule Builder](docs/JSONata.md)

---

## Troubleshooting

**Web control shows "No active sessions":**
- The page discovers sessions automatically on load. If it still shows empty, wait a few seconds and the session should appear — VS Code registers the session asynchronously at startup.
- If the problem persists, reload the page once VS Code has fully started.

**Red dot / disconnected:**
- Cog menu → **Start Server**
- Check VS Code Output panel for errors

**Agent not using Gate tools:**
- Add a system prompt or project rule telling the agent to call `Gate_Start` at the beginning and `Gate_Close` when done.
- Or add a `HITLOverride.json` with a custom tool description (see above).

**Auto-timer fires too quickly:**
- Switch the policy selector in the VS Code panel header from `Timed` to `Manual`.
- Or click **✕ Cancel** on any individual timer to pause that one decision.

---

## Development

```bash
npm install
npm run compile     # webpack build
npm test            # full test suite (24 tests)
npm run lint        # eslint
# Press F5 in VS Code to debug — dev mode uses port 3738
```

---

## Privacy

This extension contains **no telemetry**. No conversation data, workspace paths, or usage patterns are sent anywhere. GitHub Copilot's own telemetry is separate — use the Proxy Rules to block it if needed.

---

## Credits

- **Original project:** [3DTek-xyz/HITL-MCP](https://github.com/3DTek-xyz/HITL-MCP) by [Ben Harper](https://github.com/3DTek-xyz)
- **Original article:** [Stop the AI Chaos](https://medium.com/@harperbenwilliam/stop-the-ai-chaos-why-human-in-the-loop-beats-fully-autonomous-coding-agents-eeb0ae17fde9) on Medium
- **License:** [GNU General Public License v3](LICENSE.md)
