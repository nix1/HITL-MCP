# HumanAgent MCP

Forces GitHub Copilot to chat with you before acting. Stops runaway agents, reduces wasted API calls, lets you manage multiple workspaces from one interface.

## Project Status

This project is unmaintained and is looking for a new maintainer.

I still believe the problem it addresses is important: GitHub Copilot in VS Code can default to an overly autonomous "just do everything" style, and this project was built to add stronger human-in-the-loop control. In particular, the proxy/intercept behavior was intended to let you override that loose-cannon default and steer Copilot toward a more deliberate, check-in-first workflow.

I no longer use VS Code or GitHub Copilot regularly, so I am not in a good position to maintain, validate, or support this extension going forward.

If you find this approach valuable, please feel free to fork the project, open an issue, or take over maintenance.

## Installation

1. Install from a packaged `.vsix` bundle or build from source
2. Copilot automatically gets the `HumanAgent_Chat` tool
3. Done - no configuration needed
4. Recommend selecting the "Create Override File" option from cog menu.
  This creates a "HumanAgentOverride.json" in a .vscode directory and adds some important customisations you will want to play with.   You can set some "reminder" text to be included with every ineraction - this alone is worth it.

If the extension is no longer listed in the VS Code Marketplace, you can still use it by:
- downloading a release `.vsix` and using `Extensions: Install from VSIX...`
- building your own `.vsix` from source with `npx @vscode/vsce package`

## How to Use

### Basic Workflow

1. **Ask Copilot to do something - SPECIFY YOU WOULD LIKE A REPLY THROUGH HUMAN AGENT CHAT** - Copilot will use the HumanAgent_Chat tool.
2. **Chat panel opens** - Green dot = connected, shows Copilot's message
3. **You respond** - Type your answer, click Send (or use Quick Replies)
4. **Copilot continues** - Gets your response and proceeds with the task

### VS Code Interface

**Chat Panel** (left sidebar):
- Green dot = connected to server
- Red dot = disconnected (auto-reconnects)
- Quick Replies = common responses like "Yes Please Proceed"
- Text input = always enabled, send button only active when Copilot is waiting

**Status Indicators:**
- **Server Status**
  - 🟢 Green = Running and connected
  - 🟠 Orange = Starting up
  - 🔴 Red = Stopped or disconnected
- **Proxy Status** (appears when proxy server is running)
  - 🟢 "Proxy (Enabled)" = Running AND enabled in VS Code
  - 🟠 "Proxy (Disabled)" = Running but NOT enabled
  - 🔴 "Proxy (Stopped)" = Not running

**Cog Menu** (⚙️):
- Show Status - check server state
- Start/Stop/Restart Server - manage server state
- Enable/Disable Proxy - toggle proxy mode (see Proxy Mode below)
- Install Proxy Certificate - install HTTPS cert (required for proxy)
- Uninstall Proxy Certificate - remove cert and disable proxy
- Create Override File - custom prompt override
- Name This Chat - set session name
- Open Web View - manage all workspaces in browser
- Help & Documentation - view this guide
- Report Issue / Request Feature - GitHub links

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
4. Click any log entry to expand and see full request/response details
5. Add proxy override riles in the "Proxy Rules Tab" or open a captured proxy request in "Proxy Logs" and Select create rule to open a dynamic rule builder
NOTE: Enabling Proxy does so for all VSCode workspaces.

**Proxy Rules:**
- Create rules to redirect, transform, or block requests
- Use JSONata expressions for advanced transformations
- Manage rules from Proxy Logs tab in web interface
- See [Proxy-Rules.md](Proxy-Rules.md) for detailed documentation

**Important:**
- Certificate must be installed BEFORE enabling proxy
- Only captures traffic when enabled (orange/green status)
- To disable: Cog menu → Disable Proxy
- To uninstall cert: Cog menu → Uninstall Proxy Certificate


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
- Check status shows "Proxy (Enabled)" with green dot
- Certificate must be trusted in system keychain (macOS: System Keychain)

**Proxy shows "Disabled" (orange dot):**
- Proxy server running but not enabled in VS Code settings
- Use cog menu → Enable Proxy (don't manually edit settings)

## Development

Press F5 to debug - dev mode uses port 3738, production uses 3737. No conflicts.

## Privacy & Telemetry

This extension collects **anonymous usage data** to help improve the product:

**What we track:**
- Extension activation/deactivation
- Feature usage (chat opened, messages sent/received)
- Error diagnostics (error types, not content)
- Session metrics (message counts, not content)
- Extension version, VS Code version, OS platform
- Days since installation

**What we DON'T track:**
- ❌ Your message content
- ❌ Your name, email, or any personal data
- ❌ Workspace paths or file names
- ❌ Any identifiable information

**Your privacy:**
- Respects VS Code's telemetry setting
- To disable: Settings → Telemetry → Level → Off
- Fully GDPR compliant
- Uses Google Analytics 4 for anonymous metrics

**Why telemetry?**
- Helps us understand which features are used
- Identifies bugs and errors to fix
- Measures engagement and retention
- Guides future development priorities

For questions: [GitHub Issues](https://github.com/3DTek-xyz/HumanAgent-MCP/issues)

## More Info

See [README-Additional.md](README-Additional.md) for technical details

## Demo

![HumanAgent MCP Extension Demo](high-res-demo.gif)

*Complete demonstration of the HumanAgent MCP extension in action - showing real-time human-AI collaboration*

## Medium Article
https://medium.com/@harperbenwilliam/stop-the-ai-chaos-why-human-in-the-loop-beats-fully-autonomous-coding-agents-eeb0ae17fde9
