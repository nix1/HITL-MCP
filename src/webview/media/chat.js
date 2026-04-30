// HITL-MCP Chat Webview Client Logic
// This file runs inside the VS Code webview context.

// --- Bootstrap from data attributes ---
const vscode = acquireVsCodeApi();
const sessionId = document.body.dataset.sessionId || '';
const serverPort = document.body.dataset.port || '3737';
let currentPendingRequestId = document.body.dataset.pendingRequestId || null;
const quickReplyOptions = JSON.parse(document.body.dataset.quickReplies || '[]');
window.overrideFileExists = document.body.dataset.overrideExists === 'true';

// --- Utility ---
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- Notification ---
function playNotificationBeep() {
  try {
    vscode.postMessage({ type: 'playNotificationSound' });
  } catch (error) {
    console.error('Failed to request sound notification:', error);
  }
}

// --- Textarea auto-grow ---
const textarea = document.getElementById('messageInput');
textarea.addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 200) + 'px';
});

textarea.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// --- Config Menu ---
async function showConfigMenu() {
  const existingMenu = document.getElementById('configMenu');
  if (existingMenu) {
    existingMenu.remove();
    return;
  }

  vscode.postMessage({ type: 'requestServerStatus' });
  await new Promise(resolve => setTimeout(resolve, 100));

  const menu = document.createElement('div');
  menu.id = 'configMenu';
  menu.style.position = 'absolute';
  menu.style.top = '30px';
  menu.style.right = '10px';
  menu.style.background = 'var(--vscode-menu-background)';
  menu.style.border = '1px solid var(--vscode-menu-border)';
  menu.style.borderRadius = '3px';
  menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
  menu.style.zIndex = '1000';
  menu.style.minWidth = '150px';

  const options = getDynamicMenuOptions();

  options.forEach(option => {
    const item = document.createElement('div');
    item.textContent = option.text;
    item.style.padding = '8px 12px';
    item.style.cursor = 'pointer';
    item.style.color = 'var(--vscode-menu-foreground)';
    item.onmouseover = () => item.style.background = 'var(--vscode-menu-selectionBackground)';
    item.onmouseout = () => item.style.background = 'transparent';
    item.onclick = () => {
      vscode.postMessage({ type: 'mcpAction', action: option.action });
      menu.remove();
    };
    menu.appendChild(item);
  });

  document.body.appendChild(menu);

  setTimeout(() => {
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
      }
    }, { once: true });
  }, 10);
}

// --- Quick Reply ---
function selectQuickReply() {
  const quickReplies = document.getElementById('quickReplies');
  const selectedReply = quickReplies.value;
  if (selectedReply) {
    const input = document.getElementById('messageInput');
    input.value = selectedReply;
    quickReplies.value = '';
    sendMessage();
  }
}

// --- Clipboard paste (images) ---
document.getElementById('messageInput').addEventListener('paste', async (e) => {
  const items = e.clipboardData.items;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      e.preventDefault();
      const blob = items[i].getAsFile();
      const reader = new FileReader();
      reader.onload = function (event) {
        const base64Data = event.target.result.split(',')[1];
        const inputContainer = document.querySelector('.input-area');

        const imagePreview = document.createElement('div');
        imagePreview.className = 'image-preview';
        imagePreview.innerHTML = `<img src="data:${blob.type};base64,${base64Data}" alt="Pasted image"><span class="remove-image">×</span>`;
        imagePreview.dataset.imageData = base64Data;
        imagePreview.dataset.mimeType = blob.type;

        inputContainer.insertBefore(imagePreview, document.getElementById('messageInput'));

        imagePreview.querySelector('.remove-image').addEventListener('click', () => {
          imagePreview.remove();
        });
      };
      reader.readAsDataURL(blob);
    }
  }
});

// --- Update trigger ---
function triggerUpdate() {
  vscode.postMessage({ type: 'triggerUpdate' });
}

