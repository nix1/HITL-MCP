import * as vscode from 'vscode';

export let updateStatusBarItem: vscode.StatusBarItem | undefined;

export async function checkForUpdates(): Promise<string | null> {
	try {
		const currentVersion = vscode.extensions.getExtension('3DTek-xyz.hitl-mcp')?.packageJSON.version;
		if (!currentVersion) {
			console.log('[UpdateCheck] Could not determine current extension version');
			return null;
		}

		console.log(`[UpdateCheck] Current version: ${currentVersion}`);

		// Query VS Code Marketplace API for latest version
		const response = await fetch('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
			method: 'POST',
			headers: {
				'Accept': 'application/json;api-version=3.0-preview.1',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				filters: [{
					criteria: [
						{ filterType: 7, value: '3DTek-xyz.hitl-mcp' }
					]
				}],
				flags: 914
			})
		});

		if (!response.ok) {
			console.log(`[UpdateCheck] Marketplace API returned ${response.status}`);
			return null;
		}

		const data: any = await response.json();
		const extension = data.results?.[0]?.extensions?.[0];
		if (!extension) {
			console.log('[UpdateCheck] Extension not found in marketplace response');
			return null;
		}

		const latestVersion = extension.versions?.[0]?.version;
		if (!latestVersion) {
			console.log('[UpdateCheck] Could not parse latest version from marketplace');
			return null;
		}

		console.log(`[UpdateCheck] Latest marketplace version: ${latestVersion}`);

		// Compare versions (simple string comparison works for semantic versioning)
		if (latestVersion > currentVersion) {
			console.log(`[UpdateCheck] ✅ Update available: ${currentVersion} → ${latestVersion}`);
			return latestVersion;
		}

		console.log('[UpdateCheck] Extension is up to date');
		return null;
	} catch (error) {
		console.log(`[UpdateCheck] Failed to check for updates: ${error}`);
		return null;
	}
}

export async function performUpdate() {
	try {
		// Trigger VS Code's built-in extension update
		await vscode.commands.executeCommand('workbench.extensions.installExtension', '3DTek-xyz.hitl-mcp', {
			installPreReleaseVersion: false
		});
		
		// Hide status bar item after update starts
		if (updateStatusBarItem) {
			updateStatusBarItem.dispose();
			updateStatusBarItem = undefined;
		}
		
		vscode.window.showInformationMessage(
			'HITL MCP is updating. You may need to reload VS Code after installation.',
			'Reload Now'
		).then(choice => {
			if (choice === 'Reload Now') {
				vscode.commands.executeCommand('workbench.action.reloadWindow');
			}
		});
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to update extension: ${error}`);
	}
}
