import { registerAllCommands } from './commands';
import { HITLMcpProvider } from './mcpProvider';
import { checkForUpdates, performUpdate } from './updater';
import { verifyCertificateInstallation } from './certificate';
import * as vscode from 'vscode';
import * as path from 'path';
import * as net from 'net';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as https from 'https';
import { spawn } from 'child_process';
import { ChatTreeProvider } from './providers/chatTreeProvider';
import { ChatWebviewProvider } from './webview/chatWebviewProvider';
import { McpConfigManager } from './mcp/mcpConfigManager';
import { ServerManager } from './serverManager';


let chatTreeProvider: ChatTreeProvider;
let mcpConfigManager: McpConfigManager;
let workspaceSessionId: string;
let serverManager: ServerManager;
let SERVER_PORT: number; // Dynamic port: 3738 for dev, 3737 for production

let updateStatusBarItem: vscode.StatusBarItem | undefined;
let chatWebviewProvider: ChatWebviewProvider;
let outputChannel: vscode.OutputChannel;

export function log(message: string) {
	if (outputChannel) {
		outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
	}
	console.log(message);
}

// MCP Server Definition Provider for VS Code native MCP integration

let mcpProvider: HITLMcpProvider;

// Generate or retrieve persistent workspace session ID
function getWorkspaceSessionId(context: vscode.ExtensionContext): string {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const workspaceKey = workspaceRoot ? `workspace-${crypto.createHash('md5').update(workspaceRoot).digest('hex')}` : 'no-workspace';
	
	// Check if running in Extension Development Host
	const isDevHost = context.extensionMode === vscode.ExtensionMode.Development;
	const devSuffix = isDevHost ? '-dev' : '';
	const stateKey = `sessionId-${workspaceKey}${devSuffix}`;
	
	// Try to get existing session ID from global state
	let sessionId = context.globalState.get<string>(stateKey);
	
	if (!sessionId) {
		// Generate new UUID-based session ID
		sessionId = `session-${crypto.randomUUID()}${devSuffix}`;
		// Store it persistently
		context.globalState.update(stateKey, sessionId);
		console.log(`Generated new workspace session ID: ${sessionId} for ${workspaceKey}${isDevHost ? ' (dev host)' : ''}`);
	} else {
		console.log(`Retrieved existing workspace session ID: ${sessionId} for ${workspaceKey}${isDevHost ? ' (dev host)' : ''}`);
	}
	
	return sessionId;
}

// Restore and send persisted session name to server
async function restoreSessionName(context: vscode.ExtensionContext, sessionId: string, port: number) {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const workspaceKey = workspaceRoot ? `workspace-${crypto.createHash('md5').update(workspaceRoot).digest('hex')}` : 'no-workspace';
	
	const savedName = context.globalState.get<string>(`sessionName-${workspaceKey}`);
	
	if (savedName) {
		try {
			// Send the saved name to the server
			const response = await fetch(`http://localhost:${port}/sessions/name`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					sessionId: sessionId,
					name: savedName
				})
			});
			
			if (response.ok) {
				console.log(`Restored session name: "${savedName}" for session ${sessionId}`);
			} else {
				console.log(`Failed to restore session name: HTTP ${response.status}`);
			}
		} catch (error) {
			console.log(`Failed to restore session name: ${error}`);
		}
	}
}

/**
 * Check for extension updates from VS Code Marketplace
 * @returns Promise<string | null> - Latest version if available, null otherwise
 */

/**
 * Show update notification and handle user response
 */
async function notifyUpdate(latestVersion: string, context: vscode.ExtensionContext) {
	// Create persistent status bar item FIRST (before dialog)
	updateStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	updateStatusBarItem.text = `$(cloud-download) v${latestVersion}`;
	updateStatusBarItem.tooltip = `HITL MCP update available - Click to update to version ${latestVersion}`;
	updateStatusBarItem.command = 'hitl-mcp.updateExtension';
	updateStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
	updateStatusBarItem.show();
	
	context.subscriptions.push(updateStatusBarItem);
	
	console.log(`[UpdateCheck] Status bar item created and shown for v${latestVersion}`);
	
	// Show notification without await so status bar is immediately visible
	vscode.window.showInformationMessage(
		`HITL MCP v${latestVersion} is available! You're currently on an older version.`,
		'Update Now',
		'Later'
	).then(selection => {
		if (selection === 'Update Now') {
			performUpdate();
		}
	});
}

/**
 * Perform the extension update
 */

/**
 * Verify that the proxy CA certificate is installed and working
 * Platform-independent approach: Checks if cert exists in system keychain
 * @returns Promise<boolean> - true if certificate is installed, false otherwise
 */

