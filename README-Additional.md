# HITL MCP — Technical Overview

VS Code extension that runs an MCP (Model Context Protocol) server, providing an `HITL_Chat` tool that forces AI assistants to communicate through a human agent interface instead of acting autonomously.

## What it does

When an AI assistant calls the `HITL_Chat` tool, it opens a chat session where the human can respond in real-time. This gives you control over the AI workflow — you can approve actions, answer clarifying questions, or redirect the agent before it goes too far.

## Demo

![HITL MCP Extension Demo](high-res-demo.gif)

*Complete demonstration of the HITL MCP extension in action - showing real-time human-AI collaboration*

## How it works

- Extension starts MCP server on port 3737
- Registers `HITL_Chat` tool with VS Code MCP system
- AI assistants must use this tool for all interactions
- Creates persistent chat sessions with message history
- Provides VS Code webview and browser interfaces for human responses

## Installation and Setup

1. Install the extension in VS Code
2. Extension activates automatically on startup
3. MCP server starts and registers with VS Code
4. Tool becomes available to AI assistants immediately

## Chat Interfaces

**VS Code Panel**: Dockable chat interface within VS Code  
**Browser Interface**: Available at `http://localhost:3737/HITL`

Both interfaces show the same chat sessions and message history.

## Tool Customization

Create `.vscode/HITLOverride.json` to customize tool descriptions and message behavior. This is particularly useful for appending a reminder to every response so the AI stays in the loop:

```json
{
  "version": "1.0.0",
  "description": "Override file for workspace tool configurations",
  "tools": {
    "HITL_Chat": {
      "name": "HITL_Chat",
      "description": "Your custom description here"
    }
  },
  "messageSettings": {
    "global": {
      "autoAppendEnabled": false,
      "autoAppendText": ""
    },
    "toolSpecific": {
      "HITL_Chat": {
        "autoAppendEnabled": true,
        "autoAppendText": "Remember to always reply here in this tool unless user suggests otherwise"
      }
    }
  }
}
```

Changes require VS Code restart to take effect.

## Requirements

VS Code version 1.105.0 or higher with native MCP support.
