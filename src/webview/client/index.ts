import { AppState, VsCodeApi } from './types';
import { NetworkManager } from './network';
import { UIManager } from './ui';
import { ToolManager } from './tools';

declare function acquireVsCodeApi(): VsCodeApi;

// --- Initialize State ---
const vscode = acquireVsCodeApi();

const state: AppState = {
  sessionId: document.body.dataset.sessionId || '',
  serverPort: document.body.dataset.port || '3737',
  currentPendingRequestId: document.body.dataset.pendingRequestId || null,
  quickReplyOptions: JSON.parse(document.body.dataset.quickReplies || '[]'),
  overrideFileExists: document.body.dataset.overrideExists === 'true',
  currentServerStatus: null,
  connectionInProgress: false,
  reconnectAttempts: 0
};

// --- Initialize Managers ---
const network = new NetworkManager(
  vscode,
  state,
  (msg) => ui.addMessageToUI(msg.message),
  (data) => tools.handleRequestStateChange(data),
  (status) => ui.updateStatusUI(status)
);

const ui = new UIManager(state, network);
const tools = new ToolManager(state, ui);

// --- Global Event Listeners ---
window.addEventListener('message', (event) => {
  const msg = event.data;
  switch (msg.type) {
    case 'chat_message':
      ui.addMessageToUI(msg.message);
      break;
    case 'request-state-change':
      tools.handleRequestStateChange(msg.data);
      break;
    case 'serverStatus':
      ui.updateStatusUI(msg.data);
      break;
  }
});

// Expose some functions to the global scope for HTML onclick handlers
(window as any).sendMessage = () => ui.sendMessage();
(window as any).showConfigMenu = () => ui.showConfigMenu();
(window as any).triggerUpdate = () => network.postMessage('triggerUpdate');

// --- Boot ---
network.setupSSEConnection();
const messagesEl = document.getElementById('messages');
if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;

console.log('HITL MCP Webview initialized');