// --- Message rendering ---
function addMessageToUI(msg) {
  const container = document.getElementById('messages');

  const empty = container.querySelector('.empty-state');
  if (empty) empty.remove();

  const isAgent = msg.sender === 'agent';
  const row = document.createElement('div');
  row.className = `message-row ${isAgent ? 'agent' : 'user'}`;

  const time = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  row.innerHTML = `
    <div class="message-info">
      <span class="sender">${isAgent ? 'Agent' : 'You'}</span>
      <span class="timestamp">${time}</span>
    </div>
    <div class="message-bubble">
      <div class="message-content">${marked.parse(msg.content)}</div>
    </div>
  `;

  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

// --- Send ---
function sendMessage() {
  const input = document.getElementById('messageInput');
  const content = input.value.trim();
  if (!content) return;

  vscode.postMessage({
    type: 'sendMessage',
    content: content,
    requestId: currentPendingRequestId
  });

  input.value = '';
  input.style.height = 'auto';
  setControlsEnabled(false);
  clearTimedDecisionTimer();
}

function sendChip(text) {
  const input = document.getElementById('messageInput');
  const currentText = input.value.trim();
  if (currentText !== '') {
    input.value = text + ' ' + currentText;
  } else {
    input.value = text;
  }
  sendMessage();
}

function setControlsEnabled(enabled) {
  document.getElementById('sendButton').disabled = !enabled;
  const chips = document.querySelectorAll('.chip');
  chips.forEach(c => c.disabled = !enabled);
  const optionCards = document.querySelectorAll('.option-card');
  optionCards.forEach(c => c.disabled = !enabled);
}

// --- Server status ---
let currentServerStatus = null;

function getDynamicMenuOptions() {
  const options = [
    { text: '📊 Show Status', action: 'requestServerStatus' }
  ];

  if (currentServerStatus) {
    if (currentServerStatus.isRunning) {
      options.push({ text: '🔴 Stop Server', action: 'stopServer' });
      options.push({ text: '🔄 Restart Server', action: 'restartServer' });
    } else {
      options.push({ text: '▶️ Start Server', action: 'startServer' });
    }

    if (currentServerStatus.proxy && currentServerStatus.proxy.running) {
      if (currentServerStatus.globalProxyEnabled) {
        options.push({ text: '🔌 Disable Proxy', action: 'disableGlobalProxy' });
      } else {
        options.push({ text: '🔌 Enable Proxy', action: 'enableGlobalProxy' });
      }
      options.push({ text: '🔐 Install Proxy Certificate', action: 'installCertificate' });
      options.push({ text: '🗑️ Uninstall Proxy Certificate', action: 'uninstallCertificate' });
    }
  }

  options.push({ text: window.overrideFileExists ? '📁 Recreate Override File' : '📁 Create Override File', action: 'overridePrompt' });
  options.push({ text: '📝 Name This Chat', action: 'nameSession' });
  options.push({ text: '🌐 Open Web View', action: 'openWebView' });
  options.push({ text: '❓ Help & Documentation', action: 'openHelp' });
  options.push({ text: '🐛 Report Issue', action: 'reportIssue' });
  options.push({ text: '💡 Request Feature', action: 'requestFeature' });

  return options;
}

// --- Timed Decision support ---
let timedDecisionInterval = null;
let timedDecisionTimeout = null;

function clearTimedDecisionTimer() {
  if (timedDecisionInterval) {
    clearInterval(timedDecisionInterval);
    timedDecisionInterval = null;
  }
  if (timedDecisionTimeout) {
    clearTimeout(timedDecisionTimeout);
    timedDecisionTimeout = null;
  }
  const bar = document.getElementById('countdownBar');
  if (bar) bar.parentElement.remove();
}

function startTimedDecisionCountdown(timeoutSeconds, defaultOptionId, defaultOptionTitle) {
  clearTimedDecisionTimer();
  
  const chipsContainer = document.getElementById('chipsContainer');
  if (!chipsContainer) return;

  // Create countdown display
  const countdownWrapper = document.createElement('div');
  countdownWrapper.id = 'countdownWrapper';
  countdownWrapper.innerHTML = `
    <div class="countdown-bar" id="countdownBar" style="width:100%"></div>
    <div class="countdown-text" id="countdownText">${timeoutSeconds}s — auto-selecting: ${escapeHtml(defaultOptionTitle)}</div>
  `;
  chipsContainer.parentElement.insertBefore(countdownWrapper, chipsContainer.nextSibling);

  let remaining = timeoutSeconds;
  const bar = document.getElementById('countdownBar');
  const text = document.getElementById('countdownText');

  timedDecisionInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearTimedDecisionTimer();
      return;
    }
    const pct = (remaining / timeoutSeconds) * 100;
    if (bar) bar.style.width = pct + '%';
    if (text) text.textContent = `${remaining}s — auto-selecting: ${escapeHtml(defaultOptionTitle)}`;
  }, 1000);

  timedDecisionTimeout = setTimeout(() => {
    clearTimedDecisionTimer();
    // Auto-select the default option
    const sendText = `I select option ${defaultOptionId}: ${defaultOptionTitle} (auto-selected after timeout)`;
    sendChip(sendText);
  }, timeoutSeconds * 1000);
}

// --- Build default chips HTML ---
function getDefaultChipsHtml() {
  return quickReplyOptions.map(option =>
    `<button class="chip" onclick="sendChip('${escapeHtml(option)}')">${escapeHtml(option)}</button>`
  ).join('');
}