export async function activate(extContext: vscode.ExtensionContext) {
	// Initialize Output Channel
	outputChannel = vscode.window.createOutputChannel('HITL MCP');
	extContext.subscriptions.push(outputChannel);
	log('HITL MCP extension activated!');

	// Determine port based on extension mode (dev vs production)
	SERVER_PORT = extContext.extensionMode === vscode.ExtensionMode.Development ? 3738 : 3737;
	log(`Using port ${SERVER_PORT} (${extContext.extensionMode === vscode.ExtensionMode.Development ? 'development' : 'production'} mode);`);

	// Generate or retrieve persistent workspace session ID
	workspaceSessionId = getWorkspaceSessionId(extContext);

	// Initialize MCP Configuration Manager
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	mcpConfigManager = new McpConfigManager(workspaceRoot, extContext.extensionPath, SERVER_PORT);

	// Initialize and register VS Code native MCP provider
	mcpProvider = new HITLMcpProvider(workspaceSessionId, SERVER_PORT);
	extContext.subscriptions.push(vscode.lm.registerMcpServerDefinitionProvider('hitl-mcp.server', mcpProvider));
	log('HITL MCP: Registered MCP server definition provider');

	// Fire startup event if override file exists to refresh VS Code tools
	if (workspaceRoot) {
		const overrideFilePath = path.join(workspaceRoot, '.vscode', 'HITLOverride.json');
		if (require('fs').existsSync(overrideFilePath)) {
			log('HITL MCP: Override file detected on startup, firing onDidChangeMcpServerDefinitions');
			mcpProvider.notifyServerDefinitionsChanged();
		}
	}

	// Initialize Server Manager
	const serverPath = path.join(extContext.extensionPath, 'dist', 'mcpStandalone.js');
	
	// Check if logging is enabled via user settings
	const config = vscode.workspace.getConfiguration('hitl-mcp');
	const loggingEnabled = config.get<boolean>('logging.enabled', false);
	const loggingLevel = config.get<string>('logging.level', 'INFO');
	
	// Get certificate storage path from VS Code global storage
	const certStoragePath = extContext.globalStorageUri.fsPath;
	
	const serverOptions: any = {
		serverPath: serverPath,
		port: SERVER_PORT,
		host: '127.0.0.1',
		loggingEnabled: loggingEnabled,
		loggingLevel: loggingLevel,
		certStoragePath: certStoragePath
	};
	
	// Enable logging by default to .vscode directory if it exists
	if (vscode.workspace.workspaceFolders?.[0]) {
		const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
		const vscodeDir = path.join(workspacePath, '.vscode');
		if (!fs.existsSync(vscodeDir)) {
			fs.mkdirSync(vscodeDir, { recursive: true });
		}
		serverOptions.logFile = path.join(vscodeDir, 'HITL-server.log');
		log(`HITL MCP: Server logging enabled to ${serverOptions.logFile}`);
		serverOptions.loggingEnabled = true;
		serverOptions.loggingLevel = 'DEBUG';
	}
	
	log(`HITL MCP: Certificate storage path: ${certStoragePath}`);
	
	serverManager = ServerManager.getInstance(serverOptions);

	// Auto-start server and register session (no mcp.json dependency)
	await ensureServerAndRegisterSession(workspaceSessionId);

	// Check for extension updates on startup
	checkForUpdates().then(latestVersion => {
		if (latestVersion) {
			notifyUpdate(latestVersion, extContext);
			
			// Also send to webview if it's active
			if (chatWebviewProvider) {
				chatWebviewProvider.showUpdateNotification(latestVersion);
			}
		}
	}).catch(error => {
		log(`[UpdateCheck] Update check failed: ${error}`);
	});

	// Show startup notification
	const notificationConfig = vscode.workspace.getConfiguration('hitl-mcp');
	const showStartupNotification = notificationConfig.get<boolean>('notifications.showStartup', true);
	
	if (showStartupNotification) {
		vscode.window.showInformationMessage(
			'HITL MCP Extension is a new tool - please report any issues or suggestions on GitHub!',
			'Open Chat',
			'Show Status',
			'Kill Server'
		).then(selection => {
			switch (selection) {
				case 'Open Chat':
					vscode.commands.executeCommand('hitl-mcp.chatView.focus');
					break;
				case 'Show Status':
					vscode.commands.executeCommand('hitl-mcp.showStatus');
					break;
				case 'Kill Server':
					vscode.commands.executeCommand('hitl-mcp.killServer');
					break;
			}
		});
	}

	// Restore the persisted session name after server is running (with retry)
	setTimeout(async () => {
		try {
			await restoreSessionName(extContext, workspaceSessionId, SERVER_PORT);
		} catch (error) {
			log(`HITL MCP: Could not restore session name on startup (server may not be ready yet): ${error}`);
		}
	}, 1000); // Wait 1 second for server to fully start

	// Initialize Tree View Provider
	chatTreeProvider = new ChatTreeProvider();
	const treeView = vscode.window.createTreeView('hitl-mcp.chatSessions', {
		treeDataProvider: chatTreeProvider,
		showCollapseAll: true
	});

	// Update proxy status in tree view periodically
	const updateProxyStatus = async () => {
		try {
			const serverStatus = await serverManager.getServerStatus();
			chatTreeProvider.updateProxyStatus(serverStatus.proxy);
		} catch (error) {
			log(`Failed to update proxy status: ${error}`);
		}
	};
	
	// Initial update
	updateProxyStatus();
	
	// Update every 10 seconds
	const proxyStatusInterval = setInterval(updateProxyStatus, 10000);
	extContext.subscriptions.push({ dispose: () => clearInterval(proxyStatusInterval) });

	// Initialize Chat Webview Provider (no internal server dependency)
	chatWebviewProvider = new ChatWebviewProvider(extContext.extensionUri, null, mcpConfigManager, workspaceSessionId, extContext, mcpProvider, SERVER_PORT);
	extContext.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ChatWebviewProvider.viewType, chatWebviewProvider)
	);

	// Notify webview that registration check is complete
	chatWebviewProvider.notifyRegistrationComplete();

	// Register openOutput command
	extContext.subscriptions.push(vscode.commands.registerCommand('hitl-mcp.openOutput', () => {
		if (outputChannel) {
			outputChannel.show();
		}
	}));

	const commandDisposables = registerAllCommands(extContext, serverManager, chatWebviewProvider, chatTreeProvider, workspaceSessionId, SERVER_PORT);



	// Add all disposables to context
	extContext.subscriptions.push(
		treeView,
		...commandDisposables
	);

	// Show welcome message
	//vscode.window.showInformationMessage('HITL MCP extension activated successfully!');
}

