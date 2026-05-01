// HITL-MCP Webview Types

export type AutoDecisionPolicy = 'manual' | 'timed' | 'instant';

export interface AppState {
  sessionId: string;
  serverPort: string;
  currentPendingRequestId: string | null;
  quickReplyOptions: string[];
  overrideFileExists: boolean;
  globalProxyEnabled?: boolean;
  currentServerStatus: ServerStatus | null;
  connectionInProgress: boolean;
  reconnectAttempts: number;
  autoDecisionPolicy: AutoDecisionPolicy;
  autoDecisionTimeout: number; // in seconds
}

export interface ServerStatus {
  isRunning: boolean;
  proxy?: {
    running: boolean;
  };
  globalProxyEnabled?: boolean;
}

export interface ChatMessage {
  sender: 'agent' | 'user';
  content: string;
  timestamp?: string;
}

export interface RequestStateChange {
  state: 'waiting_for_response' | 'completed';
  requestId: string;
  toolName?: string;
  toolData?: any;
  message?: string;
}

// Global VS Code API type
export interface VsCodeApi {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}