// --- Incoming events ---
function handleIncomingChatMessage(data) {
  addMessageToUI(data.message);
}

function handleRequestStateChange(data) {
  console.log('Request state changed:', data);
  if (data.state === 'waiting_for_response') {
    currentPendingRequestId = data.requestId;
    setControlsEnabled(true);

    const oldIndicator = document.querySelector('.waiting-indicator');
    if (oldIndicator) oldIndicator.remove();

    const chipsContainer = document.getElementById('chipsContainer');
    if (chipsContainer) {
      // Reset to horizontal chip layout by default
      chipsContainer.className = 'quick-replies-chips';

      if (data.toolName === 'Request_Approval') {
        chipsContainer.innerHTML = `
          <button class="chip" style="background:var(--vscode-testing-iconPassed);color:white;font-weight:bold" onclick="sendChip('✅ Approved. Proceed with the action.')">✅ Approve</button>
          <button class="chip" style="background:var(--vscode-testing-iconFailed);color:white;font-weight:bold" onclick="sendChip('❌ Denied. Please do not proceed.')">❌ Deny</button>
          <button class="chip" onclick="sendChip('Approve, but with modifications: ')">📝 Approve with changes</button>
        `;
      } else if (data.toolName === 'Report_Completion') {
        chipsContainer.innerHTML = `
          <button class="chip" onclick="sendChip('Great work! Proceed to the next logical step.')">⏭️ Next step</button>
          <button class="chip" onclick="sendChip('Review the recent changes and refactor for better architecture and consistency.')">🧹 Refactor</button>
          <button class="chip" onclick="sendChip('Check test coverage for the recent changes and add missing tests.')">🧪 Add tests</button>
          <button class="chip" onclick="sendChip('Review the UI/UX. Suggest and implement improvements or UI delight.')">✨ Polish UX</button>
          <button class="chip" onclick="sendChip('Here is your next task: ')">📋 Assign task...</button>
          <button class="chip" onclick="sendChip('All done. You may stop.')">✅ All done</button>
        `;
      } else if (data.toolName === 'Ask_Oracle') {
        chipsContainer.innerHTML = `
          <button class="chip" onclick="sendChip('Proceed with the most likely solution.')">✅ Try best solution</button>
          <button class="chip" onclick="sendChip('Ignore this error and continue.')">⏭️ Ignore & continue</button>
          <button class="chip" onclick="sendChip('Try a different approach: ')">🔄 Try instead...</button>
          <button class="chip" onclick="sendChip('I have fixed the issue manually. Please proceed.')">🛠️ Fixed manually</button>
        `;
      } else if (data.toolName === 'Ask_Multiple_Choice' && data.toolData && Array.isArray(data.toolData.options)) {
        chipsContainer.className = 'multiple-choice-container';
        chipsContainer.innerHTML = data.toolData.options.map(opt => {
          const isRecommended = opt.id === data.toolData.recommendation;
          const cardClass = isRecommended ? 'option-card recommended' : 'option-card';
          const badge = isRecommended ? '<span class="rec-badge">Recommended</span>' : '';
          const sendText = `I select option ${opt.id}: ${opt.title}`;
          return `
            <button class="${cardClass}" onclick="sendChip('${escapeHtml(sendText)}')">
              <div class="option-card-title">
                <span>${escapeHtml(opt.id)}. ${escapeHtml(opt.title)}</span>
                ${badge}
              </div>
              ${opt.description ? `<div class="option-card-desc">${escapeHtml(opt.description)}</div>` : ''}
            </button>
          `;
        }).join('');
      } else if (data.toolName === 'Request_Timed_Decision' && data.toolData && Array.isArray(data.toolData.options)) {
        // Timed decision — same card UI as Ask_Multiple_Choice but with countdown
        chipsContainer.className = 'multiple-choice-container';
        const timeoutSeconds = data.toolData.timeout_seconds || 120;
        const defaultOptionId = data.toolData.default_option_id || (data.toolData.recommendation);
        let defaultOptionTitle = '';

        chipsContainer.innerHTML = data.toolData.options.map(opt => {
          const isDefault = opt.id === defaultOptionId;
          const cardClass = isDefault ? 'option-card recommended' : 'option-card';
          const badge = isDefault ? '<span class="rec-badge">⏱️ Auto-select</span>' : '';
          if (isDefault) defaultOptionTitle = opt.title;
          const sendText = `I select option ${opt.id}: ${opt.title}`;
          return `
            <button class="${cardClass}" onclick="sendChip('${escapeHtml(sendText)}')">
              <div class="option-card-title">
                <span>${escapeHtml(opt.id)}. ${escapeHtml(opt.title)}</span>
                ${badge}
              </div>
              ${opt.description ? `<div class="option-card-desc">${escapeHtml(opt.description)}</div>` : ''}
            </button>
          `;
        }).join('');

        // Start countdown timer
        if (defaultOptionId && defaultOptionTitle) {
          startTimedDecisionCountdown(timeoutSeconds, defaultOptionId, defaultOptionTitle);
        }
      } else {
        // Default quick replies
        chipsContainer.innerHTML = getDefaultChipsHtml();
      }
    }

    playNotificationBeep();
  } else {
    currentPendingRequestId = null;
    setControlsEnabled(false);
    clearTimedDecisionTimer();
  }
}