// Simplified server startup and session registration (no mcp.json dependency)
async function ensureServerAndRegisterSession(sessionId: string): Promise<void> {
	try {
		console.log(`HITL MCP: Starting server and registering session ${sessionId}...`);
		
		// Check if server is accessible, if not start it
		const serverAccessible = await isServerAccessible();
		if (!serverAccessible) {
			console.log('HITL MCP: Server not accessible, starting server...');
			const serverStarted = await serverManager.ensureServerRunning();
			if (!serverStarted) {
				console.error('HITL MCP: Failed to start server');
				vscode.window.showWarningMessage('HITL MCP Server could not be started. Some features may not work.');
				return;
			}
			console.log('HITL MCP: Server started successfully');
		}
		
		// Register session with the server
		const sessionExists = await validateSessionWithServer(sessionId);
		if (!sessionExists) {
			console.log(`HITL MCP: Session ${sessionId} not found on server, registering new session...`);
			await registerSessionWithStandaloneServer(sessionId, false);
		} else {
			console.log(`HITL MCP: Session ${sessionId} exists on server, re-registering with override data...`);
			await registerSessionWithStandaloneServer(sessionId, true);
		}
		console.log(`HITL MCP: Session registration complete for ${sessionId}`);
		
		// Validate session context with server (restores persisted session state)
		const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
		if (workspacePath) {
			try {
				const validateResponse = await fetch(`http://127.0.0.1:${SERVER_PORT}/validate-session`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						vscodeSessionId: vscode.env.sessionId,
						//vscodeSessionId: sessionId,
						workspacePath: workspacePath
					}),
					signal: AbortSignal.timeout(5000)
				});
				
				if (validateResponse.ok) {
					const result: any = await validateResponse.json();
					console.log(`HITL MCP: Session context validated - restored: ${result.restored}`);
				} else {
					console.warn(`HITL MCP: Session validation returned status ${validateResponse.status}`);
				}
			} catch (error) {
				console.warn('HITL MCP: Session context validation failed (non-fatal):', error);
				// Non-fatal - server will get context on first request if validation fails
			}
		}
		
	} catch (error) {
		console.error('HITL MCP: Failed to start server or register session:', error);
		vscode.window.showWarningMessage('HITL MCP Server could not be initialized. Please check the server status and try reloading the workspace.');
	}
}

