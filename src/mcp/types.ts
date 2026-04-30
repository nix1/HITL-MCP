export interface McpMessage {
  id: string;
  type: 'request' | 'response' | 'notification';
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  content: string;
  timestamp: Date;
  type: 'text' | 'system';
  source?: 'web' | 'vscode'; // Track message source for user messages
  toolName?: string;         // Name of the tool used by the agent
  toolData?: any;            // Structured data payload passed to the tool
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

export interface HITLSession {
  id: string;
  name: string;
  isActive: boolean;
  lastActivity: Date;
  messages: ChatMessage[];
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface HITLChatToolParams {
  message?: string;
  context?: string;
  sessionId?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  timeout?: number;
  [key: string]: any; // Allow arbitrary fields for diverse tool schemas
}

export interface HITLChatToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
}