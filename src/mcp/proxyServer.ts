import { EventEmitter } from 'events';
import * as Mockttp from 'mockttp';
import * as fs from 'fs';
import { ProxyRule, ProxyLogEntry, ProxyRuleScope } from './proxy/types';
import { ProxyLogger } from './proxy/logger';
import { ProxyRuleEngine } from './proxy/ruleEngine';
import { ProxyCertificateManager } from './proxy/certManager';

export { ProxyRule, ProxyLogEntry, ProxyRuleScope };

/**
 * ProxyServer manages the Mockttp proxy instance
 * Runs as part of the MCP server process
 */
export class ProxyServer extends EventEmitter {
    private mockttpServer: Mockttp.Mockttp | null = null;
    private port: number = 0;
    private isRunning: boolean = false;
    private httpsOptions?: { keyPath: string; certPath: string };
    private sessionLookup?: (vscodeSessionId: string) => { sessionId: string, workspacePath?: string } | undefined;
    
    private logger: ProxyLogger;
    private ruleEngine: ProxyRuleEngine;
    public certManager: ProxyCertificateManager;

    constructor(sessionLookup?: (vscodeSessionId: string) => { sessionId: string, workspacePath?: string } | undefined) {
        super();
        this.sessionLookup = sessionLookup;
        this.logger = new ProxyLogger();
        this.ruleEngine = new ProxyRuleEngine(this.logger);
        this.certManager = new ProxyCertificateManager(this.logger);
        
        // Forward logger events
        this.logger.on('log-added', (entry) => this.emit('log-added', entry));
        this.logger.on('logs-cleared', () => this.emit('logs-cleared'));
        this.logger.on('debug-log-added', (entry) => this.emit('debug-log-added', entry));
    }

    private addDebugLog(message: string) {
        this.logger.addDebugLog(message);
    }

    getDebugLogs(): Array<{timestamp: string, message: string}> {
        return this.logger.getDebugLogs();
    }