// Check if a port is in use (using HTTP server like the MCP server)
async function isPortInUse(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const http = require('http');
		const server = http.createServer();
		
		server.listen(port, '127.0.0.1', () => {
			server.close(() => resolve(false)); // Port is available
		});
		
		server.on('error', () => {
			resolve(true); // Port is in use
		});
	});
}

// Check if MCP server is accessible and responding with retry
async function isServerAccessible(): Promise<boolean> {
	try {
		const response = await fetch(`http://127.0.0.1:${SERVER_PORT}/sessions`, {
			method: 'GET',
			signal: AbortSignal.timeout(5000) // 5 second timeout
		});
		return response.ok;
	} catch (error) {
		console.log('HITL MCP: Server accessibility check failed, retrying in 3 seconds...', error);
		
		// Wait 3 seconds and try once more
		await new Promise(resolve => setTimeout(resolve, 3000));
		
		try {
			const retryResponse = await fetch(`http://127.0.0.1:${SERVER_PORT}/sessions`, {
				method: 'GET',
				signal: AbortSignal.timeout(5000)
			});
			
			if (retryResponse.ok) {
				console.log('HITL MCP: Server accessible on retry');
				return true;
			}
		} catch (retryError) {
			console.log('HITL MCP: Server accessibility retry failed:', retryError);
		}
		
		return false;
	}
}

// Check if session exists on server by testing a simple MCP call with retry
async function validateSessionWithServer(sessionId: string): Promise<boolean> {
	try {
		const response = await fetch(`http://127.0.0.1:${SERVER_PORT}/mcp`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ 
				sessionId,
				method: 'tools/list'
			})
		});
		
		if (response.ok) {
			const result = await response.json() as any;
			console.log(`HITL MCP: Session ${sessionId} validated on server`);
			return true;
		} else {
			console.log(`HITL MCP: Session ${sessionId} not found on server (${response.status})`);
			return false;
		}
	} catch (error) {
		console.log(`HITL MCP: Session ${sessionId} validation failed, retrying in 3 seconds...`, error);
		
		// Wait 3 seconds and try once more
		await new Promise(resolve => setTimeout(resolve, 3000));
		
		try {
			const retryResponse = await fetch(`http://127.0.0.1:${SERVER_PORT}/mcp`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ 
					sessionId,
					method: 'tools/list'
				})
			});
			
			if (retryResponse.ok) {
				const result = await retryResponse.json() as any;
				console.log(`HITL MCP: Session ${sessionId} validated on server (retry)`);
				return true;
			} else {
				console.log(`HITL MCP: Session ${sessionId} not found on server (${retryResponse.status}) (retry)`);
				return false;
			}
		} catch (retryError) {
			console.log(`HITL MCP: Session ${sessionId} validation retry failed:`, retryError);
			return false;
		}
	}
}

// Register session with standalone server via HTTP (always sends override data) with retry
async function registerSessionWithStandaloneServer(sessionId: string, forceReregister: boolean = false): Promise<void> {
	// Read workspace override file if it exists
	let overrideData = null;
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (workspaceRoot) {
		const overrideFilePath = path.join(workspaceRoot, '.vscode', 'HITLOverride.json');
		try {
			const fs = require('fs');
			if (fs.existsSync(overrideFilePath)) {
				const overrideContent = fs.readFileSync(overrideFilePath, 'utf8');
				overrideData = JSON.parse(overrideContent);
				console.log(`HITL MCP: Loaded override data for session ${sessionId}`);
			}
		} catch (error) {
			console.error(`HITL MCP: Error reading override file:`, error);
		}
	}
	
	// Get VS Code's session ID for mapping
	const vscodeSessionId = vscode.env.sessionId;
	console.log(`HITL MCP: VS Code Session ID: ${vscodeSessionId}`);
	console.log(`HITL MCP: Workspace Path: ${workspaceRoot || 'none'}`);
	
	const requestBody = { 
		sessionId,
		vscodeSessionId: vscodeSessionId,
		workspacePath: workspaceRoot,
		overrideData: overrideData,
		forceReregister: forceReregister
	};
	
	try {
		const response = await fetch(`http://127.0.0.1:${SERVER_PORT}/sessions/register`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(requestBody)
		});
		
		if (response.ok) {
			const result = await response.json() as any;
			console.log(`HITL MCP: Session ${sessionId} registered successfully. Total sessions: ${result.totalSessions}`);
			return;
		} else {
			console.error(`HITL MCP: Failed to register session ${sessionId}: ${response.status}`);
		}
	} catch (error) {
		console.error(`HITL MCP: Error registering session ${sessionId}, retrying in 3 seconds...`, error);

		
		// Wait 3 seconds and try once more
		await new Promise(resolve => setTimeout(resolve, 3000));
		
		try {
			const retryResponse = await fetch(`http://127.0.0.1:${SERVER_PORT}/sessions/register`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody)
			});
			
			if (retryResponse.ok) {
				const result = await retryResponse.json() as any;
				console.log(`HITL MCP: Session ${sessionId} registered successfully on retry. Total sessions: ${result.totalSessions}`);
				return;
			} else {
				console.error(`HITL MCP: Failed to register session ${sessionId} on retry: ${retryResponse.status}`);
				throw new Error(`Registration failed: ${retryResponse.status}`);
			}
		} catch (retryError) {
			console.error(`HITL MCP: Session registration retry failed:`, retryError);
			throw new Error(`Registration failed after retry: ${retryError}`);
		}
	}
}

