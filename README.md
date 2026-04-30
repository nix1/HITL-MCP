# HumanAgent MCP (Fork)

> **This is a maintained fork of [3DTek-xyz/HumanAgent-MCP](https://github.com/3DTek-xyz/HumanAgent-MCP)**, the original project by [Ben Harper](https://github.com/3DTek-xyz). Full credit for the concept and initial implementation goes to the original author.

Forces GitHub Copilot to chat with you before acting. Stops runaway agents, reduces wasted API calls, lets you manage multiple workspaces from one interface.

---

## Fork Differences

This fork makes the following changes from the [upstream project](https://github.com/3DTek-xyz/HumanAgent-MCP):

| Change | Details |
|--------|---------|
| 🚫 **Telemetry removed** | Google Analytics 4 tracking has been completely removed. No usage data is sent anywhere. |
| 🧪 **Unit tests added** | ChatManager has comprehensive unit tests (`npm run test:unit`). |
| ⚙️ **CI pipeline** | GitHub Actions runs build, lint, and tests on every push and PR. |
| 🛡️ **Graceful shutdown** | Standalone MCP server handles SIGINT/SIGTERM for clean process termination. |
| 🔧 **Build fixes** | TypeScript config updated (`skipLibCheck`, DOM types) so `tsc` compiles without errors. |
| 🔗 **URL corrections** | All issue/help links point to this fork instead of stale upstream URLs. |

The upstream project is [looking for a new maintainer](https://github.com/3DTek-xyz/HumanAgent-MCP#project-status). This fork aims to keep the extension functional and well-tested.

---

## Installation

1. Install from a packaged `.vsix` bundle or build from source
2. Copilot automatically gets the `HumanAgent_Chat` tool
3. Done — no configuration needed
4. Recommend selecting **Create Override File** from the cog menu.
   This creates `HumanAgentOverride.json` in `.vscode/` with useful customizations including "reminder" text appended to every interaction.

**Building from source:**
```bash
git clone https://github.com/nix1/HumanAgent-MCP.git
cd HumanAgent-MCP
npm install
npm run compile
npx @vscode/vsce package
# Then install the generated .vsix in VS Code
```

## How to Use

### Basic Workflow

1. **Ask Copilot to do something** — specify you'd like a reply through HumanAgent Chat
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

Access all workspace chats in one browser tab at `http://localhost:3737/HumanAgent`
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
- Create rules to redirect, transform, or block requests
- Use JSONata expressions for advanced transformations
- See [Proxy-Rules.md](Proxy-Rules.md) for detailed documentation

**Important:**
- Certificate must be installed BEFORE enabling proxy
- Only captures traffic when enabled
- To disable: Cog menu → Disable Proxy

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
- Try: "Use HumanAgent_Chat to discuss this with me"

**Proxy not working:**
- Must install certificate first (cog menu → Install Proxy Certificate)
- Then enable proxy (cog menu → Enable Proxy)
- Certificate must be trusted in system keychain

## Development

```bash
# Install dependencies
npm install

# Build
npm run compile

# Run unit tests
npm run test:unit

# Lint
npm run lint

# Debug in VS Code
# Press F5 — dev mode uses port 3738, production uses 3737
```

## Privacy

This fork contains **no telemetry**. The extension does not send any data to external services. Your conversations, usage patterns, and workspace information stay entirely on your machine.

## Credits

- **Original project:** [3DTek-xyz/HumanAgent-MCP](https://github.com/3DTek-xyz/HumanAgent-MCP) by [Ben Harper](https://github.com/3DTek-xyz)
- **Original article:** [Stop the AI Chaos](https://medium.com/@harperbenwilliam/stop-the-ai-chaos-why-human-in-the-loop-beats-fully-autonomous-coding-agents-eeb0ae17fde9) on Medium
- **License:** [Business Source License 1.1](LICENSE.md) (same as upstream)

## More Info

See [README-Additional.md](README-Additional.md) for technical details.

## Demo

![HumanAgent MCP Extension Demo](high-res-demo.gif)

*Complete demonstration of the HumanAgent MCP extension in action — showing real-time human-AI collaboration*