function updateStatusUI(data) {
  currentServerStatus = data;
  const sDot = document.getElementById('server-status-dot');
  const pDot = document.getElementById('proxy-status-dot');

  if (data.isRunning) {
    sDot.className = 'status-dot online';
  } else {
    sDot.className = 'status-dot offline';
  }

  if (data.proxy && data.proxy.running) {
    pDot.className = data.globalProxyEnabled ? 'status-dot online' : 'status-dot pending';
  } else {
    pDot.className = 'status-dot offline';
  }
}

// --- SSE Connection ---
let currentEventSource = null;
let connectionInProgress = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000;
const BASE_RECONNECT_DELAY = 1000;

function getReconnectDelay() {
  return Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
}

async function syncSessionState() {
  try {
    const response = await fetch(`http://localhost:${serverPort}/sessions/${sessionId}/state`);
    const state = await response.json();

    if (state.latestPendingRequest) {
      const sendButton = document.getElementById('sendButton');
      if (sendButton) sendButton.disabled = false;

      if (!document.querySelector('.waiting-indicator')) {
        const indicator = document.createElement('div');
        indicator.className = 'waiting-indicator';
        indicator.textContent = 'Waiting for response...';
        indicator.style.cssText = 'padding: 10px; background: #fff3cd; color: #856404; border: 1px solid #ffc107; border-radius: 4px; margin: 10px; text-align: center;';
        document.body.appendChild(indicator);
      }
      console.log('✅ Session state synced - pending request found');
    } else {
      const sendButton = document.getElementById('sendButton');
      if (sendButton) sendButton.disabled = true;

      const indicator = document.querySelector('.waiting-indicator');
      if (indicator) indicator.remove();

      console.log('✅ Session state synced - no pending requests');
    }
  } catch (error) {
    console.error('Failed to sync session state:', error);
  }
}

function updateConnectionStatus(connected, error) {
  const statusElement = document.getElementById('server-status-text');
  const statusDot = document.querySelector('.status-dot');

  if (statusElement) {
    if (connected) {
      statusElement.textContent = 'HITL MCP Server (Connected)';
      if (statusDot) statusDot.style.backgroundColor = '#4caf50';
    } else if (error) {
      statusElement.textContent = 'HITL MCP Server (Disconnected)';
      if (statusDot) statusDot.style.backgroundColor = '#f44336';
    } else {
      statusElement.textContent = 'HITL MCP Server (Connecting...)';
      if (statusDot) statusDot.style.backgroundColor = '#ff9800';
    }
  }
}

function setupSSEConnection() {
  if (connectionInProgress) return;
  connectionInProgress = true;

  try {
    if (currentEventSource && currentEventSource.readyState !== 2) {
      currentEventSource.close();
    }

    const eventSource = new EventSource(`http://localhost:${serverPort}/mcp?sessionId=${sessionId}`);
    currentEventSource = eventSource;

    eventSource.onopen = () => {
      connectionInProgress = false;
      reconnectAttempts = 0;
      updateStatusUI({ isRunning: true });
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'heartbeat') return;

        if (data.type === 'request-state-change') {
          handleRequestStateChange(data.data);
        } else if (data.type === 'chat_message') {
          handleIncomingChatMessage(data);
        }
      } catch (e) {
        console.error('SSE Error:', e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      connectionInProgress = false;
      const delay = getReconnectDelay();
      reconnectAttempts++;
      setTimeout(setupSSEConnection, delay);
    };
  } catch (e) {
    connectionInProgress = false;
  }
}

// --- Listen for messages from extension ---
window.addEventListener('message', event => {
  const msg = event.data;
  switch (msg.type) {
    case 'chat_message':
      handleIncomingChatMessage(msg);
      break;
    case 'request-state-change':
      handleRequestStateChange(msg.data);
      break;
    case 'serverStatus':
      updateStatusUI(msg.data);
      break;
    case 'serverStarted':
      break;
  }
});

// --- Boot ---
setupSSEConnection();
const messagesEl = document.getElementById('messages');
if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
