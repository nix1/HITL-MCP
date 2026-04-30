import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

function escapeHtml(unsafe: string) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function getChatWebviewHtml(
  webview: vscode.Webview,
  extensionPath: string,
  currentRequestId: string | undefined,
  workspaceSessionId: string | undefined,
  port: number
): string {
  // --- Load quick reply overrides ---
  let overrideFileExists = false;
  let quickReplyOptions = [
    'Yes, proceed.',
    'No, stop.',
    'Explain more before proceeding.',
    'Continue, but be careful.',
  ];

  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const overrideFilePath = path.join(workspacePath, '.vscode', 'HITLOverride.json');
    overrideFileExists = fs.existsSync(overrideFilePath);

    if (overrideFileExists) {
      try {
        const overrideContent = fs.readFileSync(overrideFilePath, 'utf8');
        const overrideData = JSON.parse(overrideContent);
        if (overrideData.quickReplies?.options && Array.isArray(overrideData.quickReplies.options)) {
          quickReplyOptions = overrideData.quickReplies.options;
        }
      } catch (error) {
        console.error('Failed to load quick replies from override file:', error);
      }
    }
  }

  // --- Build webview URIs ---
  const mediaPath = path.join(extensionPath, 'src', 'webview', 'media');
  const cssUri = webview.asWebviewUri(vscode.Uri.file(path.join(mediaPath, 'chat.css')));
  const jsUri = webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, 'dist', 'webview.js')));
  const markedJsUri = webview.asWebviewUri(vscode.Uri.file(
    path.join(extensionPath, 'node_modules', 'marked', 'lib', 'marked.umd.js')
  ));

  // --- Compute initial state ---
  const hasPendingResponse = currentRequestId ? true : false;
  const chipsHtml = quickReplyOptions.map(option =>
    `<button class="chip" onclick="sendChip('${escapeHtml(option)}')" ${hasPendingResponse ? '' : 'disabled'}>${escapeHtml(option)}</button>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HITL Chat</title>
  <link rel="stylesheet" href="${cssUri}">
</head>
<body
  data-session-id="${escapeHtml(workspaceSessionId || '')}"
  data-port="${port}"
  data-pending-request-id="${escapeHtml(currentRequestId || '')}"
  data-override-exists="${overrideFileExists}"
  data-quick-replies='${JSON.stringify(quickReplyOptions).replace(/'/g, '&#039;')}'
>
  <div class="header">
    <div class="status-row">
      <div class="status-group">
        <div class="status-item">
          <div id="server-status-dot" class="status-dot"></div>
          <span id="server-status-text">Server</span>
        </div>
        <div class="status-item">
          <div id="proxy-status-dot" class="status-dot"></div>
          <span id="proxy-status-text">Proxy</span>
        </div>
        <div class="policy-selector">
          <span>Policy:</span>
          <select id="policySelector">
            <option value="manual">Manual</option>
            <option value="timed" selected>Auto (120s)</option>
            <option value="instant">Instant</option>
          </select>
        </div>
      </div>
      <div class="control-buttons">
        <button class="icon-button" id="updateButton" style="display:none;" onclick="triggerUpdate()" title="Update available">📥</button>
        <button class="icon-button" onclick="showConfigMenu()" title="Settings">⚙️</button>
      </div>
    </div>
  </div>

  <div class="messages-container" id="messages">
    <div class="empty-state" style="text-align: center; opacity: 0.5; padding: 40px 20px;">
      Waiting for AI messages...
    </div>
  </div>

  <div class="input-area">
    <div class="quick-replies-chips" id="chipsContainer">
      ${chipsHtml}
    </div>
    <div class="composer">
      <div class="textarea-wrapper">
        <textarea id="messageInput" placeholder="Type a response..." rows="1"></textarea>
      </div>
      <button class="send-btn" id="sendButton" onclick="sendMessage()" ${hasPendingResponse ? '' : 'disabled'} title="Send message">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1.14645 1.14645C1.05118 1.24171 1 1.37087 1 1.50553V5.50553C1 5.75133 1.17937 5.95995 1.42152 5.99908L7.50553 7L1.42152 8.00092C1.17937 8.04005 1 8.24867 1 8.49447V12.4945C1 12.6291 1.05118 12.7583 1.14645 12.8536C1.24171 12.9488 1.37087 13 1.50553 13C1.56455 13 1.62343 12.9902 1.67964 12.9715L14.6796 8.63814C14.8711 8.57431 15 8.39656 15 8.20001V7.79999C15 7.60344 14.8711 7.42569 14.6796 7.36186L1.67964 3.02853C1.62343 3.0098 1.56455 3 1.50553 3C1.37087 3 1.24171 3.05118 1.14645 1.14645Z" fill="currentColor"/>
        </svg>
      </button>
    </div>
  </div>

  <script src="${markedJsUri}"></script>
  <script src="${jsUri}"></script>
</body>
</html>`;
}
