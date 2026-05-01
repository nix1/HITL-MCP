import * as vscode from 'vscode';
import { WebviewActionHandler } from './WebviewActionHandler';
import { WebviewStatusManager } from './WebviewStatusManager';

export class WebviewMessageHandler {
    constructor(
        private readonly actionHandler: WebviewActionHandler,
        private readonly statusManager: WebviewStatusManager,
        private readonly sendHumanResponse: (content: string, requestId?: string, images?: any[]) => Promise<void>,
        private readonly handleSessionNameUpdate: (sessionId: string, name: string) => Promise<void>
    ) {}

    public async handleMessage(data: any, webview: vscode.Webview): Promise<void> {
        switch (data.type) {
            case 'sendMessage':
                await this.sendHumanResponse(data.content, data.requestId, data.images);
                break;
            case 'mcpAction':
                await this.actionHandler.handleAction(data.action, async () => {
                    const statusMsg = await this.statusManager.getServerStatusMessage();
                    webview.postMessage(statusMsg);
                });
                break;
            case 'requestServerStatus':
                const statusMsg = await this.statusManager.getServerStatusMessage();
                webview.postMessage(statusMsg);
                break;
            case 'sessionNameUpdated':
                await this.handleSessionNameUpdate(data.sessionId, data.name);
                break;
            case 'triggerUpdate':
                vscode.commands.executeCommand('hitl-mcp.updateExtension');
                break;
        }
    }
}
