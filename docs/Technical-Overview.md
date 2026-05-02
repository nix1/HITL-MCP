# HITL MCP — Technical Overview

VS Code extension that runs an MCP server on port 3737, providing a suite of **Human-in-the-Loop tools** that force AI agents to communicate through a human interface instead of acting autonomously.

## What it does

When an AI agent calls any HITL tool (e.g. `Gate_Close`, `Request_Approval`), the VS Code chat panel and the browser-based HITL Control both show an interactive message bubble. The human clicks a chip or types a response, and the agent continues. This gives you control over the AI workflow — approve actions, answer clarifying questions, review completion reports, or redirect the agent before it goes off-track.

## How it works

1. Extension starts a standalone MCP server process on port 3737.
2. Registers the HITL tools with VS Code's native MCP system.
3. When the agent calls a tool, the server creates a pending request and broadcasts it via SSE to all connected clients (VS Code webview and browser).
4. Human responds → server resolves the pending request → agent receives the response and continues.
5. All messages are stored in per-session history (50-message FIFO).

## Interfaces

**VS Code Panel** — dockable chat panel within VS Code, SSE-connected to the local server.  
**Browser Control** — `http://localhost:3737/HITL` — multi-session dashboard, auto-discovers all active workspaces.

Both interfaces show identical message history. The browser control adds:
- Sidebar with all active workspace sessions
- Auto-discovery of sessions registered before or after the page loads
- Per-session auto-decision timers with cancel buttons
- Proxy Logs / Rules / Debug panels

## Tool Suite

### Gate Completion Tools

| Tool | Purpose |
|------|---------|
| `Gate_Start` | Signals task intent and lists expected requirements. |
| `Gate_Checkpoint` | Intermediate progress report — milestones, risks, blockers. Does not close the task. |
| `Gate_Close` | Formal task closure. Carries `final_state` (completed/partial/blocked), `requirement_coverage`, `validations`, and `next_suggestion`. |
| `Gate_Blocked` | Immediate blocker signal — severity, description, what's needed, next unblock step. |

### Interaction Tools

| Tool | Purpose |
|------|---------|
| `Request_Approval` | Explicit sign-off request with action, impact, and justification. |
| `Ask_Oracle` | Unblock the agent at an ambiguous error. |
| `Ask_Multiple_Choice` | Structured option selection with optional recommendation. |
| `Ask_Human_Expert` | General open-ended question. |

## Tool Customization (HITLOverride.json)

Create `.vscode/HITLOverride.json` to customize tool descriptions and message behaviour:

```json
{
  "version": "1.0.0",
  "tools": {
    "Gate_Close": {
      "description": "MANDATORY: Call this when every task is finished. Include full requirement_coverage."
    }
  },
  "messageSettings": {
    "global": {
      "autoAppendEnabled": false,
      "autoAppendText": ""
    },
    "toolSpecific": {
      "Gate_Close": {
        "autoAppendEnabled": true,
        "autoAppendText": "Always run the full test suite before calling Gate_Close."
      }
    }
  },
  "quickReplies": {
    "enabled": true,
    "options": ["Ship it! 🚀", "Needs more tests 🧪", "Explain the trade-offs"]
  }
}
```

The override file is read on session registration. A VS Code reload is required for changes to take effect.

## Auto-Decision Timer

Both the VS Code panel and the browser control run a configurable countdown (default 120 s). When it expires the primary action chip is auto-clicked. A **✕ Cancel** button on the timer bar pauses this for the current decision. The policy selector in the panel header offers `Timed`, `Manual`, and `Instant` modes.

## Requirements

VS Code 1.105.0 or higher with native MCP support.
