import { EventEmitter } from 'events';
import * as http from 'http';

export interface McpMessage {
  id: string;
  type: 'request' | 'response' | 'notification';
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

export interface McpServerConfig {
  name: string;
  description: string;
  version: string;
  capabilities: {
    chat: boolean;
    tools: boolean;
    resources: boolean;
  };
}

export interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'agent';
  timestamp: Date;
  type: 'text' | 'image' | 'file';
  source?: 'mcp' | 'vscode' | 'web';
  toolName?: string;
  toolData?: any;
}

export interface HITLSession {
  id: string;
  workspacePath?: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: any;
}

export interface HITLChatToolParams {
  message: string;
  context?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  sessionId?: string;
  [key: string]: any;
}

export interface HITLChatToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
}

export interface Memento {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: any): Thenable<void>;
}

export interface IMcpServer {
  handleMessage(message: any): Promise<any>;
  registerSession(sessionId: string, workspacePath?: string, overrideData?: any): void;
  unregisterSession(sessionId: string): void;
  getActiveSessions(): string[];
  getSessionState(sessionId: string): any;
  getMessages(sessionId: string): any[];
  sendToWebInterface(eventType: string, data: any): void;
  sendToSession(sessionId: string, eventType: string, data: any): void;
  sendToSessionAndWeb(sessionId: string, eventType: string, data: any): void;
  
  // Proxy management
  getProxyRules(): Promise<any[]>;
  initializeDefaultRules(): Promise<void>;
  updateProxyRules(rules: any[]): Promise<void>;
  addProxyRule(name: string, pattern: string, redirect?: string, jsonata?: string, enabled?: boolean, dropRequest?: boolean, dropStatusCode?: number, scope?: string, sessionId?: string, sessionName?: string, workspaceFolder?: string, debug?: boolean): Promise<string>;
  updateProxyRule(ruleId: string, updates: any): Promise<boolean>;
  deleteProxyRule(ruleId: string): Promise<boolean>;
  handleProxyLogUpdate(logEntry: any): void;
  
  stop(): Promise<void>;
  
  // Property accessors needed by HTTP server
  readonly port: number;
  readonly debugLogger: any;
  readonly chatManager: any;
  readonly proxyServer: any;
  readonly globalStorage?: Memento;
  readonly vscodeSessionMapping: Map<string, { sessionId: string, workspacePath?: string }>;
  readonly sessionWorkspacePaths: Map<string, string>;
  readonly sessionNames: Map<string, string>;
  readonly sessionMessageSettings: Map<string, any>;
  readonly activeSessions: Set<string>;
}