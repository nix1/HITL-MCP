import * as path from 'path';
import { IMcpServer } from './types';

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function generateWebInterfaceHTML(server: IMcpServer): string {
  const sessions = server.getActiveSessions().map(id => {
    const workspaceRoot = server.sessionWorkspacePaths.get(id);
    const friendlyName = server.sessionNames.get(id);
    const messageSettings = server.sessionMessageSettings.get(id);
    let quickReplyOptions: string[] = ['Yes Please Proceed', 'Explain in more detail please'];
    if (messageSettings?.quickReplies?.options) quickReplyOptions = messageSettings.quickReplies.options;
    const title = friendlyName
      || (workspaceRoot ? `Workspace: ${path.basename(workspaceRoot)}` : `Session: ${id.substring(0, 8)}`);
    return { id, title, quickReplyOptions };
  });

  const sessionsJson = JSON.stringify(sessions);
  const firstSessionId = sessions[0]?.id ?? null;

  const sessionTabsHtml = sessions.map((s, i) =>
    `<div class="tab${i === 0 ? ' active' : ''}" data-session="${escapeHtml(s.id)}" data-panel="session-${escapeHtml(s.id)}">${escapeHtml(s.title)}</div>`
  ).join('');

  const sessionPanelsHtml = sessions.length === 0
    ? `<div class="panel active" id="panel-no-sessions" style="justify-content:center;align-items:center;">
         <div class="empty-state">No active sessions. Start an AI agent to see sessions here.</div>
       </div>`
    : sessions.map((s, i) => `
      <div class="panel chat-panel${i === 0 ? ' active' : ''}" id="panel-session-${escapeHtml(s.id)}" data-session="${escapeHtml(s.id)}">
        <div class="messages" id="messages-${escapeHtml(s.id)}">
          <div class="empty-state">Loading messages…</div>
        </div>
        <div class="input-container">
          <div class="quick-replies-row" id="chips-${escapeHtml(s.id)}"></div>
          <div class="composer">
            <div class="textarea-wrapper">
              <textarea class="input-box" data-session="${escapeHtml(s.id)}" placeholder="Type a response…" rows="1"></textarea>
            </div>
            <button class="send-button" data-session="${escapeHtml(s.id)}" disabled>Send</button>
          </div>
        </div>
      </div>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HITL Control</title>
  <script src="/assets/marked.js" onerror="window.marked=null"></script>
  <style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#1e1e1e;color:#ccc;height:100vh;display:flex;flex-direction:column;overflow:hidden;font-size:13px}
.app{display:flex;flex-direction:column;height:100vh}
.tabs-bar{display:flex;justify-content:space-between;background:#252526;border-bottom:1px solid #3c3c3c;flex-shrink:0;overflow-x:auto}
.tabs-left,.tabs-right{display:flex}
.tab{padding:8px 16px;cursor:pointer;font-size:13px;border-right:1px solid #3c3c3c;white-space:nowrap;user-select:none;color:#aaa}
.tab:hover{background:#2d2d2d}
.tab.active{background:#1e1e1e;color:#fff;border-bottom:2px solid #007acc}
.tab.has-notification{color:#f0a500}
.proxy-tab{color:#888;font-size:12px}
.content{flex:1;overflow:hidden;position:relative}
.panel{display:none;height:100%;flex-direction:column}
.panel.active{display:flex}
.chat-panel{flex-direction:column}
.messages{flex:1;overflow-y:auto;padding:16px 12px;display:flex;flex-direction:column;gap:12px;scroll-behavior:smooth}
.input-container{padding:12px;border-top:1px solid #3c3c3c;background:#252526;display:flex;flex-direction:column;gap:8px;flex-shrink:0}
.quick-replies-row{display:flex;gap:6px;flex-wrap:wrap}
.message-row{display:flex;flex-direction:column;max-width:85%}
.message-row.agent{align-self:flex-start}
.message-row.user{align-self:flex-end}
.message-info{font-size:10px;opacity:0.65;margin-bottom:4px;display:flex;gap:8px}
.message-row.user .message-info{flex-direction:row-reverse}
.message-bubble{padding:10px 14px;border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,0.2)}
.agent .message-bubble{background:#2d2d2d;color:#ccc;border-bottom-left-radius:2px}
.user .message-bubble{background:#007acc;color:#fff;border-bottom-right-radius:2px}
.message-content{word-wrap:break-word;line-height:1.5}
.message-content p{margin:0 0 8px 0}
.message-content p:last-child{margin-bottom:0}
.message-content code{font-family:monospace;background:rgba(0,0,0,0.2);padding:2px 4px;border-radius:3px}
.message-content pre{background:rgba(0,0,0,0.25);padding:8px;border-radius:6px;overflow-x:auto;margin:6px 0}
.message-content pre code{background:transparent;padding:0}
.tool-bubble{max-width:95%}
.tool-bubble .message-bubble{background:#2a2a3a;border:1px solid #3c3c5c;border-left:3px solid #007acc}
.tool-context-header{font-size:13px;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px;border:1px solid #3c3c3c;margin-bottom:10px;line-height:1.5;word-break:break-word}
.tool-context-header p{margin:0}
.tool-badge{font-size:10px;text-transform:uppercase;letter-spacing:0.5px;background:#007acc;color:#fff;padding:2px 6px;border-radius:4px;display:inline-block;margin-bottom:8px}
.tool-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.tool-bubble.responded .message-bubble{border-left-color:#4caf50}
.tool-bubble.responded .tool-chips .chip:not(.selected),.tool-bubble.responded .tool-chips .option-card:not(.selected){opacity:0.3}
.chip{white-space:nowrap;padding:4px 12px;background:#3c3c3c;color:#ccc;border:1px solid #555;border-radius:14px;font-size:11px;cursor:pointer;font-weight:500}
.chip.primary{background:#007acc;color:#fff;border-color:#007acc}
.chip:hover:not(:disabled){background:#4a4a4a}
.chip.primary:hover:not(:disabled){background:#1e8ad4}
.chip:disabled{opacity:0.5;cursor:not-allowed}
.chip.selected{background:#007acc;color:#fff;border-color:#007acc;opacity:1;cursor:default}
.chip.selected::after{content:' ✓'}
.multiple-choice-container{display:flex;flex-direction:column;gap:8px;width:100%}
.option-card{background:#2d2d2d;border:1px solid #3c3c3c;border-radius:8px;padding:10px 12px;cursor:pointer;text-align:left;width:100%;display:flex;flex-direction:column;color:#ccc}
.option-card:hover:not(:disabled){border-color:#007acc;background:#333}
.option-card.recommended{border:2px solid #007acc;background:rgba(0,122,204,0.08)}
.option-card-title{font-weight:bold;font-size:13px;display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
.option-card-desc{font-size:11px;opacity:0.75;line-height:1.4}
.rec-badge{font-size:9px;text-transform:uppercase;background:#007acc;color:#fff;padding:2px 8px;border-radius:10px;font-weight:bold}
.composer{display:flex;gap:8px;align-items:flex-end}
.textarea-wrapper{flex:1;background:#3c3c3c;border:1px solid #555;border-radius:6px;padding:4px 8px}
.input-box{width:100%;background:transparent;border:none;color:#ccc;font-family:inherit;font-size:13px;resize:none;padding:4px 0;outline:none;min-height:24px;max-height:150px}
.send-button{background:#007acc;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;white-space:nowrap}
.send-button:hover:not(:disabled){background:#1e8ad4}
.send-button:disabled{opacity:0.5;cursor:not-allowed}
.countdown-wrap{margin-top:10px;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px}
.countdown-bar-container{height:3px;background:rgba(255,255,255,0.1);border-radius:2px;margin-bottom:6px;overflow:hidden}
.countdown-bar{height:100%;background:linear-gradient(90deg,#007acc,#409eff);border-radius:2px;transition:width 1s linear}
.countdown-text{font-size:11px;text-align:center;opacity:0.85}
.countdown-text strong{color:#409eff}
.proxy-panel{padding:12px;flex-direction:column;gap:10px;overflow:hidden}
.proxy-toolbar{display:flex;gap:8px;align-items:center;flex-shrink:0;flex-wrap:wrap;padding-bottom:8px;border-bottom:1px solid #3c3c3c}
.btn-small{padding:4px 10px;font-size:11px;background:#3c3c3c;color:#ccc;border:1px solid #555;border-radius:4px;cursor:pointer}
.btn-small:hover{background:#4a4a4a}
.proxy-logs-container,.debug-logs-container,.rules-list{flex:1;overflow-y:auto;margin-top:8px}
.proxy-log-entry{border:1px solid #3c3c3c;border-radius:4px;margin-bottom:4px}
.proxy-log-entry.rule-applied{border-color:#f0a500}
.proxy-log-summary{padding:8px;cursor:pointer}
.proxy-log-summary:hover{background:rgba(255,255,255,0.03)}
.proxy-log-header{display:flex;gap:8px;align-items:center;font-size:12px;flex-wrap:wrap}
.proxy-log-method{font-weight:bold;color:#569cd6}
.proxy-log-status.success{color:#4caf50}
.proxy-log-status.error{color:#f44336}
.proxy-log-url{font-size:11px;color:#888;word-break:break-all;margin-top:3px}
.proxy-log-rule-badge{font-size:10px;background:#f0a500;color:#000;padding:1px 6px;border-radius:3px}
.proxy-log-modifications{font-size:11px;color:#f0a500;margin-top:4px}
.proxy-log-details{padding:10px;border-top:1px solid #3c3c3c;font-size:12px;display:none}
.proxy-log-section{margin-bottom:10px}
.proxy-log-section h4{font-size:11px;text-transform:uppercase;color:#888;margin-bottom:6px}
.proxy-log-section pre{background:#252526;padding:8px;border-radius:4px;overflow-x:auto;font-size:11px;max-height:200px;white-space:pre-wrap;word-break:break-word}
.proxy-log-actions{display:flex;gap:6px;margin-bottom:8px}
.debug-log-entry{font-size:11px;font-family:monospace;padding:2px 4px;border-bottom:1px solid #2a2a2a;display:flex;gap:6px}
.debug-log-entry .ts{color:#888;flex-shrink:0}
.debug-log-entry.entry-error{background:rgba(244,67,54,0.08)}
.debug-log-entry.entry-success{background:rgba(76,175,80,0.08)}
.debug-filter{display:flex;gap:8px;align-items:center;font-size:12px}
.debug-filter input{background:#3c3c3c;border:1px solid #555;color:#ccc;padding:3px 6px;border-radius:4px;font-size:12px;width:200px}
.rule-item{padding:10px;border:1px solid #3c3c3c;border-radius:4px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.rule-item.disabled-rule{opacity:0.5}
.rule-info{flex:1}
.rule-name{font-weight:bold;font-size:13px}
.rule-pattern{font-size:11px;color:#888;font-family:monospace;margin-top:3px}
.rule-actions{display:flex;gap:6px;flex-shrink:0}
.add-rule-form{background:#252526;border:1px solid #3c3c3c;border-radius:6px;padding:12px;margin-top:10px;display:none;flex-direction:column;gap:8px}
.add-rule-form.active{display:flex}
.form-row{display:flex;flex-direction:column;gap:4px}
.form-row label{font-size:11px;color:#888}
.form-row input,.form-row textarea,.form-row select{background:#3c3c3c;border:1px solid #555;color:#ccc;padding:6px 8px;border-radius:4px;font-size:12px;font-family:monospace}
.form-row textarea{resize:vertical;min-height:60px}
.form-actions{display:flex;gap:8px}
.empty-state{text-align:center;opacity:0.5;padding:40px 20px}
.waiting-indicator{align-self:center;font-size:11px;opacity:0.6;margin-top:8px}
  </style>
</head>
<body>
<div class="app">
  <div class="tabs-bar">
    <div class="tabs-left" id="tabs-left">
      ${sessionTabsHtml}
    </div>
    <div class="tabs-right" id="tabs-right">
      <div class="tab proxy-tab" data-panel="proxy-logs">📊 Proxy Logs</div>
      <div class="tab proxy-tab" data-panel="proxy-rules">⚙️ Proxy Rules</div>
      <div class="tab proxy-tab" data-panel="proxy-debug">🔍 Proxy Debug</div>
    </div>
  </div>
  <div class="content" id="content">
    ${sessionPanelsHtml}
    <div class="panel proxy-panel" id="panel-proxy-logs">
      <div class="proxy-toolbar">
        <button class="btn-small" onclick="loadProxyLogs()">Refresh</button>
        <button class="btn-small" onclick="clearProxyLogs()">Clear</button>
        <label style="font-size:12px;display:flex;gap:6px;align-items:center;">
          <input type="checkbox" id="filter-modified-only" onchange="toggleFilterModifiedOnly()"> Modified only
        </label>
      </div>
      <div class="proxy-logs-container" id="proxy-logs">
        <div class="empty-state">No proxy logs yet.</div>
      </div>
    </div>
    <div class="panel proxy-panel" id="panel-proxy-rules">
      <div class="proxy-toolbar">
        <button class="btn-small" onclick="loadRules()">Refresh</button>
        <button class="btn-small" onclick="showAddRuleForm()">+ Add Rule</button>
      </div>
      <div class="rules-list" id="rules-list">
        <div class="empty-state">No proxy rules. Click + Add Rule to create one.</div>
      </div>
      <div class="add-rule-form" id="add-rule-form">
        <div class="form-row"><label>Rule Name</label><input id="rule-name" placeholder="e.g. Block Telemetry"></div>
        <div class="form-row"><label>URL Pattern (regex)</label><input id="rule-pattern" placeholder="^https://api\\.example\\.com/.*"></div>
        <div class="form-row"><label>Redirect To (optional)</label><input id="rule-redirect" placeholder="https://localhost:8080"></div>
        <div class="form-row"><label>JSONata Transform (optional)</label><textarea id="rule-jsonata" placeholder="$ ~> |messages[role='system']|{'content':'new prompt'}|"></textarea></div>
        <div class="form-row"><label>Scope</label>
          <select id="rule-scope">
            <option value="global">Global (all workspaces)</option>
            <option value="session">Session-specific</option>
          </select>
        </div>
        <div class="form-row" id="rule-session-id-row" style="display:none"><label>Session ID</label><input id="rule-session-id" placeholder="session-..."></div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          <label style="font-size:12px;display:flex;gap:6px;align-items:center;"><input type="checkbox" id="rule-enabled" checked> Enabled</label>
          <label style="font-size:12px;display:flex;gap:6px;align-items:center;"><input type="checkbox" id="rule-drop" onchange="document.getElementById('rule-drop-status-row').style.display=this.checked?'flex':'none'"> Drop Request</label>
        </div>
        <div class="form-row" id="rule-drop-status-row" style="display:none"><label>Drop Status Code</label><input id="rule-drop-status" type="number" placeholder="204" value="204"></div>
        <div class="form-actions">
          <button class="btn-small" style="background:#007acc;color:#fff;border-color:#007acc" onclick="saveRule()">Save Rule</button>
          <button class="btn-small" onclick="hideAddRuleForm()">Cancel</button>
        </div>
      </div>
    </div>
    <div class="panel proxy-panel" id="panel-proxy-debug">
      <div class="proxy-toolbar">
        <div class="debug-filter">
          <span>Filter:</span>
          <input type="text" id="debug-filter-input" placeholder="Filter logs…" oninput="filterDebugLogs()">
        </div>
        <button class="btn-small" onclick="clearDebugLogs()">Clear</button>
      </div>
      <div class="debug-logs-container" id="debug-logs">
        <div class="empty-state">No debug logs yet.</div>
      </div>
    </div>
  </div>
</div>
<script>
(function() {
  const __SESSIONS__ = ${sessionsJson};
  const pendingRequestIds = {};
  const timedDecisionTimers = {};
  let activePanel = ${firstSessionId ? `'session-${firstSessionId}'` : `'proxy-logs'`};
  let webReconnectAttempts = 0;
  let webReconnectTimeout = null;
  let debugPollInterval = null;
  window.proxyLogsDataCache = {};

  // ── Markdown ──────────────────────────────────────────────────────────────
  function parseMarkdown(text) {
    if (!text) return '';
    try { if (window.marked && window.marked.parse) return window.marked.parse(text); } catch(e) {}
    return escapeHtml(text)
      .replace(/\\*\\*(.+?)\\*\\*/gs, '<strong>$1</strong>')
      .replace(/\\*(.+?)\\*/gs, '<em>$1</em>')
      .replace(/\`(.+?)\`/g, '<code>$1</code>')
      .replace(/\\n/g, '<br>');
  }
  function escapeHtml(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  // ── Tab switching ─────────────────────────────────────────────────────────
  function switchToPanel(panelId) {
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.panel === panelId);
      if (t.dataset.panel === panelId) t.classList.remove('has-notification');
    });
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + panelId));
    activePanel = panelId;
    if (panelId === 'proxy-debug') startDebugPoll();
    else stopDebugPoll();
    if (panelId === 'proxy-logs') loadProxyLogs();
    if (panelId === 'proxy-rules') loadRules();
  }

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchToPanel(tab.dataset.panel));
  });

  // ── Session management ────────────────────────────────────────────────────
  function getSessionQuickReplies(sessionId) {
    const s = __SESSIONS__.find(s => s.id === sessionId);
    return s ? s.quickReplyOptions : ['Yes Please Proceed', 'Explain in more detail please'];
  }

  function addSessionTab(sessionId, title, quickReplyOptions) {
    if (document.querySelector('[data-session="' + sessionId + '"].tab')) return;

    // Update __SESSIONS__ cache
    if (!__SESSIONS__.find(s => s.id === sessionId)) {
      __SESSIONS__.push({ id: sessionId, title: title || 'Session: ' + sessionId.substring(0,8), quickReplyOptions: quickReplyOptions || ['Yes Please Proceed', 'Explain in more detail please'] });
    }

    // Remove "no sessions" panel if present
    document.getElementById('panel-no-sessions')?.remove();

    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.session = sessionId;
    tab.dataset.panel = 'session-' + sessionId;
    tab.textContent = title || 'Session: ' + sessionId.substring(0,8);
    tab.addEventListener('click', () => switchToPanel('session-' + sessionId));
    document.getElementById('tabs-left').appendChild(tab);

    const panel = document.createElement('div');
    panel.className = 'panel chat-panel';
    panel.id = 'panel-session-' + sessionId;
    panel.dataset.session = sessionId;
    panel.innerHTML = \`
      <div class="messages" id="messages-\${sessionId}"><div class="empty-state">Loading messages…</div></div>
      <div class="input-container">
        <div class="quick-replies-row" id="chips-\${sessionId}"></div>
        <div class="composer">
          <div class="textarea-wrapper"><textarea class="input-box" data-session="\${sessionId}" placeholder="Type a response…" rows="1"></textarea></div>
          <button class="send-button" data-session="\${sessionId}" disabled>Send</button>
        </div>
      </div>\`;
    document.getElementById('content').insertBefore(panel, document.getElementById('panel-proxy-logs'));
    wireSessionInput(panel, sessionId);

    // Switch to first session if none was active
    if (!document.querySelector('.panel.active') || document.getElementById('panel-no-sessions')) {
      switchToPanel('session-' + sessionId);
    }
    loadSessionMessages(sessionId);
  }

  function removeSessionTab(sessionId) {
    document.querySelector('[data-session="' + sessionId + '"].tab')?.remove();
    document.getElementById('panel-session-' + sessionId)?.remove();
    if (timedDecisionTimers[sessionId]) {
      clearInterval(timedDecisionTimers[sessionId].interval);
      clearTimeout(timedDecisionTimers[sessionId].timeout);
      delete timedDecisionTimers[sessionId];
    }
    if (activePanel === 'session-' + sessionId) {
      const first = document.querySelector('.tab');
      if (first) switchToPanel(first.dataset.panel);
    }
  }

  function wireSessionInput(panel, sessionId) {
    const ta = panel.querySelector('textarea');
    const btn = panel.querySelector('.send-button');
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight,150)+'px'; });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(sessionId, ta.value.trim()); } });
    btn.addEventListener('click', () => sendMessage(sessionId, ta.value.trim()));
  }

  // Wire pre-rendered session panels
  document.querySelectorAll('[data-session].chat-panel').forEach(panel => {
    wireSessionInput(panel, panel.dataset.session);
  });

  // ── Messages ──────────────────────────────────────────────────────────────
  function addMessageToUI(sessionId, role, content, source, timestamp) {
    const container = document.getElementById('messages-' + sessionId);
    if (!container) return;
    container.querySelector('.empty-state')?.remove();
    container.querySelector('.waiting-indicator')?.remove();

    const time = timestamp ? new Date(timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    const senderLabel = role === 'user' ? 'You' + (source ? ' (' + (source === 'web' ? 'Web' : 'VS Code') + ')' : '') : 'Agent';

    const row = document.createElement('div');
    row.className = 'message-row ' + (role === 'user' || role === 'user' ? (role === 'agent' ? 'agent' : 'user') : role);
    row.innerHTML = \`
      <div class="message-info"><span class="sender">\${escapeHtml(senderLabel)}</span><span class="timestamp">\${time}</span></div>
      <div class="message-bubble"><div class="message-content">\${parseMarkdown(content)}</div></div>\`;
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
  }

  // ── Tool bubbles ──────────────────────────────────────────────────────────
  function buildActionsHtml(sessionId, data) {
    const e = escapeHtml;
    if (data.toolName === 'Request_Approval') {
      return \`<button class="chip primary" data-response="✅ Approved. Proceed with the action.">✅ Approve</button>
               <button class="chip" data-response="❌ Denied. Please do not proceed.">❌ Deny</button>
               <button class="chip" data-response="Approve, but with modifications: ">📝 Approve with changes</button>\`;
    }
    if (data.toolName === 'Report_Completion') {
      const nextSug = data.toolData?.next_suggestion;
      const nextLabel = nextSug ? ('✅ Proceed: ' + (nextSug.length > 30 ? nextSug.substring(0,27)+'...' : nextSug)) : '⏭️ Next step';
      const nextResp = nextSug ? 'Excellent. Please proceed with: ' + nextSug : 'Great work! Proceed to the next logical step.';
      return \`<button class="chip primary" data-response="\${e(nextResp)}">\${e(nextLabel)}</button>
               <button class="chip" data-response="Review the recent changes and refactor for better architecture and consistency.">🧹 Refactor</button>
               <button class="chip" data-response="Check test coverage for the recent changes and add missing tests.">🧪 Add tests</button>
               <button class="chip" data-response="Review the UI/UX. Suggest and implement improvements or UI delight.">✨ Polish UX</button>
               <button class="chip" data-response="Here is your next task: ">📋 Assign task…</button>
               <button class="chip" data-response="All done. You may stop.">✅ All done</button>\`;
    }
    if (data.toolName === 'Ask_Oracle') {
      return \`<button class="chip primary" data-response="Proceed with the most likely solution.">✅ Try best solution</button>
               <button class="chip" data-response="Ignore this error and continue.">⏭️ Ignore &amp; continue</button>
               <button class="chip" data-response="Try a different approach: ">🔄 Try instead…</button>
               <button class="chip" data-response="I have fixed the issue manually. Please proceed.">🛠️ Fixed manually</button>\`;
    }
    if (data.toolName === 'Ask_Multiple_Choice' && data.toolData?.options) {
      const recId = data.toolData.recommendation;
      return data.toolData.options.map(opt => {
        const isRec = opt.id === recId;
        return \`<button class="option-card\${isRec?' recommended':''}" data-response="\${e('I select option '+opt.id+': '+opt.title)}">
          <div class="option-card-title"><span>\${e(opt.id)+'. '+e(opt.title)}</span>\${isRec?'<span class="rec-badge">Recommended</span>':''}</div>
          \${opt.description?'<div class="option-card-desc">'+e(opt.description)+'</div>':''}</button>\`;
      }).join('');
    }
    // Default: session quick replies
    return getSessionQuickReplies(sessionId).map((opt,i) =>
      \`<button class="chip \${i===0?'primary':''}" data-response="\${e(opt)}">\${e(opt)}</button>\`
    ).join('');
  }

  function renderToolBubble(sessionId, data) {
    const container = document.getElementById('messages-' + sessionId);
    if (!container) return null;
    container.querySelector('.empty-state')?.remove();
    container.querySelector('.waiting-indicator')?.remove();

    const toolNameLabel = (data.toolName || 'Tool Request').replace(/_/g,' ');
    let toolMsg = data.message || data.toolData?.message || data.toolData?.question
      || data.toolData?.summary || data.toolData?.problem_description || '';
    if (!toolMsg && data.toolName === 'Request_Approval' && data.toolData) {
      toolMsg = '**Action:** ' + (data.toolData.action_type||'') + '\\n\\n**Impact:** ' + (data.toolData.impact||'') + '\\n\\n**Justification:** ' + (data.toolData.justification||'');
    }

    const isMultiChoice = data.toolName === 'Ask_Multiple_Choice' && data.toolData?.options;
    const actionsHtml = buildActionsHtml(sessionId, data);
    const time = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});

    const bubble = document.createElement('div');
    bubble.className = 'message-row agent tool-bubble';
    bubble.id = 'tool-bubble-' + data.requestId;
    bubble.innerHTML = \`
      <div class="message-info"><span class="sender">Tool: \${escapeHtml(toolNameLabel)}</span><span class="timestamp">\${time}</span></div>
      <div class="message-bubble">
        <div class="tool-context-header"><div class="tool-badge">\${escapeHtml(toolNameLabel)}</div>\${parseMarkdown(toolMsg)}</div>
        <div class="tool-chips\${isMultiChoice?' multiple-choice-container':''}">\${actionsHtml}</div>
      </div>\`;

    bubble.querySelectorAll('[data-response]').forEach(el => {
      el.addEventListener('click', () => sendBubbleChip(sessionId, data.requestId, el.dataset.response, el, bubble));
    });

    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
    return bubble;
  }

  function sendBubbleChip(sessionId, requestId, text, chipEl, bubble) {
    bubble.querySelectorAll('[data-response]').forEach(el => el.disabled = true);
    chipEl.classList.add('selected');
    bubble.classList.add('responded');
    clearTimedDecisionForSession(sessionId);
    sendMessage(sessionId, text);
  }

  // ── Quick replies ─────────────────────────────────────────────────────────
  function repopulateQuickReplies(sessionId) {
    const container = document.getElementById('chips-' + sessionId);
    if (!container) return;
    const opts = getSessionQuickReplies(sessionId);
    container.innerHTML = opts.map((opt,i) =>
      \`<button class="chip \${i===0?'primary':''}" data-response="\${escapeHtml(opt)}">\${escapeHtml(opt)}</button>\`
    ).join('');
    container.querySelectorAll('[data-response]').forEach(el => {
      el.addEventListener('click', () => sendMessage(sessionId, el.dataset.response));
    });
  }

  function setSessionControlsEnabled(sessionId, enabled) {
    const btn = document.querySelector('[data-session="' + sessionId + '"].send-button');
    if (btn) btn.disabled = !enabled;
    const chips = document.getElementById('chips-' + sessionId);
    if (chips) chips.querySelectorAll('[data-response]').forEach(el => el.disabled = !enabled);
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function sendMessage(sessionId, message) {
    if (!message) return;
    const ta = document.querySelector('textarea[data-session="' + sessionId + '"]');
    const btn = document.querySelector('.send-button[data-session="' + sessionId + '"]');
    if (ta) { ta.value = ''; ta.style.height = 'auto'; }
    if (btn) btn.disabled = true;
    const chips = document.getElementById('chips-' + sessionId);
    if (chips) chips.innerHTML = '';

    try {
      const stateResp = await fetch('/sessions/' + sessionId + '/state');
      const sessionState = await stateResp.json();
      const req = sessionState.latestPendingRequest;
      if (!req) throw new Error('No pending AI request found. Web interface can only respond to AI questions.');
      const resp = await fetch('/response', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ requestId: req.requestId, response: message, source: 'web' })
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
    } catch(err) {
      addMessageToUI(sessionId, 'agent', '❌ Error: ' + err.message, null, null);
      if (btn) btn.disabled = false;
    }
  }

  // ── Request state change ──────────────────────────────────────────────────
  function handleRequestStateChange(data) {
    const sessionId = data.sessionId;
    if (!sessionId) return;
    if (data.state === 'waiting_for_response') {
      pendingRequestIds[sessionId] = data.requestId;
      renderToolBubble(sessionId, data);
      setSessionControlsEnabled(sessionId, true);
      repopulateQuickReplies(sessionId);
      highlightTab(sessionId);
    } else if (data.state === 'completed') {
      delete pendingRequestIds[sessionId];
      setSessionControlsEnabled(sessionId, false);
      clearTimedDecisionForSession(sessionId);
      const chips = document.getElementById('chips-' + sessionId);
      if (chips) chips.innerHTML = '';
    }
  }

  function highlightTab(sessionId) {
    const tab = document.querySelector('[data-session="' + sessionId + '"].tab');
    if (tab && activePanel !== 'session-' + sessionId) tab.classList.add('has-notification');
  }

  function clearTimedDecisionForSession(sessionId) {
    if (timedDecisionTimers[sessionId]) {
      clearInterval(timedDecisionTimers[sessionId].interval);
      clearTimeout(timedDecisionTimers[sessionId].timeout);
      const wrap = document.getElementById('td-wrap-' + sessionId);
      if (wrap) wrap.remove();
      delete timedDecisionTimers[sessionId];
    }
  }

  // ── Load history ──────────────────────────────────────────────────────────
  async function loadSessionMessages(sessionId) {
    try {
      const r = await fetch('/sessions/' + sessionId + '/messages');
      const data = await r.json();
      const container = document.getElementById('messages-' + sessionId);
      if (!container) return;
      container.innerHTML = '';
      (data.messages || []).forEach(msg => addMessageToUI(sessionId, msg.sender, msg.content, msg.source, msg.timestamp));
      // Restore pending tool bubble
      const stateResp = await fetch('/sessions/' + sessionId + '/state');
      const state = await stateResp.json();
      if (state.latestPendingRequest) {
        const req = state.latestPendingRequest;
        handleRequestStateChange({ state: 'waiting_for_response', sessionId, requestId: req.requestId, toolName: req.toolName, toolData: req, message: req.message || req.question || req.summary || req.problem_description });
      }
    } catch(e) { console.error('loadSessionMessages error', e); }
  }

  async function loadAllSessionMessages() {
    for (const s of __SESSIONS__) await loadSessionMessages(s.id);
  }

  // ── SSE ───────────────────────────────────────────────────────────────────
  function setupSSE() {
    const es = new EventSource('/mcp?clientType=web');
    es.onopen = () => { webReconnectAttempts = 0; loadAllSessionMessages(); };
    es.onmessage = e => {
      try { dispatchSSE(JSON.parse(e.data)); } catch(err) { console.error('SSE parse error', err); }
    };
    es.onerror = () => {
      es.close();
      const delay = Math.min(1000 * Math.pow(2, webReconnectAttempts), 30000);
      webReconnectAttempts++;
      if (webReconnectTimeout) clearTimeout(webReconnectTimeout);
      webReconnectTimeout = setTimeout(setupSSE, delay);
    };
  }

  function dispatchSSE(env) {
    const type = env.type;
    const data = env.data;
    if (type === 'heartbeat' || type === 'connection') return;
    if (type === 'chat_message') {
      const sid = data?.sessionId ?? env.sessionId;
      const msg = data?.message ?? env.message;
      if (sid && msg) { addMessageToUI(sid, msg.sender, msg.content, msg.source, msg.timestamp); highlightTab(sid); }
    } else if (type === 'request-state-change') {
      handleRequestStateChange(data || env);
    } else if (type === 'session-registered') {
      addSessionTab(data.sessionId, data.title, data.quickReplyOptions);
    } else if (type === 'session-unregistered') {
      removeSessionTab(data.sessionId);
    } else if (type === 'session-name-changed') {
      const tab = document.querySelector('[data-session="' + data.sessionId + '"].tab');
      if (tab) tab.textContent = data.name;
      const s = __SESSIONS__.find(s => s.id === data.sessionId);
      if (s) s.title = data.name;
    } else if (type === 'proxy-log') {
      if (activePanel === 'proxy-logs') addProxyLogToUI(data, true);
    } else if (type === 'proxy-log-update') {
      updateProxyLogInUI(data);
    }
  }

  // ── Proxy logs ────────────────────────────────────────────────────────────
  async function loadProxyLogs() {
    try {
      const r = await fetch('/proxy/logs');
      const data = await r.json();
      const logs = data.logs || data;
      const c = document.getElementById('proxy-logs');
      c.innerHTML = '';
      if (!logs.length) { c.innerHTML = '<div class="empty-state">No proxy logs yet.</div>'; return; }
      logs.forEach(l => addProxyLogToUI(l, false));
    } catch(e) { console.error(e); }
  }

  function addProxyLogToUI(entry, prepend) {
    window.proxyLogsDataCache[entry.id] = entry;
    const c = document.getElementById('proxy-logs');
    if (!c) return;
    c.querySelector('.empty-state')?.remove();

    const status = entry.responseStatus;
    const statusClass = status >= 200 && status < 300 ? 'success' : 'error';
    const ruleBadge = entry.ruleApplied ? \`<span class="proxy-log-rule-badge">⚙️ Rule #\${entry.ruleApplied.ruleIndex}</span>\` : '';
    const mods = entry.ruleApplied?.modifications?.map(m => \`<div>• \${escapeHtml(m)}</div>\`).join('') || '';

    const div = document.createElement('div');
    div.className = 'proxy-log-entry' + (entry.ruleApplied ? ' rule-applied' : '');
    div.dataset.logId = entry.id;
    div.innerHTML = \`
      <div class="proxy-log-summary" onclick="toggleLogDetails('\${entry.id}')">
        <div class="proxy-log-header">
          <span class="proxy-log-method">\${escapeHtml(entry.method||'')}</span>
          \${ruleBadge}
          <span class="proxy-log-status \${statusClass}">\${status || 'Pending'}</span>
          <span>\${entry.duration ? entry.duration+'ms' : ''}</span>
          <span>\${entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}</span>
        </div>
        <div class="proxy-log-url">\${escapeHtml(entry.url||'')}</div>
        \${mods ? '<div class="proxy-log-modifications">' + mods + '</div>' : ''}
      </div>
      <div class="proxy-log-details" id="pld-\${entry.id}">
        <div class="proxy-log-actions">
          <button class="btn-small" onclick="copyLogAsJSON('\${entry.id}')">📋 Copy JSON</button>
          <button class="btn-small" onclick="createRuleFromLog('\${entry.id}')">🎯 Create Rule</button>
        </div>
        <div class="proxy-log-section"><h4>Request Body</h4><pre>\${escapeHtml(formatBody(entry.requestBodyModified ?? entry.requestBody))}</pre></div>
        <div class="proxy-log-section"><h4>Response Body</h4><pre>\${escapeHtml(formatBody(entry.responseBody))}</pre></div>
      </div>\`;

    prepend ? c.insertBefore(div, c.firstChild) : c.appendChild(div);
    applyModifiedFilter(div, entry);
    // Keep max 200
    while (c.children.length > 200) c.removeChild(c.lastChild);
  }

  function updateProxyLogInUI(entry) {
    window.proxyLogsDataCache[entry.id] = entry;
    const div = document.querySelector('[data-log-id="' + entry.id + '"]');
    if (!div) return;
    const status = entry.responseStatus;
    const statusClass = status >= 200 && status < 300 ? 'success' : 'error';
    const summary = div.querySelector('.proxy-log-summary');
    if (summary) {
      summary.querySelector('.proxy-log-status').textContent = status || 'Pending';
      summary.querySelector('.proxy-log-status').className = 'proxy-log-status ' + statusClass;
    }
    const details = document.getElementById('pld-' + entry.id);
    if (details) {
      const sections = details.querySelectorAll('.proxy-log-section pre');
      if (sections[0]) sections[0].textContent = formatBody(entry.requestBodyModified ?? entry.requestBody);
      if (sections[1]) sections[1].textContent = formatBody(entry.responseBody);
    }
  }

  function formatBody(body) {
    if (!body) return '(empty)';
    if (typeof body === 'object') return JSON.stringify(body, null, 2);
    try { return JSON.stringify(JSON.parse(body), null, 2); } catch(e) { return String(body); }
  }

  function toggleLogDetails(logId) {
    const d = document.getElementById('pld-' + logId);
    if (d) d.style.display = d.style.display === 'block' ? 'none' : 'block';
  }

  function clearProxyLogs() {
    fetch('/proxy/clear-logs', {method:'POST'}).then(() => {
      document.getElementById('proxy-logs').innerHTML = '<div class="empty-state">No proxy logs yet.</div>';
    });
  }

  function toggleFilterModifiedOnly() {
    const checked = document.getElementById('filter-modified-only').checked;
    document.querySelectorAll('.proxy-log-entry').forEach(el => {
      if (checked && !el.classList.contains('rule-applied')) el.style.display = 'none';
      else el.style.display = '';
    });
  }

  function applyModifiedFilter(el, entry) {
    const checkbox = document.getElementById('filter-modified-only');
    if (checkbox && checkbox.checked && !entry.ruleApplied) el.style.display = 'none';
  }

  async function copyLogAsJSON(logId) {
    const entry = window.proxyLogsDataCache[logId];
    if (!entry) return;
    try { await navigator.clipboard.writeText(JSON.stringify(entry, null, 2)); } catch(e) { alert(JSON.stringify(entry, null, 2)); }
  }

  function createRuleFromLog(logId) {
    const entry = window.proxyLogsDataCache[logId];
    if (!entry) return;
    document.getElementById('rule-pattern').value = escapeRegex(entry.url || '');
    showAddRuleForm();
  }

  function escapeRegex(s) { return s.replace(/[.*+?^{}()|$[\\]\\\\]/g, '\\\\$&'); }

  // ── Proxy rules ───────────────────────────────────────────────────────────
  async function loadRules() {
    try {
      const r = await fetch('/proxy/rules');
      const rules = await r.json();
      renderRules(rules);
    } catch(e) { console.error(e); }
  }

  function renderRules(rules) {
    const c = document.getElementById('rules-list');
    if (!Array.isArray(rules) || !rules.length) { c.innerHTML = '<div class="empty-state">No proxy rules. Click + Add Rule to create one.</div>'; return; }
    c.innerHTML = rules.map(rule => \`
      <div class="rule-item \${rule.enabled===false?'disabled-rule':''}" id="rule-item-\${escapeHtml(rule.id)}">
        <div class="rule-info">
          <div class="rule-name">\${escapeHtml(rule.name || rule.id)}</div>
          <div class="rule-pattern">\${escapeHtml(rule.urlPattern || '')}</div>
        </div>
        <div class="rule-actions">
          <button class="btn-small" onclick="toggleRule('\${escapeHtml(rule.id)}', \${!rule.enabled})">\${rule.enabled===false?'Enable':'Disable'}</button>
          <button class="btn-small" onclick="deleteRule('\${escapeHtml(rule.id)}')" style="color:#f44336">Delete</button>
        </div>
      </div>\`).join('');
  }

  async function toggleRule(ruleId, enabled) {
    await fetch('/proxy/rules/' + ruleId, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({enabled}) });
    loadRules();
  }

  async function deleteRule(ruleId) {
    if (!confirm('Delete rule?')) return;
    await fetch('/proxy/rules/' + ruleId, { method:'DELETE' });
    loadRules();
  }

  function showAddRuleForm() { document.getElementById('add-rule-form').classList.add('active'); }
  function hideAddRuleForm() {
    document.getElementById('add-rule-form').classList.remove('active');
    ['rule-name','rule-pattern','rule-redirect','rule-jsonata','rule-session-id'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
    document.getElementById('rule-drop-status').value = '204';
    document.getElementById('rule-enabled').checked = true;
    document.getElementById('rule-drop').checked = false;
    document.getElementById('rule-drop-status-row').style.display = 'none';
  }

  document.getElementById('rule-scope').addEventListener('change', function() {
    document.getElementById('rule-session-id-row').style.display = this.value === 'session' ? 'flex' : 'none';
  });

  async function saveRule() {
    const rule = {
      name: document.getElementById('rule-name').value.trim(),
      urlPattern: document.getElementById('rule-pattern').value.trim(),
      redirectTo: document.getElementById('rule-redirect').value.trim() || undefined,
      jsonataExpression: document.getElementById('rule-jsonata').value.trim() || undefined,
      scope: document.getElementById('rule-scope').value,
      sessionId: document.getElementById('rule-session-id').value.trim() || undefined,
      enabled: document.getElementById('rule-enabled').checked,
      dropRequest: document.getElementById('rule-drop').checked,
      dropStatus: document.getElementById('rule-drop').checked ? parseInt(document.getElementById('rule-drop-status').value) || 204 : undefined
    };
    if (!rule.urlPattern) { alert('URL Pattern is required.'); return; }
    try {
      await fetch('/proxy/rules', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(rule) });
      hideAddRuleForm();
      loadRules();
    } catch(e) { alert('Error saving rule: ' + e.message); }
  }

  // ── Debug logs ────────────────────────────────────────────────────────────
  let lastDebugLogCount = 0;

  async function loadDebugLogs() {
    try {
      const r = await fetch('/proxy/logs');
      const data = await r.json();
      const debugLogs = data.debugLogs || [];
      if (debugLogs.length === lastDebugLogCount) return;
      const newLogs = debugLogs.slice(lastDebugLogCount);
      lastDebugLogCount = debugLogs.length;
      const c = document.getElementById('debug-logs');
      c.querySelector('.empty-state')?.remove();
      const filter = (document.getElementById('debug-filter-input')?.value || '').toLowerCase();
      newLogs.forEach(entry => {
        if (filter && !String(entry.message || '').toLowerCase().includes(filter)) return;
        const div = document.createElement('div');
        const level = (entry.level || '').toLowerCase();
        div.className = 'debug-log-entry' + (level === 'error' ? ' entry-error' : level === 'success' ? ' entry-success' : '');
        div.innerHTML = \`<span class="ts">\${entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}</span><span>\${escapeHtml(String(entry.message || ''))}</span>\`;
        c.appendChild(div);
      });
      c.scrollTop = c.scrollHeight;
    } catch(e) {}
  }

  function clearDebugLogs() {
    lastDebugLogCount = 0;
    document.getElementById('debug-logs').innerHTML = '<div class="empty-state">No debug logs yet.</div>';
  }

  function filterDebugLogs() { loadDebugLogs(); }

  function startDebugPoll() { if (!debugPollInterval) debugPollInterval = setInterval(loadDebugLogs, 2000); loadDebugLogs(); }
  function stopDebugPoll() { if (debugPollInterval) { clearInterval(debugPollInterval); debugPollInterval = null; } }

  // ── Boot ──────────────────────────────────────────────────────────────────
  async function init() {
    await loadAllSessionMessages();
    await loadProxyLogs();
    await loadRules();
    setupSSE();
  }
  init();
})();
</script>
</body>
</html>`;
}
