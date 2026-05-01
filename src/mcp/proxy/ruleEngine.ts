import { ProxyRule, ProxyLogEntry } from './types';
import { ProxyLogger } from './logger';

export class ProxyRuleEngine {
    private rules: ProxyRule[] = [];
    private currentSessionId?: string;
    private currentWorkspaceFolder?: string;

    constructor(private logger: ProxyLogger) {}

    public setRules(rules: ProxyRule[]): void {
        this.rules = rules;
        this.logger.addDebugLog(`Set ${rules.length} proxy rules`);
    }

    public getRules(): ProxyRule[] {
        return [...this.rules];
    }

    public setSessionContext(sessionId?: string): void {
        this.currentSessionId = sessionId;
        this.logger.addDebugLog(`Session context updated: ${sessionId || 'none'}`);
    }

    public setWorkspaceContext(workspaceFolder?: string): void {
        this.currentWorkspaceFolder = workspaceFolder;
        this.logger.addDebugLog(`Workspace context updated: ${workspaceFolder || 'none'}`);
    }

    public getApplicableRules(): ProxyRule[] {
        return this.rules.filter(rule => {
            const scope = rule.scope || 'global';
            
            if (scope === 'global') return true;
            
            if (scope === 'session') {
                const matches = rule.sessionId === this.currentSessionId;
                if (!matches) {
                    this.logger.addDebugLog(`   ⏭️  Skipping session rule "${rule.name || rule.id}" - requires session "${rule.sessionName || rule.sessionId}" but current is "${this.currentSessionId || 'none'}"`);
                }
                return matches;
            }
            
            if (scope === 'workspace') {
                const matches = rule.workspaceFolder === this.currentWorkspaceFolder;
                if (!matches) {
                    this.logger.addDebugLog(`   ⏭️  Skipping workspace rule "${rule.name || rule.id}" - requires workspace "${rule.workspaceFolder}" but current is "${this.currentWorkspaceFolder || 'none'}"`);
                }
                return matches;
            }
            
            return false;
        });
    }

    public async applyRuleModifications(req: any, rule: ProxyRule, ruleIndex: number): Promise<any> {
        const originalUrl = req.url;
        const modifications: string[] = [];
        let modifiedUrl = req.url;
        let modifiedBody: any = undefined;
        const originalBodyText = req.body?.buffer ? req.body.buffer.toString('utf8') : undefined;
        
        this.logger.addDebugLog(`   🔧 Applying modifications...`);
        
        if (rule.redirect) {
            const urlPattern = new RegExp(rule.pattern);
            modifiedUrl = req.url.replace(urlPattern, rule.redirect);
            modifications.push(`URL: ${originalUrl} → ${modifiedUrl} (Rule: ${rule.name || 'Unnamed'})`);
            this.logger.addDebugLog(`      🔀 URL Redirect: ${originalUrl} → ${modifiedUrl}`);
        }
        
        if (rule.jsonata && req.body?.buffer) {
            try {
                this.logger.addDebugLog(`      🔄 JSONata transformation: ${rule.jsonata.substring(0, 50)}...`);
                const bodyText = req.body.buffer.toString('utf8');
                let bodyJson: any;
                
                try {
                    bodyJson = JSON.parse(bodyText);
                } catch {
                    const lines = bodyText.trim().split('\n');
                    if (lines.length > 1) {
                        bodyJson = lines.map((line: string) => JSON.parse(line.trim()));
                    } else {
                        throw new Error('Invalid JSON format');
                    }
                }
                
                const JSONata = (await import('jsonata')).default;
                const expression = JSONata(rule.jsonata);
                const transformedData = await expression.evaluate(bodyJson);
                
                this.logger.addDebugLog(`JSONata RESULT: ${JSON.stringify(transformedData)}`);
                
                if (transformedData !== undefined && transformedData !== null) {
                    const transformedString = JSON.stringify(transformedData);
                    const originalString = JSON.stringify(bodyJson);
                    
                    if (transformedString !== originalString) {
                        modifiedBody = transformedData;
                        modifications.push(`JSONata: Applied transformation "${rule.jsonata.length > 30 ? rule.jsonata.substring(0, 30) + '...' : rule.jsonata}" (Rule: ${rule.name || 'Unnamed'})`);
                        this.logger.addDebugLog(`         ✅ SUCCESS - Body transformed (${originalString.length} → ${transformedString.length} bytes)`);
                    } else {
                        this.logger.addDebugLog(`         ⚠️  NO CHANGE - Transformation returned same data`);
                    }
                } else {
                    this.logger.addDebugLog(`         ❌ NULL RESULT - Transformation returned undefined/null`);
                }
            } catch (error) {
                this.logger.addDebugLog(`         ❌ ERROR: ${error}`);
            }
        }
        
        const protocol = req.url.startsWith('https://') ? 'https' : 'http';
        const logEntry: ProxyLogEntry = {
            id: this.logger.generateLogId(),
            timestamp: Date.now(),
            method: req.method,
            url: req.url,
            requestHeaders: { ...req.headers } as Record<string, string | string[]>,
            requestBody: originalBodyText,
            requestBodyOriginal: originalBodyText,
            requestBodyModified: modifiedBody !== undefined ? JSON.stringify(modifiedBody) : undefined,
            protocol: protocol,
            ruleApplied: modifications.length > 0 ? {
                ruleId: rule.id,
                ruleIndex: ruleIndex,
                originalUrl: originalUrl !== req.url ? originalUrl : undefined,
                modifications: modifications
            } : undefined
        };
        
        this.logger.addLogEntry(logEntry);
        
        const result: any = {};
        if (modifiedUrl !== originalUrl) {
            result.url = modifiedUrl;
            this.logger.addDebugLog(`   📤 Returning modified URL`);
        }
        
        if (modifiedBody !== undefined) {
            result.body = JSON.stringify(modifiedBody);
            this.logger.addDebugLog(`   📤 Returning modified body (${result.body.length} bytes)`);
        }
        
        if (Object.keys(result).length === 0) {
            this.logger.addDebugLog(`   ⚠️  No modifications applied - returning original`);
            this.logger.addDebugLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            return req;
        }
        
        this.logger.addDebugLog(`   ✅ Modifications complete: ${Object.keys(result).join(', ')}`);
        this.logger.addDebugLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        return result;
    }

    public isMatch(rule: ProxyRule, url: string): boolean {
        if (rule.pattern.startsWith('^') || rule.pattern.includes('.*') || rule.pattern.includes('\\')) {
            const urlPattern = new RegExp(rule.pattern);
            return urlPattern.test(url);
        } else {
            const normalizedPattern = rule.pattern.trim().toLowerCase();
            const normalizedUrl = url.trim().toLowerCase();
            return normalizedUrl === normalizedPattern || 
                   normalizedUrl.includes(normalizedPattern) ||
                   url === rule.pattern ||
                   url.includes(rule.pattern);
        }
    }
}
