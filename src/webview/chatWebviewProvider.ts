import * as vscode from 'vscode';
import { getChatWebviewHtml } from './chatWebviewHtml';
import { McpServer } from '../mcp/server';
import { McpConfigManager } from '../mcp/mcpConfigManager';
import { AudioNotification } from '../audio/audioNotification';
import { WebviewActionHandler } from './logic/WebviewActionHandler';
import { WebviewStatusManager } from './logic/WebviewStatusManager';
import { WebviewMessageHandler } from './logic/WebviewMessageHandler';

export class ChatWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'hitl-mcp.chatView';

  private _view?: vscode.WebviewView;
  private extensionPath: string;
  private registrationCheckComplete = false;
  private notificationSettings = { enableSound: true, enableFlashing: true };
  
  private actionHandler: WebviewActionHandler;
  private statusManager: WebviewStatusManager;
  private messageHandler: WebviewMessageHandler;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private mcpServer: McpServer | null,
    private mcpConfigManager?: McpConfigManager,
    private readonly workspaceSessionId?: string,
    private readonly context?: vscode.ExtensionContext,
    private readonly mcpProvider?: any,
    private readonly port: number = 3737
  ) {
    this.extensionPath = _extensionUri.fsPath;
    this.loadNotificationSettings();
    
    this.actionHandler = new WebviewActionHandler(this.port, this.workspaceSessionId, this.context);
    this.statusManager = new WebviewStatusManager(this.port);
    this.messageHandler = new WebviewMessageHandler(
        this.actionHandler,
        this.statusManager,
        this.sendHumanResponse.bind(this),
        this.handleSessionNameUpdate.bind(this)
    );
  }

  private loadNotificationSettings() {
    const config = vscode.workspace.getConfiguration('hitl-mcp');
    this.notificationSettings = {
      enableSound: config.get<boolean>('notifications.enableSound', true),
      enableFlashing: config.get<boolean>('notifications.enableFlashing', true)
    };
  }

  public async displayHITLMessage(message: string, context?: string, requestId?: string) {
    if (requestId) this.actionHandler.currentRequestId = requestId;
    this.updateWebview();
    
    if (this.notificationSettings.enableFlashing) {
      this._view?.webview.postMessage(this.statusManager.getFlashBorderMessage());
    }
    if (this.notificationSettings.enableSound) {
      AudioNotification.playNotificationBeep().catch(() => {});
    }
    this._view?.show?.(true);
  }

  public clearPendingRequest() {
    this.actionHandler.currentRequestId = undefined;
    this.updateWebview();
  }

  public notifyServerStarted() {
    this._view?.webview.postMessage(this.statusManager.getServerStartedMessage());
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri, vscode.Uri.joinPath(this._extensionUri, 'dist'), vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'media')],
      retainContextWhenHidden: true
    };

    if (this.registrationCheckComplete) this.updateWebview();

    webviewView.webview.onDidReceiveMessage(data => this.messageHandler.handleMessage(data, webviewView.webview));
  }

  private updateWebview() {
    if (this._view) {
      const requestId = this.actionHandler.currentRequestId;
      this._view.webview.html = getChatWebviewHtml(this._view.webview, this.extensionPath, requestId, this.workspaceSessionId, this.port);
    }
  }

  public showUpdateNotification(version: string) {
    this._view?.webview.postMessage(this.statusManager.getUpdateNotificationMessage(version));
  }

  public refreshWebview() { this.updateWebview(); }

  public notifyRegistrationComplete() {
    this.registrationCheckComplete = true;
    this.updateWebview();
  }

  private async sendHumanResponse(content: string, requestId?: string, images?: any[]) {
    const responseRequestId = requestId || this.actionHandler.currentRequestId;
    if (!responseRequestId) return;

    try {
      await fetch(`http://localhost:${this.port}/response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sessionId: this.workspaceSessionId,
          requestId: responseRequestId, 
          response: content, 
          source: 'vscode', 
          images 
        })
      });
      this.actionHandler.currentRequestId = undefined;
    } catch (error) {
      console.error('Failed to send response:', error);
    }
  }

  private async handleSessionNameUpdate(sessionId: string, name: string) {
    if (this.context) {
      await this.context.globalState.update(`hitl-session-name-${sessionId}`, name);
      if (sessionId === this.workspaceSessionId) vscode.window.showInformationMessage(`Session renamed: "${name}"`);
    }
  }
}
