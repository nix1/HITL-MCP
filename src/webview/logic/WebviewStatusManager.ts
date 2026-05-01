import * as vscode from 'vscode';
import { ServerManager } from '../../serverManager';

export class WebviewStatusManager {
    constructor(private readonly port: number) {}

    public async getServerStatusMessage() {
        const serverManager = ServerManager.getInstance();
        const status = await serverManager.getServerStatus();
        
        const config = vscode.workspace.getConfiguration();
        const globalProxySetting = config.inspect('http.proxy')?.globalValue;
        const proxyUrl = status.proxy?.running ? `http://127.0.0.1:${status.proxy.port}` : null;
        const globalProxyEnabled = proxyUrl && globalProxySetting === proxyUrl;

        return {
            type: 'serverStatus',
            data: {
                isRunning: status.isRunning,
                running: status.isRunning,
                tools: 1,
                pendingRequests: 0,
                registered: true,
                configType: 'native',
                proxy: status.proxy,
                proxyEnabled: globalProxyEnabled,
                globalProxyEnabled: globalProxyEnabled
            }
        };
    }

    public getUpdateNotificationMessage(version: string) {
        return {
            type: 'updateAvailable',
            version: version
        };
    }

    public getFlashBorderMessage() {
        return {
            type: 'flashBorder'
        };
    }

    public getServerStartedMessage() {
        return {
            type: 'serverStarted'
        };
    }
}
