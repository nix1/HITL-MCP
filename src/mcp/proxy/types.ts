/**
 * ProxyRule scope type
 */
export type ProxyRuleScope = 'global' | 'session' | 'workspace';

/**
 * ProxyRule represents a proxy rule configuration
 */
export interface ProxyRule {
    id: string;
    name: string;
    pattern: string;
    enabled: boolean;
    createdAt: string;
    redirect?: string;
    jsonata?: string;
    dropRequest?: boolean;
    dropStatusCode?: number;
    scope?: ProxyRuleScope;
    sessionId?: string;
    sessionName?: string;
    workspaceFolder?: string;
    debug?: boolean; // Enable enhanced debug logging for this rule
}

/**
 * ProxyLogEntry represents a single HTTP request/response captured by the proxy
 */
export interface ProxyLogEntry {
    id: string;
    timestamp: number;
    method: string;
    url: string;
    requestHeaders: Record<string, string | string[]>;
    requestBody?: string;
    requestBodyOriginal?: string;
    requestBodyModified?: string;
    responseStatus?: number;
    responseHeaders?: Record<string, string | string[]>;
    responseBody?: string;
    duration?: number;
    protocol?: string; // 'http' | 'https'
    ruleApplied?: {
        ruleId: string;
        ruleIndex: number;
        originalUrl?: string;
        modifications?: string[];
        hoverInfo?: {
            originalText: string;
            replacementText: string;
        };
    };
}
