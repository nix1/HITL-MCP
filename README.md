# Human-in-the-Loop (HITL) MCP

> **Note:** This is a fork of [3DTek-xyz/HITL-MCP](https://github.com/3DTek-xyz/HITL-MCP) by [Ben Harper](https://github.com/3DTek-xyz). This version includes additional unit tests, telemetry removal, and CI integration.

Forces GitHub Copilot to chat with you before acting. Stops runaway agents, reduces wasted API calls, lets you manage multiple workspaces from one interface.

---

## Changes in this version

This version (HITL-MCP) transforms the original human-chat concept into a production-grade **Human-in-the-Loop** framework.

| Feature | Details |
|---------|---------|
| 🧠 **Structured Tool APIs** | Replaced generic chat with specialized tools: `Request_Approval`, `Ask_Oracle`, and `Get_Next_Task`. Each has a strict JSON schema that forces the AI to provide context (Impact, Justification, etc.). |
| ⚡ **Actionable Webview** | The UI now detects specific tool calls and renders **Approve/Deny** buttons. These buttons intelligently merge with your manual text input for seamless feedback. |
| 🌐 **Multi-Workspace** | Manage multiple agents across different VS Code windows. Each workspace session appears as a **separate tab** in the browser interface at `localhost:3737/HITL`. |
| 🚫 **Zero Telemetry** | All GA4 and tracking code has been completely removed. Your data stays on your machine. |
| 🧪 **Tested & Stable** | Added a comprehensive test suite for session management and tool data persistence. |
| ⚙️ **Modernized CI** | Full GitHub Actions pipeline for linting, building, and automated testing. |
---

## Installation

1. Download the latest `.vsix` from [Releases](https://github.com/nix1/HITL-MCP/releases).
2. Open VS Code, go to Extensions (Ctrl+Shift+X), click the `...` menu, and select **Install from VSIX...**.
3. Alternatively, build from source:
```bash
git clone https://github.com/nix1/HITL-MCP.git
cd HITL-MCP && npm install && npm run package
# VSIX will be generated in the root directory
```

## How to Use

### Basic Workflow

1. **Ask Copilot to do something** — specify you'd like a reply through HITL Chat
2. **Chat panel opens** — green dot = connected, shows Copilot's message
3. **You respond** — type your answer, click Send (or use Quick Replies)
4. **Copilot continues** — gets your response and proceeds with the task

### VS Code Interface

**Chat Panel** (left sidebar):
- 🟢 Green dot = connected to server
- 🔴 Red dot = disconnected (auto-reconnects)
- Quick Replies = common responses like "Yes Please Proceed"
- Text input = always enabled, send button active when Copilot is waiting

**Status Indicators:**
- **Server:** 🟢 Running | 🟠 Starting | 🔴 Stopped
- **Proxy:** 🟢 Enabled | 🟠 Disabled | 🔴 Stopped

**Cog Menu (⚙️):**
- Show Status, Start/Stop/Restart Server
- Enable/Disable Proxy, Install/Uninstall Proxy Certificate
- Create Override File, Name This Chat
- Open Web View, Help & Documentation, Report Issue

### Web Interface

Open from cog menu → **Open Web View**

Access all workspace chats in one browser tab at `http://localhost:3737/HITL`
- See all conversations
- Switch between workspaces
- Append reminders to your responses

### Proxy Mode (Advanced)

Captures and displays HTTP/HTTPS traffic from VS Code for debugging extensions, marketplace requests, or other connections.

**Setup:**
1. Cog menu → Install Proxy Certificate (follow system prompts)
2. Cog menu → Enable Proxy
3. View captured requests in "Proxy Logs" section of web interface
4. Click any log entry for full request/response details
5. Add proxy override rules in the "Proxy Rules" tab

> **Note:** Enabling the proxy affects all VS Code workspaces.

**Proxy Rules:**
## Tool Customization (HITLOverride.json)

For advanced users, you can create a `.vscode/HITLOverride.json` file in your workspace to fine-tune the AI's behavior. This is highly recommended for professional workflows.

### Configuration Features

- **Tool Overrides**: Change how the AI perceives the `HITL_Chat` tool by providing a custom description. This is useful for giving the AI specific instructions on when or how to use the tool in your project.
- **Message Reminders**: Automatically append a "reminder" string to every message you send back to the AI. This effectively "reminds" the AI of its role in every turn.
- **Custom Quick Replies**: Replace the default "Yes Please Proceed" buttons with responses tailored to your team's workflow.

### Example Configuration

```json
{
  "version": "1.0.0",
  "tools": {
    "HITL_Chat": {
      "description": "MANDATORY: Use this tool for all discussions and before any destructive actions."
    }
  },
  "messageSettings": {
    "toolSpecific": {
      "HITL_Chat": {
        "autoAppendEnabled": true,
        "autoAppendText": "Remember to follow the project style guide and keep tests updated."
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

## Proxy Mode (Advanced)

Proxy Mode allows you to capture, inspect, and modify HTTP/HTTPS traffic originating from VS Code. This is particularly useful for debugging extension behavior or intercepting AI agent requests.

### Key Capabilities

- **Traffic Inspection**: View full request/response payloads in the Web Interface.
- **Request Transformation**: Use **JSONata** expressions to modify requests on the fly (e.g., changing system prompts or stripping headers).
- **Redirection**: Send requests to a different endpoint (e.g., redirecting production API calls to a local mock server).
- **Blocking**: Drop specific requests based on URL patterns.

### JSONata Rule Builder

For complex interceptors, use the visual **JSONata Rule Builder** at `http://localhost:3737/jsonata-rule-builder.html`. 
- It allows you to build data transformation rules (e.g., "replace user prompts with X") using a GUI.
- You can test your rules against sample JSON before applying them to the Proxy.

See [docs/JSONata.md](docs/JSONata.md) for a deep dive.

---

## Documentation

Detailed information is available in the `docs/` directory:

- [🚀 Installation & Setup](docs/Technical-Overview.md)
- [🏗️ Architecture & Development](docs/Architecture.md)
- [🛡️ Proxy Mode & Interceptors](docs/Proxy.md)
- [🎯 JSONata Rule Builder](docs/JSONata.md)
- [⚙️ HITLOverride.json Customization](docs/Technical-Overview.md#tool-customization)

---

## Troubleshooting

**Red dot / disconnected:**
- Cog menu → Start Server
- Check VS Code Output panel for errors
- Restart VS Code

**Server won't start:**
- Check port 3737 not in use: `lsof -i :3737`
- Try manually restarting from cog menu

**Copilot not using the tool:**
- Tool registers automatically on startup
- Try: "Use HITL_Chat to discuss this with me"

---

## Development

```bash
npm install
npm run compile        # webpack build
npm run test:unit      # unit tests (18 tests, no VS Code required)
npm run lint           # eslint
# Press F5 in VS Code to debug — dev mode uses port 3738
```

## Privacy

- **Extension Privacy**: This extension contains **no telemetry**. We do not collect or send your conversation data, workspace paths, or usage patterns to any external servers.
- **Copilot Telemetry**: Please note that **GitHub Copilot itself** collects its own telemetry. While this extension does not add any tracking, it does not stop Copilot's native telemetry unless you specifically enable the "Block GitHub Copilot Telemetry" rule in **Proxy Mode**.

## Credits

- **Original project:** [3DTek-xyz/HITL-MCP](https://github.com/3DTek-xyz/HITL-MCP) by [Ben Harper](https://github.com/3DTek-xyz)
- **Original article:** [Stop the AI Chaos](https://medium.com/@harperbenwilliam/stop-the-ai-chaos-why-human-in-the-loop-beats-fully-autonomous-coding-agents-eeb0ae17fde9) on Medium
- **License:** [GNU General Public License v3](LICENSE.md) (same as upstream)

## More Info

Feel free to browse the [docs/](docs/) folder for more specific guides.
