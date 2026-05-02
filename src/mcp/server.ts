import { EventEmitter } from 'events';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { McpMessage, McpServerConfig, HITLSession, ChatMessage, McpTool, HITLChatToolParams, HITLChatToolResult, Memento } from './types';
import { ChatManager } from './chatManager';
import { ProxyServer } from './proxyServer';
import { DebugLogger } from './logger';
import { ToolRegistry } from './toolRegistry';
import { McpHttpServer } from './httpServer';
import { IMcpServer } from './types';
import { VERSION } from './utils';

export class McpServer extends EventEmitter implements IMcpServer {
  private config: McpServerConfig;
  private isRunning: boolean = false;
  private tools: Map<string, McpTool> = new Map(); 
  private sessionTools: Map<string, Map<string, McpTool>> = new Map();
  public sessionWorkspacePaths: Map<string, string> = new Map();
  public sessionNames: Map<string, string> = new Map();
  public sessionMessageSettings: Map<string, any> = new Map();
  public vscodeSessionMapping: Map<string, { sessionId: string, workspacePath?: string }> = new Map();
  
  public httpServer: McpHttpServer;
  public port: number = 3737;
  public debugLogger: DebugLogger;
  public activeSessions: Set<string> = new Set();
  public chatManager: ChatManager;
  public proxyServer: ProxyServer;
  public globalStorage?: Memento;
  private toolRegistry: ToolRegistry;
  private requestResolvers: Map<string, { resolve: (response: string) => void; reject: (error: Error) => void }> = new Map();

  constructor(private sessionId?: string, private workspacePath?: string, port?: number) {
    super();
    if (port) this.port = port;
    this.debugLogger = new DebugLogger(this.workspacePath);
    this.chatManager = new ChatManager(this.debugLogger);
    this.toolRegistry = new ToolRegistry(this.debugLogger);
    this.proxyServer = new ProxyServer((vscodeSessionId: string) => this.vscodeSessionMapping.get(vscodeSessionId));
    
    this.config = {
      name: 'HITLMCP',
      description: 'MCP server for chatting with human agents',
      version: VERSION,
      capabilities: { chat: true, tools: true, resources: false }
    };
    
    this.tools = this.toolRegistry.getDefaultTools();
    this.httpServer = new McpHttpServer(this, this.debugLogger);
    this.setupEventForwarding();
    
    if (this.sessionId && this.workspacePath) {
      this.initializeSessionTools(this.sessionId, this.workspacePath);
    }
  }

  public setGlobalStorage(storage: Memento): void {
    this.globalStorage = storage;
    try {
      const savedMappings = this.globalStorage.get<any>('sessionMappings');
      if (savedMappings) {
        this.vscodeSessionMapping = new Map(Object.entries(savedMappings.vscodeSessionMapping || {}));
        this.activeSessions = new Set(savedMappings.activeSessions || []);
        this.sessionWorkspacePaths = new Map(Object.entries(savedMappings.sessionWorkspacePaths || {}));
      }
    } catch (error) {
      this.debugLogger.log('WARN', `Failed to restore session mappings: ${error}`);
    }
  }

  private setupEventForwarding(): void {
    this.on('request-state-change', (data) => {
      this.sendToSessionAndWeb(data.sessionId, 'request-state-change', data);
    });
  }

  public sendToWebInterface(eventType: string, data: any): void {
    this.httpServer.sendToWebInterface(eventType, data);
  }

  public sendToSession(sessionId: string, eventType: string, data: any): void {
    this.httpServer.sendToSession(sessionId, eventType, data);
  }

  public sendToSessionAndWeb(sessionId: string, eventType: string, data: any): void {
    this.httpServer.sendToSessionAndWeb(sessionId, eventType, data);
  }

  public async handleMessage(message: McpMessage): Promise<McpMessage | null> {
    this.debugLogger.log('MCP', 'Handling message:', message.method);
    try {
      switch (message.method) {
        case 'initialize': return this.handleInitialize(message);
        case 'tools/list': return this.handleToolsList(message);
        case 'tools/call': return await this.handleToolCall(message);
        case 'notifications/initialized': return null;
        default:
          return { id: message.id, type: 'response', error: { code: -32601, message: `Method ${message.method} not found` } };
      }
    } catch (error) {
      return { id: message.id, type: 'response', error: { code: -32603, message: 'Internal error', data: String(error) } };
    }
  }

  private handleInitialize(message: McpMessage): McpMessage {
    return {
      id: message.id,
      type: 'response',
      result: {
        protocolVersion: '2024-11-05',
        capabilities: this.config.capabilities,
        serverInfo: { name: this.config.name, version: this.config.version }
      }
    };
  }

  private handleToolsList(message: McpMessage): McpMessage {
    const sessionId = message.params?.sessionId || this.sessionId;
    const tools = this.getAvailableTools(sessionId);
    return { id: message.id, type: 'response', result: { tools } };
  }

