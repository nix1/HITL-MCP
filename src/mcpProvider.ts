import * as vscode from 'vscode';

export class HITLMcpProvider implements vscode.McpServerDefinitionProvider {
    private _onDidChangeMcpServerDefinitions = new vscode.EventEmitter<void>();
    readonly onDidChangeMcpServerDefinitions = this._onDidChangeMcpServerDefinitions.event;
    private serverVersion: string = Date.now().toString();

    constructor(private sessionId: string, private port: number) {}

    provideMcpServerDefinitions(token: vscode.CancellationToken): vscode.ProviderResult<vscode.McpHttpServerDefinition[]> {
        // Use separate endpoint for MCP tools to avoid SSE conflicts with webview
        const serverUrl = `http://127.0.0.1:${this.port}/mcp-tools?sessionId=${this.sessionId}`;
        const serverUri = vscode.Uri.parse(serverUrl);
        const server = new vscode.McpHttpServerDefinition('HITLMCP', serverUri, {}, this.serverVersion);
        console.log(`HITL MCP: Using separate MCP tools endpoint to avoid SSE conflicts (version: ${this.serverVersion})`);
        return [server];
    }

    // Update version to force VS Code to refresh cached tool definitions
    updateServerVersion(): void {
        this.serverVersion = Date.now().toString();
        console.log(`HITL MCP: Updated server version to ${this.serverVersion} to force tool cache refresh`);
    }

    // Method to fire the change event when override files are reloaded
    notifyServerDefinitionsChanged(): void {
        this.updateServerVersion(); // Force VS Code to refresh cached tool definitions
        console.log('HITL MCP: Firing onDidChangeMcpServerDefinitions event');
        this._onDidChangeMcpServerDefinitions.fire();
    }

    // Update session ID when it changes
    updateSessionId(newSessionId: string): void {
        this.sessionId = newSessionId;
        this.notifyServerDefinitionsChanged();
    }
}
