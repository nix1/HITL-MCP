import * as http from 'http';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { IMcpServer, McpTool } from './types';
import { DebugLogger } from './logger';
import { generateWebInterfaceHTML } from './webInterfaceHtml';

export class McpHttpServer {
  private httpServer?: http.Server;
  private sseConnections: Set<http.ServerResponse> = new Set();
  private sseClients: Map<string, http.ServerResponse> = new Map(); // Per-session SSE connections
  private webInterfaceConnections: Set<http.ServerResponse> = new Set(); // Web interface connections

  constructor(
    private server: IMcpServer,
    private debugLogger: DebugLogger
  ) {}

  public get port(): number {
    return this.server.port;
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.debugLogger.log('INFO', `Starting HTTP server on port ${this.port}...`);
        
        this.httpServer = http.createServer((req, res) => {
          this.handleHttpRequest(req, res).catch(error => {
            this.debugLogger.log('ERROR', 'HTTP request handling error:', error);
          });
        });

        this.httpServer.on('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            this.debugLogger.log('INFO', `Port ${this.port} is already in use - another instance is serving requests.`);
          } else {
            this.debugLogger.log('ERROR', 'HTTP server error:', error);
          }
          reject(error);
        });

        this.httpServer.on('close', () => {
          this.debugLogger.log('INFO', 'HTTP server closed');
        });

        this.httpServer.listen(this.port, '127.0.0.1', () => {
          this.debugLogger.log('INFO', `MCP HTTP server running on http://127.0.0.1:${this.port}/mcp`);
          resolve();
        });
      } catch (error) {
        this.debugLogger.log('ERROR', 'Failed to start HTTP server:', error);
        reject(error);
      }
    });
  }

  public async stop(): Promise<void> {
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          this.debugLogger.log('WARN', 'HTTP server close timeout, forcing closure');
          resolve();
        }, 5000);
        
        this.httpServer!.close((error) => {
          clearTimeout(timeout);
          if (error) {
            this.debugLogger.log('WARN', 'HTTP server close error:', error);
          }
          resolve();
        });
      });
      this.httpServer = undefined;
    }
    
    // Clear connections
    this.sseConnections.clear();
    this.sseClients.clear();
    this.webInterfaceConnections.clear();
  }

  public sendToSession(sessionId: string, eventType: string, data: any): void {
    const message = { type: eventType, data };
    const connection = this.sseClients.get(sessionId);
    if (connection) {
      this.sendSSEMessage(connection, message);
    }
  }

  public sendToWebInterface(eventType: string, data: any): void {
    const message = JSON.stringify({ type: eventType, data });
    const eventData = `data: ${message}\n\n`;
    
    for (const connection of this.webInterfaceConnections) {
      if (!connection.destroyed) {
        try {
          connection.write(eventData);
        } catch (e) {
          this.webInterfaceConnections.delete(connection);
          this.sseConnections.delete(connection);
        }
      } else {
        this.webInterfaceConnections.delete(connection);
        this.sseConnections.delete(connection);
      }
    }
  }

  public sendToSessionAndWeb(sessionId: string, eventType: string, data: any): void {
    this.sendToSession(sessionId, eventType, data);
    this.sendToWebInterface(eventType, data);
  }

  private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const origin = req.headers.origin;
    if (origin && (origin.includes('vscode-webview://') || origin.includes('http://localhost'))) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS, PUT');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Cache-Control, Connection');

      if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
        return;
      }
    }

    const reqUrl = new URL(req.url!, `http://${req.headers.host || 'localhost'}`);
    const pathLower = reqUrl.pathname.toLowerCase();

    if (pathLower === '/' || pathLower === '') {
      res.writeHead(302, { 'Location': '/HITL' });
      res.end();
      return;
    }

    if (pathLower === '/mcp') {
      if (req.method === 'POST') await this.handleHttpPost(req, res);
      else if (req.method === 'GET') await this.handleHttpGet(req, res);
      else if (req.method === 'DELETE') await this.handleHttpDelete(req, res);
      else { res.statusCode = 405; res.end('Method Not Allowed'); }
    } else if (pathLower === '/mcp-tools') {
      await this.handleMcpToolsEndpoint(req, res, reqUrl);
    } else if (pathLower === '/hitl' || pathLower === '/hitl/') {
      await this.handleWebInterface(req, res);
    } else if (pathLower === '/assets/marked.js') {
      await this.handleMarkedJsAsset(res);
    } else if (pathLower.startsWith('/proxy')) {
      await this.handleProxyEndpoint(req, res);
    } else if (pathLower === '/jsonata-rule-builder.html' || pathLower === '/rule-builder' || pathLower === '/builder') {
      await this.handleRuleBuilderInterface(req, res);
    } else if (pathLower.startsWith('/sessions') || pathLower === '/response' || pathLower.startsWith('/tools') || pathLower.startsWith('/debug') || pathLower === '/reload' || pathLower.startsWith('/messages/')) {
      await this.handleSessionEndpoint(req, res);
    } else if (pathLower === '/shutdown' && req.method === 'POST') {
      await this.handleShutdownEndpoint(req, res);
    } else {
      res.statusCode = 404;
      res.end('Not Found');
    }
  }

  private async handleHttpPost(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readRequestBody(req);
      const url = new URL(req.url!, `http://${req.headers.host || 'localhost'}`);
      const sessionId = url.searchParams.get('sessionId');
      const message = JSON.parse(body);
      
      if (sessionId) {
        if (!message.params) message.params = {};
        message.params.sessionId = sessionId;
      }
      
      if (message.method === 'tools/call' && message.params?.name === 'HITL_Chat') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Transfer-Encoding', 'chunked');
        const keepaliveInterval = setInterval(() => {
          if (!res.destroyed) res.write(' ');
          else clearInterval(keepaliveInterval);
        }, 4 * 60 * 1000);
        
        const response = await this.server.handleMessage(message);
        clearInterval(keepaliveInterval);
        res.end(JSON.stringify(response));
        return;
      }
      
      const response = await this.server.handleMessage(message);
      if (response) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        if (message.method === 'initialize') {
          const responseSessionId = sessionId || `session-${crypto.randomUUID()}`;
          res.setHeader('Mcp-Session-Id', responseSessionId);
          this.server.activeSessions.add(responseSessionId);
        }
        res.end(JSON.stringify(response));
      } else {
        res.statusCode = 202;
        res.end();
      }
    } catch (error) {
      res.statusCode = 400;
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } }));
    }
  }

  private async handleHttpGet(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url!, `http://${req.headers.host || 'localhost'}`);
    let sessionId = url.searchParams.get('sessionId') || (req.headers['mcp-session-id'] as string);
    const clientType = url.searchParams.get('clientType');
    
    if (!sessionId && clientType !== 'web') {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'sessionId required' }));
      return;
    }
    
    if (clientType === 'web') sessionId = 'web-interface';
    
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const isWebInterface = clientType === 'web';
    if (isWebInterface) this.webInterfaceConnections.add(res);
    else this.sseClients.set(sessionId!, res);
    this.sseConnections.add(res);
    
    res.write('data: {"type":"connection","status":"established","sessionId":"' + sessionId + '"}\n\n');
    
    const heartbeat = setInterval(() => {
      if (!res.destroyed) res.write('data: {"type":"heartbeat","timestamp":"' + new Date().toISOString() + '"}\n\n');
      else { clearInterval(heartbeat); this.sseConnections.delete(res); }
    }, 10000);
    
    const cleanup = () => {
      clearInterval(heartbeat);
      this.sseConnections.delete(res);
      if (isWebInterface) this.webInterfaceConnections.delete(res);
      else if (sessionId) this.sseClients.delete(sessionId);
    };
    
    req.on('close', cleanup);
    res.on('close', cleanup);
  }

  private async handleHttpDelete(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    res.statusCode = 405;
    res.end('Method Not Allowed');
  }

  private async handleShutdownEndpoint(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, message: 'Server shutting down...' }));
    setTimeout(async () => {
      await this.server.stop();
      process.exit(0);
    }, 500);
  }

  private async handleMcpToolsEndpoint(req: http.IncomingMessage, res: http.ServerResponse, reqUrl: URL): Promise<void> {
    const sessionId = reqUrl.searchParams.get('sessionId');
    if (!sessionId) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'sessionId required' }));
      return;
    }
    if (req.method === 'POST') await this.handleHttpPost(req, res);
    else { res.statusCode = 405; res.end('Method Not Allowed'); }
  }

  private async handleSessionEndpoint(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'POST' && url.pathname === '/sessions/register') {
      const body = await this.readRequestBody(req);
      try {
        const { sessionId, vscodeSessionId, workspacePath, overrideData, forceReregister } = JSON.parse(body);
        if (vscodeSessionId) this.server.vscodeSessionMapping.set(vscodeSessionId, { sessionId, workspacePath });
        if (workspacePath) this.server.sessionWorkspacePaths.set(sessionId, workspacePath);
        if (this.server.globalStorage) {
          await this.server.globalStorage.update('sessionMappings', {
            vscodeSessionMapping: Object.fromEntries(this.server.vscodeSessionMapping),
            activeSessions: Array.from(this.server.activeSessions),
            sessionWorkspacePaths: Object.fromEntries(this.server.sessionWorkspacePaths)
          });
        }
        if (forceReregister && this.server.activeSessions.has(sessionId)) this.server.unregisterSession(sessionId);
        this.server.registerSession(sessionId, workspacePath, overrideData);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, sessionId }));
      } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ success: false })); }
    } else if (req.method === 'GET' && url.pathname === '/sessions') {
      const sessions = this.server.getActiveSessions().map(id => {
        const messageSettings = this.server.sessionMessageSettings.get(id);
        const quickReplyOptions = messageSettings?.quickReplies?.options || ['Yes Please Proceed', 'Explain in more detail please'];
        const workspacePath = this.server.sessionWorkspacePaths.get(id);
        const friendlyName = this.server.sessionNames.get(id);
        const shortId = id.replace(/^session-/, '').substring(0, 8);
        const name = friendlyName || (workspacePath ? path.basename(workspacePath) : `Session ${shortId}`);
        return { id, name, workspacePath, quickReplyOptions };
      });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ sessions }));
    } else if (req.method === 'POST' && url.pathname === '/sessions/name') {
      const body = await this.readRequestBody(req);
      try {
        const { sessionId, name } = JSON.parse(body);
        if (this.server.activeSessions.has(sessionId)) {
          this.server.sessionNames.set(sessionId, name);
          this.sendToSessionAndWeb(sessionId, 'session-name-changed', { sessionId, name });
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true }));
        } else { res.statusCode = 404; res.end(JSON.stringify({ success: false })); }
      } catch (e) { res.statusCode = 400; res.end(); }
    } else if (req.method === 'GET' && url.pathname.match(/^\/sessions\/([^\/]+)\/messages$/)) {
      const matches = url.pathname.match(/^\/sessions\/([^\/]+)\/messages$/);
      const sessionId = matches ? matches[1] : null;
      if (sessionId) {
        const messages = this.server.getMessages(sessionId);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ messages, sessionId }));
      }
    } else if (req.method === 'GET' && url.pathname.match(/^\/sessions\/([^\/]+)\/state$/)) {
      const matches = url.pathname.match(/^\/sessions\/([^\/]+)\/state$/);
      const sessionId = matches ? matches[1] : null;
      if (sessionId) {
        const state = this.server.getSessionState(sessionId);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(state));
      }
    } else if (req.method === 'POST' && url.pathname === '/response') {
      const body = await this.readRequestBody(req);
      try {
        const parsed = JSON.parse(body);
        await this.server.handleHumanResponse(parsed.sessionId, parsed.requestId, parsed.response);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true }));
      } catch (e) { res.statusCode = 400; res.end(); }
    }
  }

  private async handleProxyEndpoint(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url!, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/proxy/status') {
      const status = this.server.proxyServer.getStatus();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(status));
    } else if (url.pathname === '/proxy/logs') {
      const logs = this.server.proxyServer.getLogs();
      const debugLogs = this.server.proxyServer.getDebugLogs();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ logs, debugLogs }));
    } else if (url.pathname === '/proxy/clear' || url.pathname === '/proxy/clear-logs') {
      this.server.proxyServer.clearLogs();
      if (url.pathname === '/proxy/clear-logs') this.server.proxyServer.clearDebugLogs();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
    } else if (url.pathname === '/proxy/rules' || url.pathname.startsWith('/proxy/rules/')) {
      await this.handleProxyRulesEndpoint(req, res);
    } else { res.statusCode = 404; res.end('Not Found'); }
  }

  private async handleProxyRulesEndpoint(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url!, `http://${req.headers.host || 'localhost'}`);
    res.setHeader('Content-Type', 'application/json');
    try {
      if (url.pathname === '/proxy/rules' && req.method === 'GET') {
        const rules = await this.server.getProxyRules();
        res.end(JSON.stringify(rules));
      } else if (url.pathname.startsWith('/proxy/rules/') && req.method === 'PUT') {
        const ruleId = url.pathname.split('/').pop();
        const body = await this.readRequestBody(req);
        const updates = JSON.parse(body);
        const success = await this.server.updateProxyRule(ruleId!, updates);
        res.end(JSON.stringify({ success }));
      }
    } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); }
  }

  private async handleWebInterface(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(generateWebInterfaceHTML(this.server));
  }

  private async handleRuleBuilderInterface(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(this.generateRuleBuilderHTML());
  }

  private async handleMarkedJsAsset(res: http.ServerResponse): Promise<void> {
    const candidates = [
      path.resolve(__dirname, '../../node_modules/marked/lib/marked.umd.js'),
      path.resolve(__dirname, '../node_modules/marked/lib/marked.umd.js'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.end(fs.readFileSync(candidate));
        return;
      }
    }
    res.setHeader('Content-Type', 'application/javascript');
    res.end('/* marked.js not available */');
  }

  private async readRequestBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  private generateRuleBuilderHTML(): string {
    return `<!DOCTYPE html><html><head><title>Rule Builder</title></head><body><h1>Rule Builder</h1><p>Simplified for now.</p></body></html>`;
  }

  public sendSSEMessage(response: http.ServerResponse, message: any): void {
    try {
      if (response.destroyed || !response.writable) return;
      response.write(`data: ${JSON.stringify(message)}\n\n`);
    } catch (error) {
      this.debugLogger.log('ERROR', `SSE error:`, error);
    }
  }
}
