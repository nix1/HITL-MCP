import * as vscode from 'vscode';
import * as path from 'path';
import { ServerManager } from './serverManager';
import { ChatWebviewProvider } from './webview/chatWebviewProvider';
import { ChatTreeProvider } from './providers/chatTreeProvider';
import * as fs from 'fs';
import { performUpdate } from './updater';
import { verifyCertificateInstallation } from './certificate';

export function registerAllCommands(
    context: vscode.ExtensionContext,
    serverManager: ServerManager,
    chatWebviewProvider: ChatWebviewProvider,
    chatTreeProvider: ChatTreeProvider,
    workspaceSessionId: string | undefined,
    SERVER_PORT: number
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];


	const openChatCommand = vscode.commands.registerCommand('hitl-mcp.openChat', () => {
		// Focus the chat webview
		vscode.commands.executeCommand('hitl-mcp.chatView.focus');
	});

	const createSessionCommand = vscode.commands.registerCommand('hitl-mcp.createSession', async () => {
		// In sessionless mode, just open the chat view
		vscode.commands.executeCommand('hitl-mcp.chatView.focus');
		vscode.window.showInformationMessage(`Chat interface ready for HITL communication`);
	});

	const refreshSessionsCommand = vscode.commands.registerCommand('hitl-mcp.refreshSessions', () => {
		// In sessionless mode, just update the tree view
		chatTreeProvider.refresh();
	});

	// Create dedicated status command
	const showStatusCommand = vscode.commands.registerCommand('hitl-mcp.showStatus', async () => {
		// Get detailed server status
		const serverStatus = await serverManager.getServerStatus();
		
		let statusMessage = 
			`HITL MCP Server Status:\n` +
			`- Running: ${serverStatus.isRunning ? '✅' : '❌'}\n` +
			`- PID: ${serverStatus.pid || 'N/A'}\n` +
			`- Port: ${serverStatus.port}\n` +
			`- Host: ${serverStatus.host}\n` +
			`- Session: ${workspaceSessionId}\n` +
			`- Registration: Native Provider ✅`;
		
		if (serverStatus.proxy) {
			statusMessage += `\n\nProxy Server:\n` +
				`- Running: ${serverStatus.proxy.running ? '✅' : '❌'}\n` +
				`- Port: ${serverStatus.proxy.port || 'N/A'}`;
		}
		
		vscode.window.showInformationMessage(statusMessage);
	});

	// Create server management commands
	const startServerCommand = vscode.commands.registerCommand('hitl-mcp.startServer', async () => {
		try {
			const success = await serverManager.ensureServerRunning();
			if (success) {
				vscode.window.showInformationMessage('HITL MCP Server started successfully!');
				// Notify webview to reset reconnection backoff and try immediately
				chatWebviewProvider.notifyServerStarted();
			} else {
				vscode.window.showErrorMessage('Failed to start HITL MCP Server. Check the logs for details.');
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to start server: ${error}`);
		}
	});

	const stopServerCommand = vscode.commands.registerCommand('hitl-mcp.stopServer', async () => {
		try {
			// First try HTTP shutdown endpoint (works from any VS Code window or client)
			try {
				const http = require('http');
				const options = {
					hostname: '127.0.0.1',
					port: SERVER_PORT,
					path: '/shutdown',
					method: 'POST',
					timeout: 5000
				};

				await new Promise<void>((resolve, reject) => {
					const req = http.request(options, (res: any) => {
						let data = '';
						res.on('data', (chunk: any) => data += chunk);
						res.on('end', () => {
							if (res.statusCode === 200) {
								resolve();
							} else {
								reject(new Error(`HTTP ${res.statusCode}`));
							}
						});
					});
					req.on('error', reject);
					req.on('timeout', () => {
						req.destroy();
						reject(new Error('Request timeout'));
					});
					req.end();
				});

				vscode.window.showInformationMessage('HITL MCP Server stopped successfully!');
			} catch (httpError) {
				// Fallback to PID kill if HTTP fails
				console.log('HTTP shutdown failed, trying PID kill:', httpError);
				const success = await serverManager.stopServer();
				if (success) {
					vscode.window.showInformationMessage('HITL MCP Server stopped successfully!');
				} else {
					vscode.window.showWarningMessage('Server may not have been running or failed to stop cleanly.');
				}
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to stop server: ${error}`);
		}
	});

	const restartServerCommand = vscode.commands.registerCommand('hitl-mcp.restartServer', async () => {
		try {
			await serverManager.stopServer();
			await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause
			const success = await serverManager.ensureServerRunning();
			if (success) {
				// MCP server restarted silently
				// Notify webview to reset reconnection backoff and try immediately
				chatWebviewProvider.notifyServerStarted();
			} else {
				vscode.window.showErrorMessage('Failed to restart HITL MCP Server. Check the logs for details.');
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to restart server: ${error}`);
		}
	});

	// Configure MCP command removed - functionality moved to webview context menu

	// Register extension update command
	const updateExtensionCommand = vscode.commands.registerCommand('hitl-mcp.updateExtension', async () => {
		await performUpdate();
	});

	// Register report issue command
	const reportIssueCommand = vscode.commands.registerCommand('hitl-mcp.reportIssue', () => {
		vscode.env.openExternal(vscode.Uri.parse('https://github.com/nix1/HITL-MCP/issues'));
	});

	// Register install proxy certificate command
	const installProxyCertificateCommand = vscode.commands.registerCommand('hitl-mcp.installProxyCertificate', async () => {
		try {
			// Get certificate path from globalStorage
			const certStoragePath = context.globalStorageUri.fsPath;
			const certPath = path.join(certStoragePath, 'proxy-ca', 'ca.pem');
			
			// Check if certificate exists
			if (!fs.existsSync(certPath)) {
				vscode.window.showErrorMessage('Proxy certificate not found. Please start the proxy server first.');
				return;
			}
			
			// Show information message explaining what will happen
			const proceed = await vscode.window.showInformationMessage(
				'This will install the HITL Proxy CA certificate to your system keychain. This requires administrator privileges (sudo password).',
				{ modal: true },
				'Install'
			);
			
			if (proceed !== 'Install') {
				return;
			}
			
			// Determine platform-specific command
			let installCommand: string;
			if (process.platform === 'darwin') {
				// macOS
				installCommand = `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${certPath}"`;
			} else if (process.platform === 'win32') {
				// Windows
				installCommand = `certutil -addstore Root "${certPath}"`;
			} else {
				// Linux
				vscode.window.showWarningMessage(
					'Certificate installation on Linux varies by distribution. Please install manually:\n' +
					`sudo cp "${certPath}" /usr/local/share/ca-certificates/hitl-proxy-ca.crt && sudo update-ca-certificates`
				);
				return;
			}
			
			// Execute installation command
			const terminal = vscode.window.createTerminal('HITL: Install Certificate');
			terminal.sendText(installCommand);
			terminal.show();
			
			// Wait a moment, then verify installation
			setTimeout(async () => {
				const verified = await verifyCertificateInstallation();
				if (verified) {
					vscode.window.showInformationMessage('✅ Proxy certificate installed successfully! You can now enable the proxy.');
				} else {
					vscode.window.showWarningMessage('Certificate installation may have failed. Please check the terminal output.');
				}
			}, 3000);
			
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to install certificate: ${error}`);
		}
	});

	// Register uninstall proxy certificate command
	const uninstallProxyCertificateCommand = vscode.commands.registerCommand('hitl-mcp.uninstallProxyCertificate', async () => {
		try {
			// Check if proxy is currently enabled
			const proxyConfig = vscode.workspace.getConfiguration().get('http.proxy');
			if (proxyConfig) {
				// Disable proxy first
				const disableFirst = await vscode.window.showWarningMessage(
					'Proxy is currently enabled. It will be disabled before uninstalling the certificate.',
					{ modal: true },
					'Continue'
				);
				
				if (disableFirst !== 'Continue') {
					return;
				}
				
				await vscode.workspace.getConfiguration().update('http.proxy', undefined, vscode.ConfigurationTarget.Global);
				// Proxy disabled silently
			}
			
			// Show confirmation message
			const proceed = await vscode.window.showWarningMessage(
				'This will remove the HITL Proxy CA certificate from your system keychain. This requires administrator privileges (sudo password).',
				{ modal: true },
				'Uninstall'
			);
			
			if (proceed !== 'Uninstall') {
				return;
			}
			
			// Determine platform-specific command
			let uninstallCommand: string;
			if (process.platform === 'darwin') {
				// macOS
				uninstallCommand = 'sudo security delete-certificate -c "HITL Proxy CA" /Library/Keychains/System.keychain';
			} else if (process.platform === 'win32') {
				// Windows
				uninstallCommand = 'certutil -delstore Root "HITL Proxy CA"';
			} else {
				// Linux
				vscode.window.showWarningMessage(
					'Certificate uninstallation on Linux varies by distribution. Please remove manually:\n' +
					'sudo rm /usr/local/share/ca-certificates/hitl-proxy-ca.crt && sudo update-ca-certificates'
				);
				return;
			}
			
			// Execute uninstallation command
			const terminal = vscode.window.createTerminal('HITL: Uninstall Certificate');
			terminal.sendText(uninstallCommand);
			terminal.show();
			
			setTimeout(() => {
				vscode.window.showInformationMessage('Certificate uninstalled. You may need to restart VS Code for changes to take effect.');
			}, 2000);
			
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to uninstall certificate: ${error}`);
		}
	});

	// Register verify certificate command (internal use by enableProxy)
	const verifyCertificateCommand = vscode.commands.registerCommand('hitl-mcp.verifyCertificate', async () => {
		return await verifyCertificateInstallation();
	});
	const killServerCommand = vscode.commands.registerCommand('hitl-mcp.killServer', async () => {
		try {
			vscode.window.showInformationMessage('Forcefully killing HITL MCP Server...');
			const success = await serverManager.stopServer();
			if (success) {
				vscode.window.showInformationMessage('HITL MCP Server killed successfully!');
			} else {
				vscode.window.showWarningMessage('Failed to kill server (it may not be running).');
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Error killing server: ${error}`);
		}
	});

	const showOutputCommand = vscode.commands.registerCommand('hitl-mcp.showOutput', () => {
		vscode.commands.executeCommand('hitl-mcp.openOutput');
	});

    return [
        openChatCommand,
        createSessionCommand,
        refreshSessionsCommand,
        showStatusCommand,
        startServerCommand,
        stopServerCommand,
        restartServerCommand,
        killServerCommand,
        showOutputCommand,
        updateExtensionCommand,
        reportIssueCommand,
        installProxyCertificateCommand,
        uninstallProxyCertificateCommand,
        verifyCertificateCommand
    ];
}
