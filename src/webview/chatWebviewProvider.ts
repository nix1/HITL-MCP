import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { McpServer } from '../mcp/server';
import { ChatMessage } from '../mcp/types';
import { McpConfigManager } from '../mcp/mcpConfigManager';
import { AudioNotification } from '../audio/audioNotification';

import { ServerManager } from '../serverManager';

export class ChatWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'humanagent-mcp.chatView';

  private _view?: vscode.WebviewView;
  private mcpServer: McpServer | null;
  private mcpConfigManager?: McpConfigManager;
  private extensionPath: string;
  // Messages are now loaded dynamically in webview JavaScript
  private currentRequestId?: string;
  private registrationCheckComplete = false;
  private notificationSettings = {
    enableSound: true,
    enableFlashing: true
  };

  constructor(
    private readonly _extensionUri: vscode.Uri,
    mcpServer: McpServer | null,
    mcpConfigManager?: McpConfigManager,
    private readonly workspaceSessionId?: string,
    private readonly context?: vscode.ExtensionContext,
    private readonly mcpProvider?: any,
    private readonly port: number = 3737
  ) {
    this.mcpServer = mcpServer;
    this.mcpConfigManager = mcpConfigManager;
    this.extensionPath = _extensionUri.fsPath;
    this.loadNotificationSettings();
  }

  private async loadConversationHistory() {
    if (!this.mcpServer || !this.workspaceSessionId) {
      return;
    }

    try {
      // Messages are now loaded dynamically by webview JavaScript
      console.log(`Loading conversation history for session: ${this.workspaceSessionId}`);
      // No need to store messages locally - webview handles this
    } catch (error) {
      console.error('Failed to load conversation history:', error);
    }
  }

  private loadNotificationSettings() {
    try {
      // Load settings from VS Code configuration
      const config = vscode.workspace.getConfiguration('humanagent-mcp');
      this.notificationSettings = {
        enableSound: config.get<boolean>('notifications.enableSound', true),
        enableFlashing: config.get<boolean>('notifications.enableFlashing', true)
      };
    } catch (error) {
      console.error('ChatWebviewProvider: Error loading notification settings:', error);
      // Use defaults on error
    }
  }

  public async displayHumanAgentMessage(message: string, context?: string, requestId?: string) {
    // Store the current request ID for response handling
    this.currentRequestId = requestId;
    
    // Combine context and message if context exists
    const fullMessage = context ? `${context}\n\n${message}` : message;
    

    
    // Add AI message to chat
    const aiMessage: ChatMessage = {
      id: Date.now().toString(),
      content: fullMessage,
      sender: 'agent',
      timestamp: new Date(),
      type: 'text'
    };
    
    // AI messages are now handled by SSE events - no need to store locally
    this.updateWebview();
    
    // Trigger flashing animation if enabled
    if (this.notificationSettings.enableFlashing) {
      this.triggerFlashingBorder();
    }
    
    // Focus the chat webview
    if (this._view) {
      this._view.show?.(true);
    }
  }

  private async playNotificationSound() {
    try {
      // Play sound using Node.js audio system (bypasses browser restrictions)
      await AudioNotification.playNotificationBeep();
    } catch (error) {
      console.error('ChatWebviewProvider: Error playing notification sound:', error);
    }
  }

  private triggerFlashingBorder() {
    if (this._view) {
      // Send a message to the webview to trigger the flashing animation
      this._view.webview.postMessage({
        type: 'flashBorder'
      });
    }
  }

  public clearPendingRequest() {
    // Clear the request ID when AI is done processing
    this.currentRequestId = undefined;
    this.updateWebview();
  }

  public notifyServerStarted() {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'serverStarted'
      });
    }
  }

  resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this._extensionUri
      ]
    };



    // Load conversation history from centralized chat manager
    this.loadConversationHistory();
    
    // Only update webview if registration check is complete, otherwise it will be updated when notifyRegistrationComplete is called
    if (this.registrationCheckComplete) {
      this.updateWebview();
    }

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'sendMessage':
          await this.sendHumanResponse(data.content, data.requestId, data.images);
          break;
        case 'mcpAction':
          await this.handleMcpAction(data.action);
          break;
        case 'requestServerStatus':
          // Update the webview with current server status (for menu updates)
          await this.updateServerStatus();
          break;
        case 'playNotificationSound':
          // Sound removed - only play on AI tool calls
          break;
        case 'sessionNameUpdated':
          // Handle session name update from SSE event
          await this.handleSessionNameUpdate(data.sessionId, data.name);
          break;
        case 'triggerUpdate':
          // Trigger extension update command
          vscode.commands.executeCommand('humanagent-mcp.updateExtension');
          break;
      }
    });
  }

  private async sendHumanResponse(content: string, requestId?: string, images?: Array<{data: string, mimeType: string}>) {
    try {
      console.log('ChatWebviewProvider: Sending human response:', content, images ? `with ${images.length} images` : '');
      

      
      // Don't add to local messages array - let server handle storage and SSE handle updates

      // Send response back to standalone MCP server via HTTP
      const responseRequestId = requestId || this.currentRequestId;
      if (responseRequestId) {
        console.log('ChatWebviewProvider: Responding to request ID:', responseRequestId);
        
        try {
          const responseBody: any = {
            requestId: responseRequestId,
            response: content,
            source: 'vscode'
          };
          
          // Add images if any were pasted
          if (images && images.length > 0) {
            responseBody.images = images;
          }
          
          const response = await fetch(`http://localhost:${this.port}/response`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(responseBody)
          });
          
          if (response.ok) {
            const result = await response.json();
            console.log('ChatWebviewProvider: Response sent successfully:', result);
          } else {
            console.error('ChatWebviewProvider: Failed to send response:', response.status, response.statusText);
          }
        } catch (httpError) {
          console.error('ChatWebviewProvider: HTTP error sending response:', httpError);
        }
        
        this.currentRequestId = undefined;
        // updateWebview() removed - SSE handleRequestStateChange() handles all UI state
      } else {
        console.warn('ChatWebviewProvider: No pending request to respond to');
      }
    } catch (error) {
      console.error('ChatWebviewProvider: Error in sendHumanResponse:', error);
    }
  }

  public async waitForHumanResponse(): Promise<string> {
    // This method is no longer needed since we use direct callbacks
    throw new Error('waitForHumanResponse is deprecated - use direct response handling');
  }

  private updateWebview() {
    if (this._view) {
      this._view.webview.html = this._getHtmlForWebview(this._view.webview);
    }
  }

  public showUpdateNotification(version: string) {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'updateAvailable',
        version: version
      });
    }
  }

  public refreshWebview() {
    this.updateWebview();
  }

  public notifyRegistrationComplete() {
    this.registrationCheckComplete = true;
    if (this._view) {
      this.updateWebview();
    }
  }

  private async updateServerStatus() {
    if (!this._view) {
      return;
    }

    // Get full server status including proxy info
    const serverManager = ServerManager.getInstance();
    const status = await serverManager.getServerStatus();
    
    // Check if proxy is currently enabled in global settings only
    const config = vscode.workspace.getConfiguration();
    const globalProxySetting = config.inspect('http.proxy')?.globalValue;
    const proxyUrl = status.proxy?.running ? `http://127.0.0.1:${status.proxy.port}` : null;
    
    const globalProxyEnabled = proxyUrl && globalProxySetting === proxyUrl;

    this._view.webview.postMessage({
      type: 'serverStatus',
      data: {
        isRunning: status.isRunning,
        running: status.isRunning, // Legacy compatibility
        tools: 1, // Default tool count
        pendingRequests: 0, // Can't get from standalone server easily
        registered: true, // Always true with native provider
        configType: 'native', // Native provider registration
        proxy: status.proxy,
        proxyEnabled: globalProxyEnabled, // Legacy compatibility
        globalProxyEnabled: globalProxyEnabled
      }
    });
  }

  private async enableProxy() {
    const serverManager = ServerManager.getInstance();
    const status = await serverManager.getServerStatus();
    if (!status.proxy?.running) {
      vscode.window.showWarningMessage('Proxy server is not running');
      return;
    }

    // Verify certificate is installed and working before enabling proxy
    const certVerified = await vscode.commands.executeCommand('humanagent-mcp.verifyCertificate') as boolean;
    
    if (!certVerified) {
      const action = await vscode.window.showErrorMessage(
        '⚠️ Proxy certificate is not installed or not trusted. HTTPS traffic will fail without the certificate.',
        'Install Certificate',
        'Cancel'
      );
      
      if (action === 'Install Certificate') {
        await vscode.commands.executeCommand('humanagent-mcp.installProxyCertificate');
      }
      return;
    }

    const proxyUrl = `http://127.0.0.1:${status.proxy.port}`;
    await vscode.workspace.getConfiguration().update('http.proxy', proxyUrl, vscode.ConfigurationTarget.Global);
    // Proxy enabled silently
    await this.updateServerStatus();
  }

  private async disableProxy() {
    await vscode.workspace.getConfiguration().update('http.proxy', undefined, vscode.ConfigurationTarget.Global);
    // Proxy disabled silently
    await this.updateServerStatus();
  }



  private async createPromptOverrideFile() {
    try {
      console.log('ChatWebviewProvider: Creating prompt override file...');
      
      // Get current workspace folder
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found. Open a workspace to create override file.');
        return;
      }

      const vscodeDir = path.join(workspaceFolder.uri.fsPath, '.vscode');
      const overrideFilePath = path.join(vscodeDir, 'HumanAgentOverride.json');

      // Create .vscode directory if it doesn't exist
      if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir, { recursive: true });
      }

      // Check if file already exists
      if (fs.existsSync(overrideFilePath)) {
        const result = await vscode.window.showWarningMessage(
          'Override file already exists. Do you want to overwrite it?',
          'Overwrite', 'Cancel'
        );
        if (result !== 'Overwrite') {
          return;
        }
      }

      // Get current tool configuration from server - NO FALLBACKS!
      const response = await fetch(`http://localhost:${this.port}/tools`);
      if (!response.ok) {
        throw new Error(`Failed to fetch tools from server: ${response.status}`);
      }
      
      const toolsData = await response.json() as { tools: any[] };
      const defaultTool = toolsData.tools.find((tool: any) => tool.name === 'HumanAgent_Chat');
      if (!defaultTool) {
        throw new Error('HumanAgent_Chat tool not found on server');
      }
      
      console.log('ChatWebviewProvider: Fetched current tool configuration from server');

      // Create example tool with medium detail
      const exampleTool = {
        name: 'example_custom_tool',
        description: 'Brief description of what this tool does and its main purpose. Include key usage notes and important warnings when applicable.',
        inputSchema: {
          type: 'object',
          properties: {
            input_param: {
              type: 'string',
              description: 'What this parameter does and how it should be formatted'
            },
            optional_param: {
              type: 'number',
              description: 'Optional parameter with default behavior explained',
              default: 100
            }
          },
          required: ['input_param']
        }
      };

      // Create override configuration  
      const overrideConfig = {
        version: '1.0.0',
        description: 'HumanAgent MCP Tool Overrides for this workspace. Modify tool configurations below to customize MCP server behavior.',
        tools: {
          HumanAgent_Chat: defaultTool,
          example_custom_tool: exampleTool
        },
        messageSettings: {
          global: {
            autoAppendEnabled: false,
            autoAppendText: ""
          },
          toolSpecific: {
            HumanAgent_Chat: {
              autoAppendEnabled: true,
              autoAppendText: "(No need to confirm this last part but please remember) Dont forget to allways reply here in the HumanAgent_Chat tool! Dont circumevent this tool unless asked explicitly by the user. "
            }
          }
        },
        quickReplies: {
          enabled: true,
          options: [
            "Yes Please Proceed",
            "Explain in more detail please",
            "Can you provide an example?",
            "That looks good to me",
            "Please make those changes"
          ]
        }
      };

      // Write the file
      fs.writeFileSync(overrideFilePath, JSON.stringify(overrideConfig, null, 2));
      
      // Update webview to reflect that override file now exists
      if (this._view) {
        this._view.webview.postMessage({
          command: 'updateOverrideFileExists',
          exists: true
        });
      }
      
      vscode.window.showInformationMessage(
        `Override file created at ${overrideFilePath}. Modify the tool configuration as needed.`,
        'Open File'
      ).then(selection => {
        if (selection === 'Open File') {
          vscode.window.showTextDocument(vscode.Uri.file(overrideFilePath));
        }
      });

      console.log('ChatWebviewProvider: Override file created successfully');
      
    } catch (error) {
      console.error('ChatWebviewProvider: Error creating override file:', error);
      vscode.window.showErrorMessage(`Failed to create override file: ${error}`);
    }
  }

  private async handleMcpAction(action: string) {
    try {
      switch (action) {
        case 'startServer':
          await vscode.commands.executeCommand('humanagent-mcp.startServer');
          break;
        case 'stopServer':
          // Always disable proxy before stopping server
          await this.disableProxy();
          await vscode.commands.executeCommand('humanagent-mcp.stopServer');
          break;
        case 'restartServer':
          await vscode.commands.executeCommand('humanagent-mcp.restartServer');
          break;
        case 'enableGlobalProxy':
        case 'enableProxy': // Legacy support
          await this.enableProxy();
          break;
        case 'disableGlobalProxy':
        case 'disableProxy': // Legacy support
          await this.disableProxy();
          break;
        case 'installCertificate':
          await vscode.commands.executeCommand('humanagent-mcp.installProxyCertificate');
          break;
        case 'uninstallCertificate':
          await vscode.commands.executeCommand('humanagent-mcp.uninstallProxyCertificate');
          break;
        case 'register':
        case 'unregister':
          // Registration handled automatically by native provider
          vscode.window.showInformationMessage('HumanAgent MCP registration is handled automatically by the native provider.');
          break;
        case 'testSound':
          // Test notification sound by triggering a fake notification
          await this.displayHumanAgentMessage('🔊 Audio test - this is a test notification sound!', 'Testing audio notifications', 'test-audio');
          break;
        case 'requestServerStatus':
          // Show the same notification popup as the main status command
          vscode.commands.executeCommand('humanagent-mcp.showStatus');
          break;
        case 'overridePrompt':
          await this.createPromptOverrideFile();
          break;
        case 'nameSession':
          await this.nameCurrentSession();
          break;
        case 'openWebView':
          await this.openWebInterface();
          break;
        case 'openHelp':
          vscode.env.openExternal(vscode.Uri.parse('https://github.com/nix1/HumanAgent-MCP#readme'));
          break;
        case 'reportIssue':
          vscode.env.openExternal(vscode.Uri.parse('https://github.com/nix1/HumanAgent-MCP/issues/new'));
          break;
        case 'requestFeature':
          vscode.env.openExternal(vscode.Uri.parse('https://github.com/nix1/HumanAgent-MCP/issues/new'));
          break;
      }
      
      // Update status after action
      this.updateServerStatus();
    } catch (error) {
      vscode.window.showErrorMessage(`MCP action failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async nameCurrentSession() {
    try {
      const sessionId = this.workspaceSessionId;
      if (!sessionId) {
        vscode.window.showErrorMessage('No active session to name.');
        return;
      }

      // Prompt user for session name
      const sessionName = await vscode.window.showInputBox({
        prompt: 'Enter a friendly name for this chat session',
        placeHolder: 'e.g., "Project Debugging", "Feature Discussion"',
        validateInput: (text) => {
          if (!text || text.trim().length === 0) {
            return 'Session name cannot be empty';
          }
          if (text.length > 50) {
            return 'Session name must be 50 characters or less';
          }
          return null;
        }
      });

      if (!sessionName) {
        return; // User cancelled
      }

      // Send session name to server
      const response = await fetch(`http://localhost:${this.port}/sessions/name`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: sessionId,
          name: sessionName.trim()
        })
      });

      if (response.ok) {
        // Persist the session name using the same method as session ID
        if (this.context) {
          const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          const workspaceKey = workspaceRoot ? `workspace-${require('crypto').createHash('md5').update(workspaceRoot).digest('hex')}` : 'no-workspace';
          await this.context.globalState.update(`sessionName-${workspaceKey}`, sessionName.trim());
        }
        
        vscode.window.showInformationMessage(`Session named: "${sessionName}"`);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

    } catch (error) {
      console.error('ChatWebviewProvider: Error naming session:', error);
      vscode.window.showErrorMessage(`Failed to name session: ${error}`);
    }
  }

  private async handleSessionNameUpdate(sessionId: string, name: string) {
    // Handle session name update received via SSE from server
    try {
      console.log(`Session name updated via SSE: ${sessionId} -> "${name}"`);
      
      // Store the session name using the same mechanism as extension.ts
      if (this.context) {
        await this.context.globalState.update(`humanagent-session-name-${sessionId}`, name);
        console.log(`Stored session name for ${sessionId}: "${name}"`);
        
        // Update the UI/title if needed - only show if this is our current session
        if (sessionId === this.workspaceSessionId) {
          vscode.window.showInformationMessage(`Session renamed: "${name}"`);
        }
      }
    } catch (error) {
      console.error('ChatWebviewProvider: Error handling session name update:', error);
    }
  }

  private async openWebInterface() {
    try {
      const webUrl = `http://localhost:${this.port}/HumanAgent`;
      
      // Open in external browser
      await vscode.env.openExternal(vscode.Uri.parse(webUrl));
      
      vscode.window.showInformationMessage('Web interface opened in browser');
      
    } catch (error) {
      console.error('ChatWebviewProvider: Error opening web interface:', error);
      vscode.window.showErrorMessage(`Failed to open web interface: ${error}`);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // Check if HumanAgentOverride.json exists in workspace and load quick replies
    let overrideFileExists = false;
    let quickReplyOptions = [
      "Yes Please Proceed",
      "Explain in more detail please"
    ];
    let workspacePath = 'none';
    
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      const workspaceFolder = vscode.workspace.workspaceFolders[0];
      workspacePath = workspaceFolder.uri.fsPath;
      const overrideFilePath = path.join(workspacePath, '.vscode', 'HumanAgentOverride.json');
      overrideFileExists = fs.existsSync(overrideFilePath);
      
      // Load quick replies from override file if it exists
      if (overrideFileExists) {
        try {
          const overrideContent = fs.readFileSync(overrideFilePath, 'utf8');
          const overrideData = JSON.parse(overrideContent);
          if (overrideData.quickReplies && overrideData.quickReplies.options && Array.isArray(overrideData.quickReplies.options)) {
            quickReplyOptions = overrideData.quickReplies.options;
          }
        } catch (error) {
          console.error('Failed to load quick replies from override file:', error);
        }
      }
    }

    // Get the URI for marked.js
    const markedJsUri = webview.asWebviewUri(vscode.Uri.file(
      path.join(this.extensionPath, 'node_modules', 'marked', 'lib', 'marked.umd.js')
    ));

    const hasPendingResponse = this.currentRequestId ? 'waiting' : '';

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>HumanAgent Chat</title>
        <style>
          :root {
            --bubble-radius: 12px;
            --bubble-padding: 10px 14px;
            --message-gap: 12px;
            --avatar-size: 24px;
          }

          body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            line-height: 1.5;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 0;
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }

          /* --- Header --- */
          .header {
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-panel-background);
            display: flex;
            flex-direction: column;
            gap: 4px;
            z-index: 10;
          }

          .status-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .status-group {
            display: flex;
            gap: 12px;
            align-items: center;
          }

          .status-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            opacity: 0.9;
          }

          .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: var(--vscode-descriptionForeground);
          }

          .status-dot.online { background-color: var(--vscode-charts-green); }
          .status-dot.offline { background-color: var(--vscode-charts-red); }
          .status-dot.pending { background-color: var(--vscode-charts-orange); }

          .control-buttons {
            display: flex;
            gap: 4px;
          }

          .icon-button {
            background: transparent;
            color: var(--vscode-foreground);
            border: none;
            padding: 4px;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .icon-button:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
          }

          /* --- Messages --- */
          .messages-container {
            flex: 1;
            overflow-y: auto;
            padding: 16px 12px;
            display: flex;
            flex-direction: column;
            gap: var(--message-gap);
            scroll-behavior: smooth;
          }

          .message-row {
            display: flex;
            flex-direction: column;
            max-width: 85%;
          }

          .message-row.agent { align-self: flex-start; }
          .message-row.user { align-self: flex-end; }

          .message-bubble {
            padding: var(--bubble-padding);
            border-radius: var(--bubble-radius);
            position: relative;
            box-shadow: 0 1px 2px rgba(0,0,0,0.1);
          }

          .agent .message-bubble {
            background-color: var(--vscode-editor-selectionBackground);
            color: var(--vscode-foreground);
            border-bottom-left-radius: 2px;
          }

          .user .message-bubble {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-bottom-right-radius: 2px;
          }

          .message-info {
            display: flex;
            gap: 8px;
            margin-bottom: 4px;
            font-size: 10px;
            opacity: 0.7;
          }

          .user .message-info { flex-direction: row-reverse; }

          .message-content {
            word-wrap: break-word;
          }

          /* Markdown specific styles */
          .message-content p { margin: 0 0 8px 0; }
          .message-content p:last-child { margin-bottom: 0; }
          .message-content code {
            font-family: var(--vscode-editor-font-family);
            background-color: rgba(0,0,0,0.1);
            padding: 2px 4px;
            border-radius: 4px;
          }
          .message-content pre {
            background-color: rgba(0,0,0,0.15);
            padding: 8px;
            border-radius: 6px;
            overflow-x: auto;
            margin: 8px 0;
          }
          .message-content pre code {
            background-color: transparent;
            padding: 0;
          }

          /* --- Input Area --- */
          .input-area {
            padding: 12px;
            border-top: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-panel-background);
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .quick-replies-chips {
            display: flex;
            gap: 6px;
            overflow-x: auto;
            padding-bottom: 4px;
            scrollbar-width: none; /* Hide scrollbar for chips */
          }
          .quick-replies-chips::-webkit-scrollbar { display: none; }

          .chip {
            white-space: nowrap;
            padding: 4px 10px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-secondaryBackground);
            border-radius: 12px;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.2s;
          }

          .chip:hover:not(:disabled) {
            background-color: var(--vscode-button-secondaryHoverBackground);
          }

          .chip:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .composer {
            display: flex;
            gap: 8px;
            align-items: flex-end;
          }

          .textarea-wrapper {
            flex: 1;
            position: relative;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            padding: 4px 8px;
          }

          .textarea-wrapper:focus-within {
            border-color: var(--vscode-focusBorder);
          }

          textarea {
            width: 100%;
            background: transparent;
            border: none;
            color: var(--vscode-input-foreground);
            font-family: inherit;
            font-size: inherit;
            resize: none;
            padding: 4px 0;
            outline: none;
            min-height: 24px;
            max-height: 150px;
          }

          .send-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            width: 32px;
            height: 32px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            flex-shrink: 0;
          }

          .send-btn:hover:not(:disabled) {
            background-color: var(--vscode-button-hoverBackground);
          }

          .send-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          /* Waiting indicator */
          .waiting-indicator {
            align-self: center;
            font-size: 11px;
            opacity: 0.6;
            margin-top: 8px;
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .dot-flashing {
            position: relative;
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background-color: var(--vscode-foreground);
            color: var(--vscode-foreground);
            animation: dotFlashing 1s infinite linear alternate;
            animation-delay: .5s;
          }
          .dot-flashing::before, .dot-flashing::after {
            content: '';
            display: inline-block;
            position: absolute;
            top: 0;
          }
          .dot-flashing::before {
            left: -8px;
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background-color: var(--vscode-foreground);
            color: var(--vscode-foreground);
            animation: dotFlashing 1s infinite linear alternate;
            animation-delay: 0s;
          }
          .dot-flashing::after {
            left: 8px;
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background-color: var(--vscode-foreground);
            color: var(--vscode-foreground);
            animation: dotFlashing 1s infinite linear alternate;
            animation-delay: 1s;
          }

          @keyframes dotFlashing {
            0% { background-color: var(--vscode-foreground); }
            50%, 100% { background-color: rgba(var(--vscode-foreground), 0.2); }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="status-row">
            <div class="status-group">
              <div class="status-item">
                <div id="server-status-dot" class="status-dot"></div>
                <span id="server-status-text">Server</span>
              </div>
              <div class="status-item">
                <div id="proxy-status-dot" class="status-dot"></div>
                <span id="proxy-status-text">Proxy</span>
              </div>
            </div>
            <div class="control-buttons">
              <button class="icon-button" id="updateButton" style="display:none;" onclick="triggerUpdate()" title="Update available">📥</button>
              <button class="icon-button" onclick="showConfigMenu()" title="Settings">⚙️</button>
            </div>
          </div>
        </div>

        <div class="messages-container" id="messages">
          <div class="empty-state" style="text-align: center; opacity: 0.5; padding: 40px 20px;">
            Waiting for AI messages...
          </div>
        </div>

        <div class="input-area">
          <div class="quick-replies-chips" id="chipsContainer">
            ${quickReplyOptions.map(option => 
              `<button class="chip" onclick="sendChip('${this._escapeHtml(option)}')" ${hasPendingResponse ? '' : 'disabled'}>${this._escapeHtml(option)}</button>`
            ).join('')}
          </div>
          <div class="composer">
            <div class="textarea-wrapper">
              <textarea id="messageInput" placeholder="Type a response..." rows="1"></textarea>
            </div>
            <button class="send-btn" id="sendButton" onclick="sendMessage()" ${hasPendingResponse ? '' : 'disabled'} title="Send message">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1.14645 1.14645C1.05118 1.24171 1 1.37087 1 1.50553V5.50553C1 5.75133 1.17937 5.95995 1.42152 5.99908L7.50553 7L1.42152 8.00092C1.17937 8.04005 1 8.24867 1 8.49447V12.4945C1 12.6291 1.05118 12.7583 1.14645 12.8536C1.24171 12.9488 1.37087 13 1.50553 13C1.56455 13 1.62343 12.9902 1.67964 12.9715L14.6796 8.63814C14.8711 8.57431 15 8.39656 15 8.20001V7.79999C15 7.60344 14.8711 7.42569 14.6796 7.36186L1.67964 3.02853C1.62343 3.0098 1.56455 3 1.50553 3C1.37087 3 1.24171 3.05118 1.14645 1.14645Z" fill="currentColor"/>
              </svg>
            </button>
          </div>
        </div>

        <script src="${markedJsUri}"></script>
        <script>
          const vscode = acquireVsCodeApi();
          
          // Set session ID and override file flag
          const sessionId = '${this.workspaceSessionId}';
          window.overrideFileExists = ${overrideFileExists};
          
          let currentPendingRequestId = '${hasPendingResponse ? pendingRequestId : ''}';
          
          // Play notification beep sound
          function playNotificationBeep() {
            // Request sound from extension (Node.js side) instead of browser
            try {
              vscode.postMessage({
                type: 'playNotificationSound'
              });
              console.log('Sound notification requested from extension');
            } catch (error) {
              console.error('Failed to request sound notification:', error);
            }
          }
          
          // Auto-grow textarea as user types
          const textarea = document.getElementById('messageInput');
          textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
          });
          
          document.getElementById('messageInput').addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          });

          async function showConfigMenu() {
            // Create dropdown menu
            const existingMenu = document.getElementById('configMenu');
            if (existingMenu) {
              existingMenu.remove();
              return;
            }
            
            // Request fresh server status before showing menu
            console.log('Requesting server status before showing menu...');
            vscode.postMessage({ type: 'requestServerStatus' });
            
            // Wait a bit for status to be received
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const menu = document.createElement('div');
            menu.id = 'configMenu';
            menu.style.position = 'absolute';
            menu.style.top = '30px';
            menu.style.right = '10px';
            menu.style.background = 'var(--vscode-menu-background)';
            menu.style.border = '1px solid var(--vscode-menu-border)';
            menu.style.borderRadius = '3px';
            menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
            menu.style.zIndex = '1000';
            menu.style.minWidth = '150px';
            
            // Get dynamic options based on current status
            const options = getDynamicMenuOptions();
            console.log('Menu options:', options, 'Current status:', currentServerStatus);
            
            options.forEach(option => {
              const item = document.createElement('div');
              item.textContent = option.text;
              item.style.padding = '8px 12px';
              item.style.cursor = 'pointer';
              item.style.color = 'var(--vscode-menu-foreground)';
              item.onmouseover = () => item.style.background = 'var(--vscode-menu-selectionBackground)';
              item.onmouseout = () => item.style.background = 'transparent';
              item.onclick = () => {
                vscode.postMessage({
                  type: 'mcpAction',
                  action: option.action
                });
                menu.remove();
              };
              menu.appendChild(item);
            });
            
            document.body.appendChild(menu);
            
            // Close menu when clicking elsewhere
            setTimeout(() => {
              document.addEventListener('click', (e) => {
                if (!menu.contains(e.target)) {
                  menu.remove();
                }
              }, { once: true });
            }, 10);
          }

          function selectQuickReply() {
            const quickReplies = document.getElementById('quickReplies');
            const selectedReply = quickReplies.value;
            if (selectedReply) {
              const input = document.getElementById('messageInput');
              input.value = selectedReply;
              quickReplies.value = ''; // Reset dropdown
              sendMessage();
            }
          }

          // Clipboard paste handling for images
          document.getElementById('messageInput').addEventListener('paste', async (e) => {
            const items = e.clipboardData.items;
            for (let i = 0; i < items.length; i++) {
              if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                const blob = items[i].getAsFile();
                const reader = new FileReader();
                reader.onload = function(event) {
                  const base64Data = event.target.result.split(',')[1];
                  const inputContainer = document.querySelector('.input-area');
                  
                  // Create image preview
                  const imagePreview = document.createElement('div');
                  imagePreview.className = 'image-preview';
                  imagePreview.innerHTML = \`<img src="data:\${blob.type};base64,\${base64Data}" alt="Pasted image"><span class="remove-image">×</span>\`;
                  imagePreview.dataset.imageData = base64Data;
                  imagePreview.dataset.mimeType = blob.type;
                  
                  inputContainer.insertBefore(imagePreview, document.getElementById('messageInput'));
                  
                  imagePreview.querySelector('.remove-image').addEventListener('click', () => {
                    imagePreview.remove();
                  });
                };
                reader.readAsDataURL(blob);
              }
            }
          });

          function triggerUpdate() {
            console.log('Update button clicked, sending message to extension...');
            vscode.postMessage({
              type: 'triggerUpdate'
            });
          }

          function addMessageToUI(msg) {
            const container = document.getElementById('messages');
            
            // Remove empty state
            const empty = container.querySelector('.empty-state');
            if (empty) empty.remove();

            const isAgent = msg.sender === 'agent';
            const row = document.createElement('div');
            row.className = \`message-row \${isAgent ? 'agent' : 'user'}\`;
            
            const time = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            row.innerHTML = \`
              <div class="message-info">
                <span class="sender">\${isAgent ? 'Agent' : 'You'}</span>
                <span class="timestamp">\${time}</span>
              </div>
              <div class="message-bubble">
                <div class="message-content">\${marked.parse(msg.content)}</div>
              </div>
            \`;
            
            container.appendChild(row);
            container.scrollTop = container.scrollHeight;
          }

          function sendMessage() {
            const input = document.getElementById('messageInput');
            const content = input.value.trim();
            if (!content) return;

            vscode.postMessage({
              type: 'sendMessage',
              content: content,
              requestId: currentPendingRequestId
            });

            input.value = '';
            input.style.height = 'auto';
            setControlsEnabled(false);
          }

          function sendChip(text) {
            const input = document.getElementById('messageInput');
            const currentText = input.value.trim();
            if (currentText !== '') {
              input.value = text + ' ' + currentText;
            } else {
              input.value = text;
            }
            sendMessage();
          }

          function setControlsEnabled(enabled) {
            document.getElementById('sendButton').disabled = !enabled;
            const chips = document.querySelectorAll('.chip');
            chips.forEach(c => c.disabled = !enabled);
          }

          // Global variable to store current server status
          let currentServerStatus = null;

          function getDynamicMenuOptions() {
            const options = [
              { text: '📊 Show Status', action: 'requestServerStatus' }
            ];
            
            // Server management options based on current status
            if (currentServerStatus) {
              if (currentServerStatus.isRunning) {
                options.push({ text: '🔴 Stop Server', action: 'stopServer' });
                options.push({ text: '🔄 Restart Server', action: 'restartServer' });
              } else {
                options.push({ text: '▶️ Start Server', action: 'startServer' });
              }
              
              // Proxy options if proxy is running
              if (currentServerStatus.proxy && currentServerStatus.proxy.running) {
                const proxyUrl = \`http://127.0.0.1:\${currentServerStatus.proxy.port}\`;
                
                // Global proxy options
                if (currentServerStatus.globalProxyEnabled) {
                  options.push({ text: '🔌 Disable Proxy', action: 'disableGlobalProxy' });
                } else {
                  options.push({ text: '🔌 Enable Proxy', action: 'enableGlobalProxy' });
                }
                
                // Certificate management options
                options.push({ text: '🔐 Install Proxy Certificate', action: 'installCertificate' });
                options.push({ text: '🗑️ Uninstall Proxy Certificate', action: 'uninstallCertificate' });
              }
            }
            
            // Session-specific options
            options.push({ text: window.overrideFileExists ? '📁 Recreate Override File' : '📁 Create Override File', action: 'overridePrompt' });
            options.push({ text: '📝 Name This Chat', action: 'nameSession' });
            options.push({ text: '🌐 Open Web View', action: 'openWebView' });
            options.push({ text: '❓ Help & Documentation', action: 'openHelp' });
            options.push({ text: '🐛 Report Issue', action: 'reportIssue' });
            options.push({ text: '💡 Request Feature', action: 'requestFeature' });
            
            return options;
          }

          function handleMcpAction(action) {
            vscode.postMessage({
              type: 'mcpAction',
              action: action
            });
          }

          function requestServerStatus() {
            vscode.postMessage({
              type: 'requestServerStatus'
            });
          }

          // Auto-scroll to bottom
          const messagesContainer = document.getElementById('messages');
          messagesContainer.scrollTop = messagesContainer.scrollHeight;

          // Listen for messages from extension
          window.addEventListener('message', event => {
            const msg = event.data;
            switch (msg.type) {
              case 'chat_message':
                handleIncomingChatMessage(msg);
                break;
              case 'request-state-change':
                handleRequestStateChange(msg.data);
                break;
              case 'serverStatus':
                updateStatusUI(msg.data);
                break;
              case 'serverStarted':
                // Handled by extension
                break;
            }
          });

          function handleIncomingChatMessage(data) {
            const message = data.message;
            addMessageToUI(message);
          }

          function handleRequestStateChange(data) {
            console.log('Request state changed:', data);
            if (data.state === 'waiting_for_response') {
              currentPendingRequestId = data.requestId;
              setControlsEnabled(true);
              
              // Remove old indicator
              const oldIndicator = document.querySelector('.waiting-indicator');
              if (oldIndicator) oldIndicator.remove();
              
              // Special tool controls
              const chipsContainer = document.getElementById('chipsContainer');
              if (chipsContainer) {
                if (data.toolName === 'Request_Approval') {
                  chipsContainer.innerHTML = \`
                    <button class="chip" style="background:var(--vscode-testing-iconPassed);color:white;font-weight:bold" onclick="sendChip('✅ Approved. Proceed with the action.')">✅ Approve</button>
                    <button class="chip" style="background:var(--vscode-testing-iconFailed);color:white;font-weight:bold" onclick="sendChip('❌ Denied. Please do not proceed.')">❌ Deny</button>
                    <button class="chip" onclick="sendChip('Approve, but with modifications: ')">📝 Approve with changes</button>
                  \`;
                } else if (data.toolName === 'Get_Next_Task') {
                  chipsContainer.innerHTML = \`
                    <button class="chip" onclick="sendChip('Wait for further instructions.')">⏸️ Wait</button>
                    <button class="chip" onclick="sendChip('You are done. Good job.')">✅ Complete</button>
                  \`;
                } else if (data.toolName === 'Ask_Oracle') {
                  chipsContainer.innerHTML = \`
                    <button class="chip" onclick="sendChip('Let me check the logs and get back to you.')">🔍 Checking...</button>
                    <button class="chip" onclick="sendChip('Please provide more details about the error.')">ℹ️ Need more info</button>
                  \`;
                } else {
                  // Default quick replies
                  chipsContainer.innerHTML = \`${quickReplyOptions.map(option => 
                    `<button class="chip" onclick="sendChip('${this._escapeHtml(option)}')">${this._escapeHtml(option)}</button>`
                  ).join('')}\`;
                }
              }
              
              // Play sound
              playNotificationBeep();
            } else {
              currentPendingRequestId = null;
              setControlsEnabled(false);
            }
          }

          function updateStatusUI(data) {
            currentServerStatus = data;
            const sDot = document.getElementById('server-status-dot');
            const pDot = document.getElementById('proxy-status-dot');
            
            if (data.isRunning) {
              sDot.className = 'status-dot online';
            } else {
              sDot.className = 'status-dot offline';
            }

            if (data.proxy && data.proxy.running) {
              pDot.className = data.globalProxyEnabled ? 'status-dot online' : 'status-dot pending';
            } else {
              pDot.className = 'status-dot offline';
            }
          }

          function showConfigMenu() {
            vscode.postMessage({ type: 'mcpAction', action: 'requestServerStatus' });
          }

          // Set up SSE connection for real-time server events
          let currentEventSource = null;
          let connectionInProgress = false;
          let reconnectAttempts = 0;
          let reconnectTimeout = null;
          const MAX_RECONNECT_DELAY = 30000; // 30 seconds max
          const BASE_RECONNECT_DELAY = 1000; // Start at 1 second
          
          // Synchronize UI state with server state after reconnection
          async function syncSessionState() {
            try {
              const response = await fetch(\`http://localhost:${this.port}/sessions/\${sessionId}/state\`);
              const state = await response.json();
              
              if (state.latestPendingRequest) {
                // There's a pending request - ensure UI is ready to respond
                const sendButton = document.getElementById('sendButton');
                const quickReplies = document.getElementById('quickReplies');
                
                if (sendButton) sendButton.disabled = false;
                if (quickReplies) quickReplies.disabled = false;
                
                // Add waiting indicator if not already present
                if (!document.querySelector('.waiting-indicator')) {
                  const indicator = document.createElement('div');
                  indicator.className = 'waiting-indicator';
                  indicator.textContent = 'Waiting for response...';
                  indicator.style.cssText = 'padding: 10px; background: #fff3cd; color: #856404; border: 1px solid #ffc107; border-radius: 4px; margin: 10px; text-align: center;';
                  document.body.appendChild(indicator);
                }
                
                console.log('✅ Session state synced - pending request found, UI ready for response');
              } else {
                // No pending requests - UI is idle
                const sendButton = document.getElementById('sendButton');
                const quickReplies = document.getElementById('quickReplies');
                
                if (sendButton) sendButton.disabled = true;
                if (quickReplies) quickReplies.disabled = true;
                
                // Remove any waiting indicator
                const indicator = document.querySelector('.waiting-indicator');
                if (indicator) indicator.remove();
                
                console.log('✅ Session state synced - no pending requests, UI idle');
              }
            } catch (error) {
              console.error('Failed to sync session state:', error);
            }
          }
          
          function updateConnectionStatus(connected, error = false) {
            const statusElement = document.getElementById('server-status-text');
            const statusDot = document.querySelector('.status-dot');
            
            if (statusElement) {
              if (connected) {
                statusElement.textContent = 'HumanAgent MCP Server (Connected)';
                if (statusDot) statusDot.style.backgroundColor = '#4caf50';
              } else if (error) {
                statusElement.textContent = 'HumanAgent MCP Server (Disconnected)';
                if (statusDot) statusDot.style.backgroundColor = '#f44336';
              } else {
                statusElement.textContent = 'HumanAgent MCP Server (Connecting...)';
                if (statusDot) statusDot.style.backgroundColor = '#ff9800';
              }
            }
          }
          
          function getReconnectDelay() {
            // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s, 30s, ...
            const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), MAX_R          function setupSSEConnection() {
            if (connectionInProgress) return;
            connectionInProgress = true;
            
            try {
              if (currentEventSource && currentEventSource.readyState !== 2) {
                currentEventSource.close();
              }
              
              const eventSource = new EventSource(\`http://localhost:${this.port}/mcp?sessionId=\${sessionId}\`);
              currentEventSource = eventSource;
              
              eventSource.onopen = () => {
                connectionInProgress = false;
                reconnectAttempts = 0;
                updateStatusUI({ isRunning: true }); // Assume server is up if SSE works
              };
              
              eventSource.onmessage = (event) => {
                try {
                  const data = JSON.parse(event.data);
                  if (data.type === 'heartbeat') return;
                  
                  if (data.type === 'request-state-change') {
                    handleRequestStateChange(data.data);
                  } else if (data.type === 'chat_message') {
                    handleIncomingChatMessage(data);
                  }
                } catch (e) {
                  console.error('SSE Error:', e);
                }
              };
              
              eventSource.onerror = () => {
                eventSource.close();
                connectionInProgress = false;
                const delay = Math.min(1000 * Math.pow(2, reconnectAttempts++), 30000);
                setTimeout(setupSSEConnection, delay);
              };
            } catch (e) {
              connectionInProgress = false;
            }
          }

          // Initial scroll and connection
          setupSSEConnection();
          const messages = document.getElementById('messages');
          messages.scrollTop = messages.scrollHeight;
        </script>
      </body>
      </html>
    `;
  }

  private _escapeHtml(unsafe: string) {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
