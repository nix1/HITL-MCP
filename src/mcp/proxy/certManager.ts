import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateCACertificate } from 'mockttp';
import { ProxyLogger } from './logger';

export class ProxyCertificateManager {
    constructor(private logger: ProxyLogger) {}

    public async initializeProxyCA(storagePath?: string): Promise<{ keyPath: string; certPath: string }> {
        const caCacheDir = storagePath 
            ? path.join(storagePath, 'proxy-ca')
            : path.join(os.tmpdir(), 'hitl-proxy');
            
        const caPath = path.join(caCacheDir, 'ca.pem');
        const keyPath = path.join(caCacheDir, 'ca.key');
        
        if (!fs.existsSync(caCacheDir)) {
            fs.mkdirSync(caCacheDir, { recursive: true });
            this.logger.addDebugLog(`Created certificate storage directory: ${caCacheDir}`);
        }
        
        if (fs.existsSync(caPath) && fs.existsSync(keyPath)) {
            this.logger.addDebugLog('Using cached HTTPS proxy CA');
            return { keyPath, certPath: caPath };
        }
        
        this.logger.addDebugLog('Generating new HTTPS proxy CA certificate...');
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
            
            this.logger.addDebugLog('HTTPS proxy CA certificate generated and cached');
            return { keyPath, certPath: caPath };
        } catch (error) {
            this.logger.addDebugLog(`Failed to generate CA certificate: ${error}`);
            throw error;
        }
    }
}
