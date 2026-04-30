import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateCACertificate } from 'mockttp';

// Version injected by webpack DefinePlugin at build time
declare const __PACKAGE_VERSION__: string;
export const VERSION = typeof __PACKAGE_VERSION__ !== 'undefined' ? __PACKAGE_VERSION__ : '1.0.4';

/**
 * Initialize HTTPS proxy CA certificate (generate or load cached)
 * @param storagePath - Path to store certificate (from VS Code globalStorage or fallback to temp)
 */
export async function initializeProxyCA(storagePath?: string): Promise<{ keyPath: string; certPath: string }> {
  // Use provided storage path or fallback to temp directory
  const caCacheDir = storagePath 
    ? path.join(storagePath, 'proxy-ca')
    : path.join(os.tmpdir(), 'hitl-proxy');
    
  const caPath = path.join(caCacheDir, 'ca.pem');
  const keyPath = path.join(caCacheDir, 'ca.key');
  
  // Ensure cache directory exists
  if (!fs.existsSync(caCacheDir)) {
    fs.mkdirSync(caCacheDir, { recursive: true });
    console.log(`[ProxyServer] Created certificate storage directory: ${caCacheDir}`);
  }
  
  // Check if CA already generated and cached
  if (fs.existsSync(caPath) && fs.existsSync(keyPath)) {
    console.log('[ProxyServer] Using cached HTTPS proxy CA');
    console.log(`[ProxyServer] Certificate location: ${caPath}`);
    return { keyPath, certPath: caPath };
  }
  
  // Generate new CA certificate
  console.log('[ProxyServer] Generating new HTTPS proxy CA certificate...');
  try {
    const ca = await generateCACertificate({
      subject: {
        commonName: 'HITL Proxy CA - Testing Only',
        organizationName: 'HITL'
      },
      bits: 2048
    });
    
    fs.writeFileSync(caPath, ca.cert);
    fs.writeFileSync(keyPath, ca.key);
    
    console.log('[ProxyServer] HTTPS proxy CA certificate generated and cached');
    console.log(`[ProxyServer] Certificate location: ${caPath}`);
    
    return { keyPath, certPath: caPath };
  } catch (error) {
    console.error('[ProxyServer] Failed to generate CA certificate:', error);
    throw error;
  }
}
