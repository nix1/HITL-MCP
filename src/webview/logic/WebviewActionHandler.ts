import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ServerManager } from '../../serverManager';

export class WebviewActionHandler {
    public currentRequestId?: string;

    constructor(
        private readonly port: number,
        private readonly workspaceSessionId?: string,
        private readonly context?: vscode.ExtensionContext
    ) {}

    public async handleAction(action: string, updateStatusCallback: () => Promise<void>): Promise<void> {
        try {
            switch (action) {
                case 'startServer':
                    await vscode.commands.executeCommand('hitl-mcp.startServer');
                    break;
                case 'stopServer':
                    await this.disableProxy();
                    await vscode.commands.executeCommand('hitl-mcp.stopServer');
                    break;
                case 'restartServer':
                    await vscode.commands.executeCommand('hitl-mcp.restartServer');
                    break;
                case 'enableGlobalProxy':
                case 'enableProxy':
                    await this.enableProxy();
                    break;
                case 'disableGlobalProxy':
                case 'disableProxy':
                    await this.disableProxy();
                    break;
                case 'installCertificate':
                    await vscode.commands.executeCommand('hitl-mcp.installProxyCertificate');
                    break;
                case 'uninstallCertificate':
                    await vscode.commands.executeCommand('hitl-mcp.uninstallProxyCertificate');
                    break;
                case 'testSound':
                    // This is handled via displayHITLMessage in provider
                    return; 
                case 'requestServerStatus':
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
                case 'requestFeature':
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/nix1/HITL-MCP/issues/new'));
                    break;
            }
            await updateStatusCallback();
        } catch (error) {
            vscode.window.showErrorMessage(`MCP action failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public async enableProxy() {
        const serverManager = ServerManager.getInstance();
        const status = await serverManager.getServerStatus();
        if (!status.proxy?.running) {
            vscode.window.showWarningMessage('Proxy server is not running');
            return;
        }

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
    }

    public async disableProxy() {
        await vscode.workspace.getConfiguration().update('http.proxy', undefined, vscode.ConfigurationTarget.Global);
    }

    private async createPromptOverrideFile() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found.');
            return;
        }

        const vscodeDir = path.join(workspaceFolder.uri.fsPath, '.vscode');
        const overrideFilePath = path.join(vscodeDir, 'HITLOverride.json');

        if (!fs.existsSync(vscodeDir)) fs.mkdirSync(vscodeDir, { recursive: true });

        if (fs.existsSync(overrideFilePath)) {
            const result = await vscode.window.showWarningMessage('Overwrite existing file?', 'Overwrite', 'Cancel');
            if (result !== 'Overwrite') return;
        }

        const response = await fetch(`http://localhost:${this.port}/tools`);
        if (!response.ok) throw new Error(`Failed to fetch tools: ${response.status}`);
        
        const toolsData = await response.json() as { tools: any[] };
        const defaultTool = toolsData.tools.find((tool: any) => tool.name === 'HITL_Chat');
        
        const overrideConfig = {
            version: '1.0.0',
            tools: { HITL_Chat: defaultTool },
            messageSettings: {
                toolSpecific: {
                    HITL_Chat: {
                        autoAppendEnabled: true,
                        autoAppendText: "(No need to confirm this last part but please remember) Dont forget to allways reply here in the HITL_Chat tool!"
                    }
                }
            },
            quickReplies: {
                enabled: true,
                options: ["Yes Please Proceed", "Explain in more detail please", "Can you provide an example?"]
            }
        };

        fs.writeFileSync(overrideFilePath, JSON.stringify(overrideConfig, null, 2));
        vscode.window.showInformationMessage(`Override file created.`, 'Open File').then(s => {
            if (s === 'Open File') vscode.window.showTextDocument(vscode.Uri.file(overrideFilePath));
        });
    }

    private async nameCurrentSession() {
        const sessionId = this.workspaceSessionId;
        if (!sessionId) return;

        const sessionName = await vscode.window.showInputBox({ prompt: 'Enter a friendly name for this chat session' });
        if (!sessionName) return;

        const response = await fetch(`http://localhost:${this.port}/sessions/name`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, name: sessionName.trim() })
        });

        if (response.ok && this.context) {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const workspaceKey = workspaceRoot ? `workspace-${require('crypto').createHash('md5').update(workspaceRoot).digest('hex')}` : 'no-workspace';
            await this.context.globalState.update(`sessionName-${workspaceKey}`, sessionName.trim());
        }
    }

    private async openWebInterface() {
        const webUrl = `http://localhost:${this.port}/HITL`;
        await vscode.env.openExternal(vscode.Uri.parse(webUrl));
    }
}
