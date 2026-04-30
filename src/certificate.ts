import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as util from 'util';

const execAsync = util.promisify(exec);

export async function verifyCertificateInstallation(): Promise<boolean> {
	try {
		console.log('[CertVerify] Checking certificate installation...');
		
		// Platform-specific certificate verification
		return new Promise<boolean>((resolve) => {
			let checkCommand: string;
			
			if (process.platform === 'darwin') {
				// macOS: Check if certificate exists in System.keychain
				checkCommand = 'security find-certificate -c "HITL Proxy CA" /Library/Keychains/System.keychain 2>&1';
			} else if (process.platform === 'win32') {
				// Windows: Check if certificate exists in Root store
				checkCommand = 'certutil -verifystore Root "HITL Proxy CA" 2>&1';
			} else {
				// Linux: Check NSS database
				checkCommand = 'certutil -L -d sql:$HOME/.pki/nssdb 2>&1 | grep "HITL Proxy CA"';
			}
			
			// Execute check command
			const { exec } = require('child_process');
			exec(checkCommand, (error: any, stdout: string, stderr: string) => {
				if (error) {
					// Certificate not found
					console.log(`[CertVerify] ❌ Certificate not installed (exit code: ${error.code})`);
					resolve(false);
					return;
				}
				
				// Check if certificate name appears in output
				if (stdout.includes('HITL Proxy CA')) {
					console.log('[CertVerify] ✅ Certificate is installed in system keychain');
					resolve(true);
				} else {
					console.log('[CertVerify] ❌ Certificate not found in system keychain');
					resolve(false);
				}
			});
		});
	} catch (error) {
		console.log(`[CertVerify] ❌ Verification failed: ${error}`);
		return false;
	}
}