    async start(httpsOptions?: { keyPath: string; certPath: string }): Promise<number> {
        if (this.isRunning) {
            this.addDebugLog('Already running');
            return this.port;
        }

        try {
            this.httpsOptions = httpsOptions;
            const config: any = { cors: true, recordTraffic: false };
            
            if (httpsOptions?.keyPath && httpsOptions?.certPath) {
                const certContent = fs.readFileSync(httpsOptions.certPath, 'utf8');
                const keyContent = fs.readFileSync(httpsOptions.keyPath, 'utf8');
                config.https = { cert: certContent, key: keyContent };
                this.addDebugLog(`HTTPS enabled with CA cert from: ${httpsOptions.certPath}`);
            }

            this.mockttpServer = Mockttp.getLocal(config);
            await this.setupUnifiedHandler();
            await this.mockttpServer.start();
            this.port = this.mockttpServer.port;
            this.isRunning = true;

            this.addDebugLog(`Started on port ${this.port}`);
            this.emit('started', this.port);
            return this.port;
        } catch (error) {
            console.error('[ProxyServer] Failed to start:', error);
            this.emit('error', error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        if (!this.isRunning || !this.mockttpServer) return;

        try {
            await this.mockttpServer.stop();
            this.isRunning = false;
            this.port = 0;
            this.addDebugLog('Stopped');
            this.emit('stopped');
        } catch (error) {
            console.error('[ProxyServer] Failed to stop:', error);
            this.emit('error', error);
            throw error;
        }
    }

    getPort(): number { return this.port; }

    getStatus(): { running: boolean; port: number } {
        return { running: this.isRunning, port: this.port };
    }

    getLogs(): ProxyLogEntry[] { return this.logger.getLogs(); }

    clearLogs(): void { this.logger.clearLogs(); }

    clearDebugLogs(): void { this.logger.clearDebugLogs(); }

    async reloadRules(): Promise<void> {
        if (!this.isRunning) {
            this.addDebugLog('Proxy not running, skipping rule reload');
            return;
        }
        const httpsOpts = this.httpsOptions;
        await this.stop();
        await this.start(httpsOpts);
    }

    setRules(rules: any[]): void {
        this.ruleEngine.setRules(rules);
    }

    getRules(): any[] {
        return this.ruleEngine.getRules();
    }

    setSessionContext(sessionId?: string): void {
        this.ruleEngine.setSessionContext(sessionId);
    }

    setWorkspaceContext(workspaceFolder?: string): void {
        this.ruleEngine.setWorkspaceContext(workspaceFolder);
    }

    private async setupUnifiedHandler(): Promise<void> {
        if (!this.mockttpServer) return;
        
        await this.mockttpServer.forAnyRequest()
            .thenPassThrough({
                beforeRequest: async (req) => {
                    this.addDebugLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
                    this.addDebugLog(`📥 INCOMING REQUEST: ${req.method} ${req.url}`);
                    
                    // Session detection
                    const vscodeSessionId = req.headers['vscode-sessionid'];
                    if (vscodeSessionId && this.sessionLookup) {
                        const sessionContext = this.sessionLookup(vscodeSessionId as string);
                        if (sessionContext) {
                            this.ruleEngine.setSessionContext(sessionContext.sessionId);
                            if (sessionContext.workspacePath) {
                                this.ruleEngine.setWorkspaceContext(sessionContext.workspacePath);
                            }
                        }
                    } else {
                        const sessionId = req.headers['x-session-id'] || req.headers['x-vscode-session-id'] || req.headers['session-id'];
                        if (sessionId) this.ruleEngine.setSessionContext(sessionId as string);
                    }
                    
                    const applicableRules = this.ruleEngine.getApplicableRules().filter(r => r.enabled);
                    
                    for (let i = 0; i < applicableRules.length; i++) {
                        const rule = applicableRules[i];
                        const ruleIndex = this.ruleEngine.getRules().findIndex(r => r.id === rule.id) + 1;
                        const isMatch = this.ruleEngine.isMatch(rule, req.url);
                        
                        if (isMatch) {
                            if (rule.dropRequest) {
                                const dropStatusCode = rule.dropStatusCode || 204;
                                this.addDebugLog(`   🎯 RULE MATCHED! [DROP] Applying "${rule.name || rule.id}"`);
                                
                                const protocol = req.url.startsWith('https://') ? 'https' : 'http';
                                const originalBodyText = req.body?.buffer ? req.body.buffer.toString('utf8') : undefined;
                                const logEntry: ProxyLogEntry = {
                                    id: this.logger.generateLogId(),
                                    timestamp: Date.now(),
                                    method: req.method,
                                    url: req.url,
                                    requestHeaders: { ...req.headers } as Record<string, string | string[]>,
                                    requestBody: originalBodyText,
                                    requestBodyOriginal: originalBodyText,
                                    responseStatus: dropStatusCode,
                                    responseHeaders: {},
                                    responseBody: `Request dropped by proxy rule (status ${dropStatusCode})`,
                                    duration: 0,
                                    protocol: protocol,
                                    ruleApplied: {
                                        ruleId: rule.id,
                                        ruleIndex: ruleIndex,
                                        modifications: [`Request dropped with status ${dropStatusCode}`],
                                        hoverInfo: {
                                            originalText: 'Request sent to server',
                                            replacementText: `Dropped with ${dropStatusCode} status`
                                        }
                                    }
                                };
                                this.logger.addLogEntry(logEntry);
                                this.emit('log-updated', logEntry);
                                throw new Error(`DROPPED:${dropStatusCode}`);
                            }

                            return await this.ruleEngine.applyRuleModifications(req, rule, ruleIndex);
                        }
                    }
                    
                    const protocol = req.url.startsWith('https://') ? 'https' : 'http';
                    const originalBodyText = req.body?.buffer ? req.body.buffer.toString('utf8') : undefined;
                    const logEntry: ProxyLogEntry = {
                        id: this.logger.generateLogId(),
                        timestamp: Date.now(),
                        method: req.method,
                        url: req.url,
                        requestHeaders: { ...req.headers } as Record<string, string | string[]>,
                        requestBody: originalBodyText,
                        requestBodyOriginal: originalBodyText,
                        protocol: protocol
                    };
                    this.logger.addLogEntry(logEntry);
                    return req;
                },
                beforeResponse: async (res) => {
                    const logEntry = [...this.logger.getLogs()].reverse().find(entry => entry.responseStatus === undefined);
                    if (logEntry) {
                        logEntry.responseStatus = res.statusCode;
                        logEntry.responseHeaders = { ...res.headers } as Record<string, string | string[]>;
                        logEntry.responseBody = res.body?.buffer ? res.body.buffer.toString('utf8') : undefined;
                        logEntry.duration = Date.now() - logEntry.timestamp;
                        this.emit('log-updated', logEntry);
                        this.addDebugLog(`   ✅ Response: ${res.statusCode} (${logEntry.duration}ms)`);
                    }
                }
            });
    }
}
