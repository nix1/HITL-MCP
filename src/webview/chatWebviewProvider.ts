import { getChatWebviewHtml } from './chatWebviewHtml';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { McpServer } from '../mcp/server';
import { ChatMessage } from '../mcp/types';
import { McpConfigManager } from '../mcp/mcpConfigManager';
import { AudioNotification } from '../audio/audioNotification';

import { ServerManager } from '../serverManager';

export class ChatWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'hitl-mcp.chatView';

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
      const config = vscode.workspace.getConfiguration('hitl-mcp');
      this.notificationSettings = {
        enableSound: config.get<boolean>('notifications.enableSound', true),
        enableFlashing: config.get<boolean>('notifications.enableFlashing', true)
      };
    } catch (error) {
      console.error('ChatWebviewProvider: Error loading notification settings:', error);
      // Use defaults on error
    }
  }

  public async displayHITLMessage(message: string, context?: string, requestId?: string) {
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
        this._extensionUri,
        vscode.Uri.joinPath(this._extensionUri, 'dist'),
        vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'media')
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
          vscode.commands.executeCommand('hitl-mcp.updateExtension');
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
      this._view.webview.html = getChatWebviewHtml(this._view.webview, this.extensionPath, this.currentRequestId, this.workspaceSessionId, this.port);
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
    const certVerified = await vscode.commands.executeCommand('hitl-mcp.verifyCertificate') as boolean;
    
    if (!certVerified) {
      const action = await vscode.window.showErrorMessage(
        '⚠️ Proxy certificate is not installed or not trusted. HTTPS traffic will fail without the certificate.',
        'Install Certificate',
        'Cancel'
      );
      
      if (action === 'Install Certificate') {
        await vscode.commands.executeCommand('hitl-mcp.installProxyCertificate');
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
      const overrideFilePath = path.join(vscodeDir, 'HITLOverride.json');

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
      const defaultTool = toolsData.tools.find((tool: any) => tool.name === 'HITL_Chat');
      if (!defaultTool) {
        throw new Error('HITL_Chat tool not found on server');
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
        description: 'HITL MCP Tool Overrides for this workspace. Modify tool configurations below to customize MCP server behavior.',
        tools: {
          HITL_Chat: defaultTool,
          example_custom_tool: exampleTool
        },
        messageSettings: {
          global: {
            autoAppendEnabled: false,
            autoAppendText: ""
          },
          toolSpecific: {
            HITL_Chat: {
              autoAppendEnabled: true,
              autoAppendText: "(No need to confirm this last part but please remember) Dont forget to allways reply here in the HITL_Chat tool! Dont circumevent this tool unless asked explicitly by the user. "
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
          await vscode.commands.executeCommand('hitl-mcp.startServer');
          break;
        case 'stopServer':
          // Always disable proxy before stopping server
          await this.disableProxy();
          await vscode.commands.executeCommand('hitl-mcp.stopServer');
          break;
        case 'restartServer':
          await vscode.commands.executeCommand('hitl-mcp.restartServer');
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
          await vscode.commands.executeCommand('hitl-mcp.installProxyCertificate');
          break;
        case 'uninstallCertificate':
          await vscode.commands.executeCommand('hitl-mcp.uninstallProxyCertificate');
          break;
        case 'register':
        case 'unregister':
          // Registration handled automatically by native provider
          vscode.window.showInformationMessage('HITL MCP registration is handled automatically by the native provider.');
          break;
        case 'testSound':
          // Test notification sound by triggering a fake notification
          await this.displayHITLMessage('🔊 Audio test - this is a test notification sound!', 'Testing audio notifications', 'test-audio');
          break;
        case 'requestServerStatus':
          // Show the same notification popup as the main status command
          vscode.commands.executeCommand('hitl-mcp.showStatus');
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
          vscode.env.openExternal(vscode.Uri.parse('https://github.com/nix1/HITL-MCP#readme'));
          break;
        case 'reportIssue':
          vscode.env.openExternal(vscode.Uri.parse('https://github.com/nix1/HITL-MCP/issues/new'));
          break;
        case 'requestFeature':
          vscode.env.openExternal(vscode.Uri.parse('https://github.com/nix1/HITL-MCP/issues/new'));
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
        await this.context.globalState.update(`hitl-session-name-${sessionId}`, name);
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
      const webUrl = `http://localhost:${this.port}/HITL`;
      
      // Open in external browser
      await vscode.env.openExternal(vscode.Uri.parse(webUrl));
      
      vscode.window.showInformationMessage('Web interface opened in browser');
      
    } catch (error) {
      console.error('ChatWebviewProvider: Error opening web interface:', error);
      vscode.window.showErrorMessage(`Failed to open web interface: ${error}`);
    }
  }

}