  private async handleToolCall(message: McpMessage): Promise<McpMessage> {
    const { name, arguments: args } = message.params;
    const sessionId = message.params.sessionId;
    const availableTools = (sessionId ? this.sessionTools.get(sessionId) : null) || this.tools;
    
    const hitlTools = ['Ask_Human_Expert', 'Ask_Oracle', 'Report_Completion', 'Request_Approval', 'Ask_Multiple_Choice'];
    if (hitlTools.includes(name) && availableTools.has(name)) {
      return await this.handleHITLChatTool(message.id, args, sessionId, name);
    }
    
    return { id: message.id, type: 'response', error: { code: -32601, message: `Tool ${name} not found` } };
  }

  private async handleHITLChatTool(messageId: string, params: HITLChatToolParams, sessionId?: string, toolName?: string): Promise<McpMessage> {
    const actualSessionId = sessionId || params.sessionId;
    if (!actualSessionId) {
      return { id: messageId, type: 'response', error: { code: -32602, message: 'sessionId is required' } };
    }
    
    const requestId = `${messageId}-${Date.now()}`;
    const activeToolName = toolName || 'Ask_Human_Expert';
    
    let messageBody = params.message || params.question || params.summary || params.problem_description || params.impact || 'No message provided';
    
    if (activeToolName === 'Report_Completion' && params.next_suggestion) {
      messageBody += `\n\n**Next Suggestion:** ${params.next_suggestion}`;
    }
    
    if (activeToolName === 'Request_Approval') {
      messageBody = `**Action:** ${params.action_type}\n\n**Impact:** ${params.impact}\n\n**Justification:** ${params.justification}`;
    }

    let displayMessage = params.context ? `${params.context}\n\n${messageBody}` : messageBody;
    
    return new Promise((resolve) => {
      const aiMessage: ChatMessage = {
        id: requestId,
        content: displayMessage,
        sender: 'agent',
        timestamp: new Date(),
        type: 'text',
        toolName: activeToolName,
        toolData: params
      };
      
      this.chatManager.addMessage(actualSessionId, aiMessage);
      this.sendToSessionAndWeb(actualSessionId, 'chat_message', { sessionId: actualSessionId, message: { ...aiMessage, timestamp: aiMessage.timestamp.toISOString() } });
      
      this.emit('request-state-change', { requestId, sessionId: actualSessionId, state: 'waiting_for_response', message: displayMessage, toolName: activeToolName, toolData: params, timestamp: new Date().toISOString() });
      
      this.chatManager.addPendingRequest(actualSessionId, requestId, { ...params, toolName: activeToolName });
      this.requestResolvers.set(requestId, {
        resolve: (response: string) => {
          this.emit('request-state-change', { requestId, sessionId: actualSessionId, state: 'completed', response, timestamp: new Date().toISOString() });
          resolve({ id: messageId, type: 'response', result: { content: [{ type: 'text', text: response }] } });
        },
        reject: (error: Error) => {
          resolve({ id: messageId, type: 'response', error: { code: -32603, message: error.message } });
        }
      });
    });
  }

  public getAvailableTools(sessionId?: string): McpTool[] {
    const toolsMap = (sessionId && this.sessionTools.has(sessionId)) ? this.sessionTools.get(sessionId)! : this.tools;
    return Array.from(toolsMap.values()).filter(t => t.name !== 'example_custom_tool');
  }

  public registerSession(sessionId: string, workspacePath?: string, overrideData?: any): void {
    this.activeSessions.add(sessionId);
    if (workspacePath) this.sessionWorkspacePaths.set(sessionId, workspacePath);
    
    if (overrideData) {
      this.initializeSessionToolsFromData(sessionId, overrideData);
      if (overrideData.messageSettings) this.sessionMessageSettings.set(sessionId, overrideData.messageSettings);
    } else if (workspacePath) {
      this.initializeSessionTools(sessionId, workspacePath);
    }
    
    this.sendToWebInterface('session-registered', { sessionId, totalSessions: this.activeSessions.size });
  }

  public unregisterSession(sessionId: string): void {
    this.activeSessions.delete(sessionId);
    this.sessionTools.delete(sessionId);
    this.sessionWorkspacePaths.delete(sessionId);
    this.sessionMessageSettings.delete(sessionId);
    this.sendToWebInterface('session-unregistered', { sessionId, totalSessions: this.activeSessions.size });
  }

  public getActiveSessions(): string[] {
    return Array.from(this.activeSessions);
  }

  public getSessionState(sessionId: string): any {
    return this.chatManager.getSessionState(sessionId);
  }

  public getMessages(sessionId: string): any[] {
    return this.chatManager.getMessages(sessionId);
  }
  
