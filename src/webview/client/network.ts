import { VsCodeApi, AppState } from './types';

export class NetworkManager {
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_DELAY = 30000;
  private readonly BASE_RECONNECT_DELAY = 1000;

  constructor(
    private vscode: VsCodeApi,
    private state: AppState,
    private onMessage: (data: any) => void,
    private onRequestStateChange: (data: any) => void,
    private onStatusUpdate: (data: any) => void
  ) {}

  public setupSSEConnection() {
    if (this.state.connectionInProgress) return;
    this.state.connectionInProgress = true;

    try {
      if (this.eventSource && this.eventSource.readyState !== 2) {
        this.eventSource.close();
      }

      this.eventSource = new EventSource(`http://localhost:${this.state.serverPort}/mcp?sessionId=${this.state.sessionId}`);

      this.eventSource.onopen = () => {
        this.state.connectionInProgress = false;
        this.reconnectAttempts = 0;
        this.onStatusUpdate({ isRunning: true });
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'heartbeat') return;

          if (data.type === 'request-state-change') {
            this.onRequestStateChange(data.data);
          } else if (data.type === 'chat_message') {
            this.onMessage(data);
          }
        } catch (e) {
          console.error('SSE Error:', e);
        }
      };

      this.eventSource.onerror = () => {
        if (this.eventSource) this.eventSource.close();
        this.state.connectionInProgress = false;
        const delay = this.getReconnectDelay();
        this.reconnectAttempts++;
        setTimeout(() => this.setupSSEConnection(), delay);
      };
    } catch (e) {
      this.state.connectionInProgress = false;
    }
  }

  private getReconnectDelay(): number {
    return Math.min(this.BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts), this.MAX_RECONNECT_DELAY);
  }

  public async syncSessionState() {
    try {
      const response = await fetch(`http://localhost:${this.state.serverPort}/sessions/${this.state.sessionId}/state`);
      return await response.json();
    } catch (error) {
      console.error('Failed to sync session state:', error);
      return null;
    }
  }

  public postMessage(type: string, data: any = {}) {
    this.vscode.postMessage({ type, ...data });
  }
}