// Unregister session with standalone server via HTTP
async function unregisterSessionWithStandaloneServer(sessionId: string): Promise<void> {
	try {
		const response = await fetch(`http://127.0.0.1:${SERVER_PORT}/sessions/unregister`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ sessionId })
		});
		
		if (response.ok) {
			const result = await response.json() as any;
			console.log(`HITL MCP: Session ${sessionId} unregistered successfully. Total sessions: ${result.totalSessions}`);
		} else {
			console.error(`HITL MCP: Failed to unregister session ${sessionId}: ${response.status}`);
		}
	} catch (error) {
		console.error(`HITL MCP: Error unregistering session ${sessionId}:`, error);
	}
}

// Check if server is accessible and register session, or start server if needed
async function ensureServerAccessibleAndRegister(sessionId: string, configType: 'workspace' | 'global'): Promise<void> {
	try {
		console.log(`HITL MCP: Checking if server is accessible for ${configType} configuration...`);
		
		// Check if server is running and accessible
		let serverAccessible = await isServerAccessible();
		
		if (!serverAccessible) {
			console.log('HITL MCP: Server not accessible, attempting to start it...');
			
			// Try to start the server
			const started = await serverManager.ensureServerRunning();
			if (started) {
				console.log('HITL MCP: Server started successfully, rechecking accessibility...');
				// Wait a moment for server to fully initialize
				await new Promise(resolve => setTimeout(resolve, 2000));
				serverAccessible = await isServerAccessible();
			} else {
				console.log('HITL MCP: Failed to start server');
			}
		}
		
		if (serverAccessible) {
			console.log('HITL MCP: Server is accessible, registering session...');
			// Server is running, validate and register session
			const sessionExists = await validateSessionWithServer(sessionId);
			if (!sessionExists) {
				console.log(`HITL MCP: Session ${sessionId} not found on server, registering new session...`);
				await registerSessionWithStandaloneServer(sessionId, false);
			} else {
				console.log(`HITL MCP: Session ${sessionId} exists on server, re-registering with override data...`);
				await registerSessionWithStandaloneServer(sessionId, true);
			}
			console.log(`HITL MCP: Session registration complete for ${sessionId}`);
		} else {
			// Server still not accessible after trying to start it
			console.log('HITL MCP: Server could not be started or is not responding');
			const configLocation = configType === 'workspace' ? 'workspace' : 'global';
			
			vscode.window.showWarningMessage(
				`HITL MCP Server is configured in ${configLocation} settings but could not be started. Would you like to try starting it manually?`,
				'Start Server', 'Show Status', 'Open Configuration'
			).then(selection => {
				switch (selection) {
					case 'Start Server':
						vscode.commands.executeCommand('hitl-mcp.startServer');
						break;
					case 'Show Status':
						vscode.commands.executeCommand('hitl-mcp.showStatus');
						break;
					case 'Open Configuration':
						vscode.commands.executeCommand('hitl-mcp.configureMcp');
						break;
				}
			});
		}
		
	} catch (error) {
		console.error('Error checking server accessibility:', error);
		vscode.window.showErrorMessage('Failed to check HITL MCP Server accessibility');
	}
}

export async function deactivate() {
	
	if (workspaceSessionId) {
		// Unregister from standalone server
		await unregisterSessionWithStandaloneServer(workspaceSessionId);
	}
	
	// Dispose the server manager (this won't stop the server, just cleanup resources)
	if (serverManager) {
		serverManager.dispose();
	}
	
	// Note: We don't kill the standalone server as it's running independently
	// Other extensions may still be using it, and it should persist across workspace changes
	console.log(`HITL MCP: Extension deactivated for session ${workspaceSessionId}`);
}