  public async handleHumanResponse(sessionId: string, requestId: string, response: string): Promise<void> {
    let actualRequestId = requestId;
    
    if (requestId === 'latest') {
      const latest = this.chatManager.getLatestPendingRequest(sessionId);
      if (latest) {
        actualRequestId = latest.requestId;
      } else {
        this.debugLogger.log('WARN', `No latest request found for session ${sessionId}`);
        return;
      }
    }

    const resolver = this.requestResolvers.get(actualRequestId);
    if (!resolver) {
      this.debugLogger.log('WARN', `No resolver found for request ${actualRequestId} in session ${sessionId}`);
      return;
    }
    
    // Add user message to history
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      content: response,
      sender: 'user',
      timestamp: new Date(),
      type: 'text',
      source: 'web'
    };
    this.chatManager.addMessage(sessionId, userMsg);
    this.chatManager.removePendingRequest(sessionId, actualRequestId);
    
    // Broadcast message to all web interfaces and session SSEs
    this.sendToSessionAndWeb(sessionId, 'chat_message', { 
      sessionId, 
      message: { ...userMsg, timestamp: userMsg.timestamp.toISOString() } 
    });
    
    // Resolve the tool call
    resolver.resolve(response);
    this.requestResolvers.delete(actualRequestId);
  }

  public async start(): Promise<void> {
    await this.httpServer.start();
    try {
      const certStoragePath = process.env.HUMANAGENT_CERT_STORAGE_PATH;
      const httpsOptions = await this.proxyServer.certManager.initializeProxyCA(certStoragePath);
      const rules = await this.getProxyRules();
      await this.initializeDefaultRules();
      const finalRules = await this.getProxyRules();
      this.proxyServer.setRules(finalRules);
      await this.proxyServer.start(httpsOptions);
      process.env.NODE_EXTRA_CA_CERTS = httpsOptions.certPath;
      
      this.proxyServer.on('log-added', (logEntry) => this.sendToWebInterface('proxy-log', logEntry));
      this.proxyServer.on('log-updated', (logEntry) => this.sendToWebInterface('proxy-log-update', logEntry));
    } catch (error) {
      this.debugLogger.log('WARN', 'Proxy server failed to start:', error);
    }
    this.isRunning = true;
    this.emit('server-started', this.config);
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    await this.proxyServer.stop();
    await this.httpServer.stop();
    this.isRunning = false;
    this.debugLogger.close();
    this.emit('server-stopped');
  }

  // Proxy Rule Management
  public async getProxyRules(): Promise<any[]> {
    return this.globalStorage?.get('proxyRules', []) || [];
  }

  public async addProxyRule(name: string, pattern: string, redirect?: string, jsonata?: string, enabled: boolean = true, dropRequest?: boolean, dropStatusCode?: number, scope?: string, sessionId?: string, sessionName?: string, workspaceFolder?: string, debug?: boolean): Promise<string> {
    const rules = await this.getProxyRules();
    const ruleId = `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newRule = { id: ruleId, name, pattern, enabled, redirect, jsonata, dropRequest, dropStatusCode, scope, sessionId, sessionName, workspaceFolder, debug, createdAt: new Date().toISOString() };
    rules.push(newRule);
    await this.globalStorage?.update('proxyRules', rules);
    this.proxyServer.setRules(rules);
    await this.proxyServer.reloadRules();
    return ruleId;
  }

  public async updateProxyRule(ruleId: string, updates: any): Promise<boolean> {
    const rules = await this.getProxyRules();
    const idx = rules.findIndex(r => r.id === ruleId);
    if (idx === -1) return false;
    rules[idx] = { ...rules[idx], ...updates };
    await this.globalStorage?.update('proxyRules', rules);
    this.proxyServer.setRules(rules);
    await this.proxyServer.reloadRules();
    return true;
  }

  public async deleteProxyRule(ruleId: string): Promise<boolean> {
    const rules = await this.getProxyRules();
    const filtered = rules.filter(r => r.id !== ruleId);
    if (filtered.length === rules.length) return false;
    await this.globalStorage?.update('proxyRules', filtered);
    this.proxyServer.setRules(filtered);
    await this.proxyServer.reloadRules();
    return true;
  }

  public async initializeDefaultRules(): Promise<void> {
    const rules = await this.getProxyRules();
    if (rules.length === 0) {
      await this.addProxyRule('Karen Personality', 'https://api.individual.githubcopilot.com/chat/completions', undefined, '$merge([$, {"messages": $.messages.(role = "system" ? $merge([$, {"content": "Your Name is Karen"}]) : $)}])', false);
    }
  }

  public async updateProxyRules(rules: any[]): Promise<void> {
    await this.globalStorage?.update('proxyRules', rules);
    this.proxyServer.setRules(rules);
    await this.proxyServer.reloadRules();
  }

  public handleProxyLogUpdate(logEntry: any): void {
    this.sendToWebInterface('proxy-log-update', logEntry);
  }

  private initializeSessionTools(sessionId: string, workspacePath: string): void {
    const tools = this.toolRegistry.loadWorkspaceTools(workspacePath);
    this.sessionTools.set(sessionId, tools);
  }

  private initializeSessionToolsFromData(sessionId: string, data: any): void {
    const tools = this.toolRegistry.getDefaultTools(); // For now
    this.sessionTools.set(sessionId, tools);
  }
}
