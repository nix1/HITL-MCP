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
      || (workspaceRoot ? path.basename(workspaceRoot) : `Session ${id.substring(0, 8)}`);
    return { id, title, quickReplyOptions };
  });

  const sessionsJson = JSON.stringify(sessions);
  const firstPanel = sessions.length > 0 ? `session-${sessions[0].id}` : 'proxy-logs';

  const sidebarSessionsHtml = sessions.map((s, i) => `
    <div class="nav-item session-item${i === 0 ? ' active' : ''}" data-panel="session-${escapeHtml(s.id)}" data-session="${escapeHtml(s.id)}">
      <span class="session-dot dot-idle" id="dot-${escapeHtml(s.id)}"></span>
      <span class="nav-label">${escapeHtml(s.title)}</span>
      <span class="notif-badge" id="badge-${escapeHtml(s.id)}" style="display:none"></span>
    </div>`).join('');

  const chatPanelsHtml = sessions.length === 0
    ? `<div class="panel active" id="panel-no-sessions">
        <div class="empty-hero">
          <div class="empty-icon">🤖</div>
          <h2>No active sessions</h2>
          <p>Start an AI agent in VS Code — sessions will appear here automatically.</p>
        </div>
      </div>`
    : sessions.map((s, i) => `
      <div class="panel chat-panel${i === 0 ? ' active' : ''}" id="panel-session-${escapeHtml(s.id)}" data-session="${escapeHtml(s.id)}">
        <div class="chat-header">
          <span class="chat-title">${escapeHtml(s.title)}</span>
          <span class="chat-status" id="chat-status-${escapeHtml(s.id)}">Waiting for agent…</span>
        </div>
        <div class="messages" id="messages-${escapeHtml(s.id)}">
          <div class="empty-state">Loading conversation…</div>
        </div>
        <div class="composer-area">
          <div class="chips-row" id="chips-${escapeHtml(s.id)}"></div>
          <div class="composer">
            <textarea class="composer-input" data-session="${escapeHtml(s.id)}" placeholder="Type a response…" rows="1" disabled></textarea>
            <button class="send-btn" data-session="${escapeHtml(s.id)}" disabled>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
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
:root {
  --bg:       #0d1117;
  --surf:     #161b22;
  --surf2:    #1c2128;
  --surf3:    #21262d;
  --border:   #30363d;
  --text:     #e6edf3;
  --muted:    #8b949e;
  --accent:   #2f81f7;
  --accent2:  #388bfd;
  --green:    #3fb950;
  --orange:   #d29922;
  --red:      #f85149;
  --purple:   #a371f7;
  --user-bg:  #1a3a5c;
  --agent-bg: #1c2128;
  --tool-bg:  #161b22;
  --radius:   10px;
  --sidebar:  220px;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;background:var(--bg);color:var(--text);display:flex;flex-direction:column}

/* ── App shell ─────────────────────────────────────────────────────────── */
.app{display:flex;flex-direction:column;height:100vh}

/* ── Top bar ─────────────────────────────────────────────────────────── */
.topbar{display:flex;align-items:center;gap:10px;padding:0 16px;height:44px;background:var(--surf);border-bottom:1px solid var(--border);flex-shrink:0;z-index:10}
.topbar-brand{font-weight:700;font-size:14px;letter-spacing:.3px;color:var(--text);display:flex;align-items:center;gap:8px}
.topbar-brand svg{color:var(--accent)}
.conn-dot{width:7px;height:7px;border-radius:50%;background:var(--muted);flex-shrink:0;transition:background .3s}
.conn-dot.online{background:var(--green)}
.conn-dot.offline{background:var(--red);animation:pulse-red 1.5s infinite}
@keyframes pulse-red{0%,100%{opacity:1}50%{opacity:.4}}
.conn-label{font-size:11px;color:var(--muted)}
.topbar-spacer{flex:1}

/* ── Layout ─────────────────────────────────────────────────────────── */
.layout{display:flex;flex:1;overflow:hidden}

/* ── Sidebar ─────────────────────────────────────────────────────────── */
.sidebar{width:var(--sidebar);background:var(--surf);border-right:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0;overflow:hidden}
.sidebar-section{padding:12px 8px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted)}
.nav-item{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;margin:1px 6px;cursor:pointer;color:var(--muted);transition:background .15s,color .15s;position:relative;user-select:none}
.nav-item:hover{background:var(--surf3);color:var(--text)}
.nav-item.active{background:var(--surf3);color:var(--text)}
.nav-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}
.session-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;transition:background .3s}
.dot-idle{background:var(--muted)}
.dot-waiting{background:var(--orange);animation:pulse-orange 1s infinite}
.dot-active{background:var(--green)}
@keyframes pulse-orange{0%,100%{opacity:1}50%{opacity:.3}}
.notif-badge{background:var(--orange);color:#000;font-size:9px;font-weight:700;border-radius:10px;padding:1px 5px;line-height:1.6;flex-shrink:0}
.sidebar-divider{height:1px;background:var(--border);margin:8px 12px}
.sidebar-fill{flex:1}
.proxy-icon{font-size:13px;flex-shrink:0}

/* ── Content ─────────────────────────────────────────────────────────── */
.content{flex:1;overflow:hidden;position:relative}
.panel{display:none;height:100%;flex-direction:column}
.panel.active{display:flex}

/* ── Chat panel ─────────────────────────────────────────────────────────── */
.chat-header{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--border);background:var(--surf);flex-shrink:0}
.chat-title{font-weight:600;font-size:13.5px}
.chat-status{font-size:11px;color:var(--muted)}
.chat-status.waiting{color:var(--orange)}
.chat-status.responded{color:var(--green)}

.messages{flex:1;overflow-y:auto;padding:20px 16px;display:flex;flex-direction:column;gap:14px;scroll-behavior:smooth}
.messages::-webkit-scrollbar{width:5px}
.messages::-webkit-scrollbar-thumb{background:var(--surf3);border-radius:3px}

/* ── Message bubbles ─────────────────────────────────────────────────────── */
.msg{display:flex;flex-direction:column;max-width:78%}
.msg.from-agent{align-self:flex-start}
.msg.from-user{align-self:flex-end}
.msg-meta{font-size:10px;color:var(--muted);margin-bottom:3px;display:flex;gap:6px;align-items:center}
.msg.from-user .msg-meta{flex-direction:row-reverse}
.msg-bubble{padding:10px 14px;border-radius:var(--radius);line-height:1.55;word-break:break-word}
.msg.from-agent .msg-bubble{background:var(--agent-bg);border:1px solid var(--border);border-bottom-left-radius:2px;color:var(--text)}
.msg.from-user .msg-bubble{background:var(--user-bg);border:1px solid #2a4a6e;border-bottom-right-radius:2px;color:#cde}
.msg-content p{margin:0 0 6px}
.msg-content p:last-child{margin-bottom:0}
.msg-content code{font-family:'Fira Code',monospace;font-size:12px;background:rgba(0,0,0,.3);padding:1px 5px;border-radius:4px}
.msg-content pre{background:rgba(0,0,0,.35);padding:10px;border-radius:6px;overflow-x:auto;margin:6px 0;font-size:12px}
.msg-content pre code{background:none;padding:0}
.msg-content strong{color:#e6edf3}

/* ── Tool bubble ─────────────────────────────────────────────────────────── */
.msg.tool-call{max-width:88%}
.tool-card{background:var(--tool-bg);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:var(--radius);border-bottom-left-radius:2px;overflow:hidden}
.tool-card-header{display:flex;align-items:center;gap:8px;padding:10px 14px 6px;border-bottom:1px solid var(--border)}
.tool-name-badge{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;background:rgba(47,129,247,.15);color:var(--accent);padding:2px 7px;border-radius:4px;border:1px solid rgba(47,129,247,.3)}
.tool-card-ts{font-size:10px;color:var(--muted);margin-left:auto}
.tool-card-body{padding:10px 14px}
.tool-msg{font-size:13px;color:var(--text);line-height:1.55}
.tool-msg p{margin:0 0 6px}
.tool-msg p:last-child{margin-bottom:0}
.tool-msg strong{color:#e6edf3}
.tool-msg code{font-family:monospace;font-size:12px;background:rgba(0,0,0,.3);padding:1px 5px;border-radius:4px}
.tool-actions{display:flex;flex-wrap:wrap;gap:7px;padding:10px 14px;border-top:1px solid var(--border);background:rgba(0,0,0,.08)}
.tool-actions.cards{flex-direction:column;gap:6px}
.tool-card.responded{border-left-color:var(--green)}
.tool-card.responded .tool-actions{opacity:.5}

/* ── Action chips ─────────────────────────────────────────────────────────── */
.chip{padding:5px 13px;background:var(--surf3);color:var(--text);border:1px solid var(--border);border-radius:20px;font-size:12px;cursor:pointer;transition:background .15s,border-color .15s,transform .1s;font-family:inherit;white-space:nowrap}
.chip:hover:not(:disabled){background:var(--surf2);border-color:var(--accent);transform:translateY(-1px)}
.chip.primary{background:rgba(47,129,247,.2);border-color:var(--accent);color:var(--accent)}
.chip.primary:hover:not(:disabled){background:rgba(47,129,247,.3)}
.chip:disabled{opacity:.4;cursor:default;transform:none}
.chip.selected{background:rgba(63,185,80,.2);border-color:var(--green);color:var(--green);cursor:default}
.chip.selected::after{content:' ✓'}

/* ── Option cards ─────────────────────────────────────────────────────────── */
.opt-card{display:flex;flex-direction:column;padding:10px 12px;background:var(--surf2);border:1px solid var(--border);border-radius:8px;cursor:pointer;text-align:left;width:100%;color:var(--text);font-family:inherit;transition:border-color .15s,background .15s}
.opt-card:hover:not(:disabled){border-color:var(--accent);background:var(--surf3)}
.opt-card.recommended{border-color:var(--accent);background:rgba(47,129,247,.06)}
.opt-card:disabled{opacity:.4;cursor:default}
.opt-card.selected{border-color:var(--green);background:rgba(63,185,80,.06)}
.opt-card.selected::before{content:'✓ ';color:var(--green);font-weight:700}
.opt-title{font-weight:600;font-size:12.5px;display:flex;justify-content:space-between;align-items:center;margin-bottom:3px}
.opt-desc{font-size:11px;color:var(--muted);line-height:1.4}
.rec-badge{font-size:9px;font-weight:700;text-transform:uppercase;background:var(--accent);color:#fff;padding:1px 7px;border-radius:10px;letter-spacing:.4px}

/* ── Countdown ─────────────────────────────────────────────────────────── */
.countdown{padding:8px 14px;border-top:1px solid var(--border);background:rgba(0,0,0,.1)}
.countdown-track{height:2px;background:var(--surf3);border-radius:1px;margin-bottom:5px;overflow:hidden}
.countdown-bar{height:100%;background:linear-gradient(90deg,var(--accent),var(--purple));border-radius:1px;transition:width 1s linear}
.countdown-label{font-size:10px;color:var(--muted);text-align:center}
.countdown-label strong{color:var(--accent)}

/* ── Composer ─────────────────────────────────────────────────────────── */
.composer-area{padding:12px 14px;border-top:1px solid var(--border);background:var(--surf);flex-shrink:0}
.chips-row{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;min-height:0}
.chips-row:empty{display:none}
.composer{display:flex;gap:8px;align-items:flex-end}
.composer-input{flex:1;background:var(--surf3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit;font-size:13px;padding:8px 12px;resize:none;outline:none;min-height:36px;max-height:140px;line-height:1.4;transition:border-color .2s}
.composer-input:focus{border-color:var(--accent)}
.composer-input:disabled{opacity:.5;cursor:not-allowed}
.composer-input::placeholder{color:var(--muted)}
.send-btn{width:36px;height:36px;background:var(--accent);border:none;border-radius:8px;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:background .15s,opacity .15s}
.send-btn:hover:not(:disabled){background:var(--accent2)}
.send-btn:disabled{opacity:.4;cursor:not-allowed}

/* ── Proxy panels ─────────────────────────────────────────────────────────── */
.proxy-panel{flex:1;display:flex;flex-direction:column;overflow:hidden}
.proxy-toolbar{display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);background:var(--surf);flex-shrink:0;flex-wrap:wrap}
.proxy-toolbar h2{font-size:13px;font-weight:600;color:var(--text);flex-shrink:0}
.proxy-toolbar-spacer{flex:1}
.btn{padding:5px 12px;font-size:11.5px;background:var(--surf3);color:var(--text);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-family:inherit;transition:background .15s,border-color .15s}
.btn:hover{background:var(--surf2);border-color:var(--muted)}
.btn.primary{background:rgba(47,129,247,.2);border-color:var(--accent);color:var(--accent)}
.btn.primary:hover{background:rgba(47,129,247,.3)}
.btn.danger{color:var(--red);border-color:rgba(248,81,73,.4)}
.btn.danger:hover{background:rgba(248,81,73,.1)}
.proxy-scroll{flex:1;overflow-y:auto;padding:10px 14px}
.proxy-scroll::-webkit-scrollbar{width:5px}
.proxy-scroll::-webkit-scrollbar-thumb{background:var(--surf3);border-radius:3px}
.log-entry{border:1px solid var(--border);border-radius:8px;margin-bottom:6px;overflow:hidden;transition:border-color .15s}
.log-entry:hover{border-color:var(--muted)}
.log-entry.modified{border-left:3px solid var(--orange)}
.log-summary{display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;font-size:12px}
.log-method{font-weight:700;font-size:11px;padding:1px 6px;border-radius:4px;background:rgba(47,129,247,.15);color:var(--accent)}
.log-method.POST{background:rgba(63,185,80,.15);color:var(--green)}
.log-method.PUT,.log-method.PATCH{background:rgba(210,153,34,.15);color:var(--orange)}
.log-method.DELETE{background:rgba(248,81,73,.15);color:var(--red)}
.log-status{font-weight:700;font-size:11px}
.log-status.ok{color:var(--green)}
.log-status.err{color:var(--red)}
.log-status.pending{color:var(--muted)}
.log-url{flex:1;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.log-time{color:var(--muted);font-size:10px;flex-shrink:0}
.log-badge{background:var(--orange);color:#000;font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px}
.log-details{display:none;padding:10px 12px;border-top:1px solid var(--border);background:rgba(0,0,0,.15)}
.log-section h4{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:6px;margin-top:10px}
.log-section h4:first-child{margin-top:0}
.log-section pre{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px;font-size:11px;overflow-x:auto;max-height:180px;white-space:pre-wrap;word-break:break-all;color:var(--text)}
.log-actions{display:flex;gap:6px;margin-bottom:8px}
.rule-card{border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:flex-start;gap:10px;background:var(--surf)}
.rule-card.disabled{opacity:.45}
.rule-info{flex:1;min-width:0}
.rule-name{font-weight:600;font-size:13px;margin-bottom:2px}
.rule-pattern{font-size:11px;color:var(--muted);font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rule-btns{display:flex;gap:6px;flex-shrink:0}
.add-form{background:var(--surf);border:1px solid var(--border);border-radius:8px;padding:14px;margin-top:10px;display:none;flex-direction:column;gap:10px}
.add-form.open{display:flex}
.field{display:flex;flex-direction:column;gap:4px}
.field label{font-size:11px;color:var(--muted);font-weight:600}
.field input,.field textarea,.field select{background:var(--surf3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;font-family:monospace;padding:7px 10px;outline:none;transition:border-color .2s}
.field input:focus,.field textarea:focus,.field select:focus{border-color:var(--accent)}
.field textarea{resize:vertical;min-height:60px}
.field-row{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.field-row label{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text);cursor:pointer}
.form-actions{display:flex;gap:8px}
.debug-log{font-family:'Fira Code',monospace;font-size:11px;display:flex;gap:8px;padding:3px 0;border-bottom:1px solid rgba(48,54,61,.5)}
.debug-ts{color:var(--muted);flex-shrink:0}
.debug-msg{word-break:break-all}
.debug-msg.lvl-error{color:var(--red)}
.debug-msg.lvl-warn{color:var(--orange)}
.debug-msg.lvl-success{color:var(--green)}
.debug-filter input{background:var(--surf3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;padding:5px 10px;outline:none;width:200px}
.debug-filter input:focus{border-color:var(--accent)}

/* ── Empty states ─────────────────────────────────────────────────────────── */
.empty-state{text-align:center;color:var(--muted);padding:40px 20px;font-size:13px}
.empty-hero{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:var(--muted);text-align:center;padding:40px}
.empty-hero .empty-icon{font-size:48px}
.empty-hero h2{font-size:18px;font-weight:600;color:var(--text)}
.empty-hero p{font-size:13px;max-width:360px;line-height:1.6}

/* ── Waiting indicator ─────────────────────────────────────────────────────── */
.typing-indicator{display:flex;align-items:center;gap:6px;padding:8px 12px;background:var(--agent-bg);border:1px solid var(--border);border-radius:var(--radius);border-bottom-left-radius:2px;align-self:flex-start;max-width:80px}
.typing-dot{width:5px;height:5px;border-radius:50%;background:var(--muted);animation:typing 1.2s infinite}
.typing-dot:nth-child(2){animation-delay:.2s}
.typing-dot:nth-child(3){animation-delay:.4s}
@keyframes typing{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
</style>
</head>
<body>
<div class="app">
  <!-- Top bar -->
  <div class="topbar">
    <div class="topbar-brand">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
      HITL Control
    </div>
    <span class="conn-dot" id="connDot"></span>
    <span class="conn-label" id="connLabel">Connecting…</span>
    <div class="topbar-spacer"></div>
  </div>

  <div class="layout">
    <!-- Sidebar -->
    <div class="sidebar">
      <div class="sidebar-section">Sessions</div>
      <div id="session-nav">
        ${sidebarSessionsHtml || '<div style="padding:8px 14px;font-size:12px;color:var(--muted)">No active sessions</div>'}
      </div>
      <div class="sidebar-fill"></div>
      <div class="sidebar-divider"></div>
      <div class="sidebar-section">Proxy</div>
      <div class="nav-item" data-panel="proxy-logs">
        <span class="proxy-icon">📊</span>
        <span class="nav-label">Logs</span>
      </div>
      <div class="nav-item" data-panel="proxy-rules">
        <span class="proxy-icon">⚙️</span>
        <span class="nav-label">Rules</span>
      </div>
      <div class="nav-item" data-panel="proxy-debug">
        <span class="proxy-icon">🔍</span>
        <span class="nav-label">Debug</span>
      </div>
      <div style="height:8px"></div>
    </div>

    <!-- Main content -->
    <div class="content" id="content">
      ${chatPanelsHtml}

      <!-- Proxy Logs -->
      <div class="panel" id="panel-proxy-logs">
        <div class="proxy-panel">
          <div class="proxy-toolbar">
            <h2>Proxy Logs</h2>
            <div class="proxy-toolbar-spacer"></div>
            <label style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted);cursor:pointer">
              <input type="checkbox" id="filter-modified" onchange="toggleModifiedFilter()"> Modified only
            </label>
            <button class="btn" onclick="loadProxyLogs()">Refresh</button>
            <button class="btn danger" onclick="clearProxyLogs()">Clear</button>
          </div>
          <div class="proxy-scroll" id="proxy-logs">
            <div class="empty-state">No proxy logs yet. Enable the proxy to capture traffic.</div>
          </div>
        </div>
      </div>

      <!-- Proxy Rules -->
      <div class="panel" id="panel-proxy-rules">
        <div class="proxy-panel">
          <div class="proxy-toolbar">
            <h2>Proxy Rules</h2>
            <div class="proxy-toolbar-spacer"></div>
            <button class="btn" onclick="loadRules()">Refresh</button>
            <button class="btn primary" onclick="showAddForm()">+ Add Rule</button>
          </div>
          <div class="proxy-scroll">
            <div id="rules-list"><div class="empty-state">No rules yet.</div></div>
            <div class="add-form" id="add-form">
              <div class="field"><label>Rule Name</label><input id="r-name" placeholder="e.g. Block Telemetry"></div>
              <div class="field"><label>URL Pattern (regex)</label><input id="r-pattern" placeholder="^https://api\\.example\\.com/.*"></div>
              <div class="field"><label>Redirect To (optional)</label><input id="r-redirect" placeholder="https://localhost:8080"></div>
              <div class="field"><label>JSONata Transform (optional)</label><textarea id="r-jsonata" placeholder="$ ~> |messages[role='system']|{'content':'new system prompt'}|"></textarea></div>
              <div class="field">
                <label>Scope</label>
                <select id="r-scope" onchange="document.getElementById('r-sid-row').style.display=this.value==='session'?'flex':'none'">
                  <option value="global">Global — all workspaces</option>
                  <option value="session">Session-specific</option>
                </select>
              </div>
              <div class="field" id="r-sid-row" style="display:none"><label>Session ID</label><input id="r-sid" placeholder="session-…"></div>
              <div class="field-row">
                <label><input type="checkbox" id="r-enabled" checked> Enabled</label>
                <label><input type="checkbox" id="r-drop" onchange="document.getElementById('r-drop-row').style.display=this.checked?'flex':'none'"> Drop Request</label>
              </div>
              <div class="field" id="r-drop-row" style="display:none"><label>Drop Status Code</label><input id="r-drop-status" type="number" value="204" placeholder="204"></div>
              <div class="form-actions">
                <button class="btn primary" onclick="saveRule()">Save Rule</button>
                <button class="btn" onclick="hideAddForm()">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Proxy Debug -->
      <div class="panel" id="panel-proxy-debug">
        <div class="proxy-panel">
          <div class="proxy-toolbar">
            <h2>Debug Logs</h2>
            <div class="proxy-toolbar-spacer"></div>
            <div class="debug-filter"><input type="text" id="debug-filter" placeholder="Filter…" oninput="applyDebugFilter()"></div>
            <button class="btn danger" onclick="clearDebug()">Clear</button>
          </div>
          <div class="proxy-scroll" id="debug-logs" style="font-family:monospace">
            <div class="empty-state">No debug logs yet.</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
(function(){
'use strict';
const __S__ = ${sessionsJson};
const pending = {};           // sessionId -> requestId
const timers  = {};           // sessionId -> {iv, to}
let activePnl = '${escapeHtml(firstPanel)}';
let sseObj    = null;
let reconnect = 0;
let reconnTO  = null;
let debugPoll = null;
let debugSeen = 0;
window._pldc  = {};           // proxy log data cache

// ── Markdown ─────────────────────────────────────────────────────────────────
function md(text) {
  if (!text) return '';
  try { if (window.marked?.parse) return window.marked.parse(text); } catch(e) {}
  return esc(text).replace(/\\*\\*(.*?)\\*\\*/g,'<strong>$1</strong>').replace(/\\*(.*?)\\*/g,'<em>$1</em>').replace(/\`([^\`]+)\`/g,'<code>$1</code>').replace(/\\n/g,'<br>');
}
function esc(s){
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function fmt(body){
  if(!body) return '(empty)';
  if(typeof body==='object') return JSON.stringify(body,null,2);
  try{return JSON.stringify(JSON.parse(body),null,2);}catch(e){return String(body);}
}
function ts(d){return d?new Date(d).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}

// ── Navigation ────────────────────────────────────────────────────────────────
function switchTo(panelId) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.panel===panelId));
  document.querySelectorAll('.panel').forEach(el => el.classList.toggle('active', el.id==='panel-'+panelId));
  if (activePnl?.startsWith('session-')) {
    const sid = activePnl.slice(8);
    document.getElementById('badge-'+sid)?.style && (document.getElementById('badge-'+sid).style.display='none');
  }
  activePnl = panelId;
  if(panelId==='proxy-debug'){startDebugPoll();}else{stopDebugPoll();}
  if(panelId==='proxy-logs') loadProxyLogs();
  if(panelId==='proxy-rules') loadRules();
}

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => switchTo(el.dataset.panel));
});

// ── Sessions ──────────────────────────────────────────────────────────────────
function getQReplies(sid){
  const s = __S__.find(s=>s.id===sid);
  return s ? s.quickReplyOptions : ['Yes Please Proceed','Explain in more detail please'];
}

function addSessionToUI(sid, title, qrOpts) {
  if(document.querySelector('[data-session="'+sid+'"]')) return;
  const label = title||'Session '+sid.substring(0,8);
  if(!__S__.find(s=>s.id===sid)) __S__.push({id:sid, title:label, quickReplyOptions:qrOpts||['Yes Please Proceed','Explain in more detail please']});
  document.getElementById('panel-no-sessions')?.remove();

  const nav = document.getElementById('session-nav');
  // Remove the static "No active sessions" placeholder text if present
  const placeholder=nav?.querySelector('div:not(.nav-item)');
  if(placeholder) placeholder.remove();

  const item = document.createElement('div');
  item.className='nav-item session-item';
  item.dataset.panel = 'session-'+sid;
  item.dataset.session = sid;
  item.innerHTML = \`<span class="session-dot dot-idle" id="dot-\${sid}"></span><span class="nav-label">\${esc(label)}</span><span class="notif-badge" id="badge-\${sid}" style="display:none"></span>\`;
  item.addEventListener('click',()=>switchTo('session-'+sid));
  nav.appendChild(item);

  // Check before inserting the panel whether any chat panel exists.
  // If none did (first session, or after the last session was removed), auto-switch.
  const hadChatPanels = document.querySelector('.panel.chat-panel') !== null;

  const panel = document.createElement('div');
  panel.className='panel chat-panel';
  panel.id='panel-session-'+sid;
  panel.dataset.session=sid;
  panel.innerHTML=\`
    <div class="chat-header"><span class="chat-title">\${esc(label)}</span><span class="chat-status" id="chat-status-\${sid}">Waiting for agent…</span></div>
    <div class="messages" id="messages-\${sid}"><div class="empty-state">Loading conversation…</div></div>
    <div class="composer-area">
      <div class="chips-row" id="chips-\${sid}"></div>
      <div class="composer">
        <textarea class="composer-input" data-session="\${sid}" placeholder="Type a response…" rows="1" disabled></textarea>
        <button class="send-btn" data-session="\${sid}" disabled>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </div>
    </div>\`;
  document.getElementById('content').insertBefore(panel, document.getElementById('panel-proxy-logs'));
  wireInput(panel, sid);

  // Auto-switch rules:
  //  1. No panel is currently active (just cleared panel-no-sessions).
  //  2. There were no chat panels before this one — i.e. this is the first/only session
  //     being added. This covers the re-register cycle: session-unregistered moves the
  //     user to proxy-logs; session-registered should bring them back.
  if(!hadChatPanels || document.querySelectorAll('.panel.active').length===0) switchTo('session-'+sid);
  loadSession(sid);
}

function removeSessionFromUI(sid){
  document.querySelector('[data-session="'+sid+'"].nav-item')?.remove();
  document.getElementById('panel-session-'+sid)?.remove();
  clearTimer(sid);
  if(activePnl==='session-'+sid){
    const first=document.querySelector('.nav-item');
    if(first) switchTo(first.dataset.panel); else switchTo('proxy-logs');
  }
}

function wireInput(panel, sid){
  const ta = panel.querySelector('.composer-input');
  const btn = panel.querySelector('.send-btn');
  ta.addEventListener('input', ()=>{ ta.style.height='auto'; ta.style.height=Math.min(ta.scrollHeight,140)+'px'; });
  ta.addEventListener('keydown', e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();doSend(sid,ta.value.trim());} });
  btn.addEventListener('click', ()=>doSend(sid, ta.value.trim()));
}

document.querySelectorAll('.chat-panel').forEach(p => wireInput(p, p.dataset.session));

// ── Messages ──────────────────────────────────────────────────────────────────
function addMsg(sid, role, content, source, timestamp){
  const c = document.getElementById('messages-'+sid);
  if(!c) return;
  c.querySelector('.empty-state')?.remove();
  c.querySelector('.typing-indicator')?.remove();
  const isUser = role==='user';
  const senderLabel = isUser ? ('You'+(source?' ('+(source==='web'?'Web':'VS Code')+')':'')) : 'Agent';
  const row = document.createElement('div');
  row.className='msg '+(isUser?'from-user':'from-agent');
  row.innerHTML=\`
    <div class="msg-meta"><span>\${esc(senderLabel)}</span><span>\${ts(timestamp)}</span></div>
    <div class="msg-bubble"><div class="msg-content">\${md(content)}</div></div>\`;
  c.appendChild(row);
  c.scrollTop=c.scrollHeight;
}

// ── Tool bubbles ──────────────────────────────────────────────────────────────
const TOOL_ICONS_WEB={Gate_Start:'🎯',Gate_Checkpoint:'📊',Gate_Close:'🏁',Gate_Blocked:'🚫',Request_Approval:'🔐',Ask_Oracle:'🔮',Ask_Multiple_Choice:'🔀',Ask_Human_Expert:'💬'};

function toolActionsHtml(sid, data){
  const e=esc;
  const tn=data.toolName;
  const td=data.toolData||{};
  if(tn==='Request_Approval') return \`
    <button class="chip primary" data-r="✅ Approved. Proceed with the action.">✅ Approve</button>
    <button class="chip" data-r="❌ Denied. Please do not proceed.">❌ Deny</button>
    <button class="chip" data-r="Approve, but with modifications: ">📝 Modify…</button>\`;
  if(tn==='Gate_Close'||tn==='Gate_Checkpoint'||tn==='Gate_Start'){
    const ns=td.next_suggestion;
    const nl=ns?('✅ Proceed: '+(ns.length>28?ns.slice(0,26)+'…':ns)):(tn==='Gate_Close'?'🏁 Close Turn':'⏭️ Proceed');
    const nr=ns?'Excellent. Please proceed with: '+ns:(tn==='Gate_Close'?'Turn closed and report accepted.':'Proceeding with the next step.');
    return \`<button class="chip primary" data-r="\${e(nr)}">\${e(nl)}</button>
      <button class="chip" data-r="Review the recent changes and refactor for better architecture and consistency.">🧹 Refactor</button>
      <button class="chip" data-r="Check test coverage for the recent changes and add missing tests.">🧪 Tests</button>
      <button class="chip" data-r="Review the UI/UX. Suggest and implement improvements.">✨ Polish UX</button>
      <button class="chip" data-r="Here is your next task: ">📋 Assign…</button>
      \${tn==='Gate_Close'?'<button class="chip" data-r="I am not satisfied with the results. Please fix: ">❌ Needs work</button>':''}\`;
  }
  if(tn==='Gate_Blocked') return \`
    <button class="chip primary" data-r="I will help you unblock this. Please provide: ">🙋 Provide info</button>
    <button class="chip" data-r="Try a different approach that doesn't depend on this blocker: ">🔄 Change approach</button>
    <button class="chip" data-r="Ignore this blocker for now and focus on other tasks.">⏭️ Ignore &amp; skip</button>\`;
  if(tn==='Ask_Oracle') return \`
    <button class="chip primary" data-r="Proceed with the most likely solution.">✅ Try best solution</button>
    <button class="chip" data-r="Ignore this error and continue.">⏭️ Ignore</button>
    <button class="chip" data-r="Try a different approach: ">🔄 Try instead…</button>
    <button class="chip" data-r="I have fixed the issue manually. Please proceed.">🛠️ Fixed manually</button>\`;
  if(tn==='Ask_Multiple_Choice'&&td.options){
    const recId=td.recommendation;
    return td.options.map(o=>{
      const isR=o.id===recId;
      return \`<button class="opt-card\${isR?' recommended':''}" data-r="\${e('I select option '+o.id+': '+o.title)}">
        <div class="opt-title"><span>\${e(o.id)+'. '+e(o.title)}</span>\${isR?'<span class="rec-badge">Recommended</span>':''}</div>
        \${o.description?'<div class="opt-desc">'+e(o.description)+'</div>':''}</button>\`;
    }).join('');
  }
  return getQReplies(sid).map((r,i)=>\`<button class="chip\${i===0?' primary':''}" data-r="\${e(r)}">\${e(r)}</button>\`).join('');
}

function gateReportHtml(data){
  const td=data.toolData||{};
  const tn=data.toolName;
  let html='';

  if(tn==='Gate_Close'&&td.final_state){
    const colors={completed:'var(--green)',partial:'var(--orange)',blocked:'var(--red)'};
    const icons={completed:'✅',partial:'⚠️',blocked:'🚫'};
    const c=colors[td.final_state]||'var(--muted)';
    const ic=icons[td.final_state]||'📋';
    html+=\`<div style="display:inline-flex;align-items:center;gap:4px;margin-bottom:8px;padding:2px 9px;border-radius:4px;background:\${c}22;border:1px solid \${c}55;font-size:11px;font-weight:700;text-transform:uppercase;color:\${c}">\${ic} \${esc(td.final_state)}</div>\`;
  }

  const reqs=td.requirement_coverage||(tn==='Gate_Checkpoint'?td.requirement_delta:null)||[];
  if(reqs.length){
    const covered=reqs.filter(r=>r.status==='covered').length;
    const secTitle=tn==='Gate_Checkpoint'?'Progress':'Requirements';
    html+=\`<div style="margin:8px 0">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700;margin-bottom:4px">\${secTitle} <span style="background:var(--accent);color:#fff;border-radius:8px;padding:1px 6px;font-size:9px">\${covered}/\${reqs.length}</span></div>\`;
    reqs.forEach(r=>{
      const ic=r.status==='covered'?'✅':r.status==='partial'?'⚠️':(tn==='Gate_Checkpoint'?'🔄':'❌');
      html+=\`<div style="display:flex;align-items:center;gap:5px;font-size:11px;margin:2px 0">\${ic} <code style="font-size:10px;background:rgba(0,0,0,.25);padding:1px 4px;border-radius:3px">\${esc(r.requirement_id)}</code>\${r.evidence_ref?'<span style="font-size:10px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(r.evidence_ref)+'</span>':''}</div>\`;
    });
    html+='</div>';
  }

  if(tn==='Gate_Start'&&td.expected_requirements?.length){
    html+=\`<div style="margin:8px 0">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700;margin-bottom:4px">Expected Requirements <span style="background:var(--accent);color:#fff;border-radius:8px;padding:1px 6px;font-size:9px">\${td.expected_requirements.length}</span></div>\`;
    td.expected_requirements.forEach(r=>{
      html+=\`<div style="display:flex;align-items:center;gap:5px;font-size:11px;margin:2px 0">📋 <code style="font-size:10px;background:rgba(0,0,0,.25);padding:1px 4px;border-radius:3px">\${esc(r)}</code></div>\`;
    });
    html+='</div>';
  }

  const vals=td.validations||[];
  if(vals.length){
    const passed=vals.filter(v=>v.result==='pass').length;
    html+=\`<div style="margin:8px 0">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700;margin-bottom:4px">Validations <span style="background:var(--accent);color:#fff;border-radius:8px;padding:1px 6px;font-size:9px">\${passed}/\${vals.length}</span></div>\`;
    vals.forEach(v=>{
      const ic=v.result==='pass'?'✅':v.result==='warn'?'⚠️':'❌';
      html+=\`<div style="display:flex;align-items:center;gap:5px;font-size:11px;margin:2px 0">\${ic} <code style="font-size:10px;background:rgba(0,0,0,.25);padding:1px 4px;border-radius:3px">\${esc(v.check_id)}</code>\${v.details?'<span style="font-size:10px;color:var(--muted)"> — '+esc(v.details)+'</span>':''}</div>\`;
    });
    html+='</div>';
  }

  const b=td.blocker_details||(td.final_state==='blocked'?td.blocker:null);
  if(b){
    html+=\`<div style="margin:8px 0;padding:8px 10px;background:rgba(248,81,73,.08);border:1px solid rgba(248,81,73,.3);border-radius:6px">
      <div style="font-weight:700;color:var(--red);font-size:11px;margin-bottom:4px">🚫 \${esc(b.severity?.toUpperCase()||'BLOCKED')}</div>
      \${b.description?'<div style="font-size:12px;margin-bottom:4px">'+esc(b.description)+'</div>':''}
      \${b.needed_input?'<div style="font-size:11px;margin-top:3px">💡 <strong>Needed:</strong> '+esc(b.needed_input)+'</div>':''}
      \${b.next_unblock_step?'<div style="font-size:11px;margin-top:3px">👣 <strong>Next:</strong> '+esc(b.next_unblock_step)+'</div>':''}
    </div>\`;
  }
  return html;
}

function renderToolBubble(sid, data){
  const c = document.getElementById('messages-'+sid);
  if(!c) return null;
  c.querySelector('.empty-state')?.remove();
  c.querySelector('.typing-indicator')?.remove();

  const icon=TOOL_ICONS_WEB[data.toolName]||'🔧';
  const tn = (data.toolName||'Tool Request').replace(/_/g,' ');
  let msg = data.message||data.toolData?.message||data.toolData?.question||data.toolData?.summary||data.toolData?.problem_description||'';
  if(!msg&&data.toolName==='Request_Approval'&&data.toolData){
    const td=data.toolData;
    msg='**Action:** '+(td.action_type||'')+'\\n\\n**Impact:** '+(td.impact||'')+'\\n\\n**Justification:** '+(td.justification||'');
  }

  const isCards = data.toolName==='Ask_Multiple_Choice'&&data.toolData?.options;
  const actHtml = toolActionsHtml(sid, data);
  const report = gateReportHtml(data);
  const now = ts();

  const row = document.createElement('div');
  row.className='msg from-agent tool-call';
  row.id='tb-'+data.requestId;
  row.innerHTML=\`
    <div class="msg-meta"><span>\${esc(icon+' '+tn)}</span><span>\${now}</span></div>
    <div class="tool-card" id="tc-\${data.requestId}">
      <div class="tool-card-header"><span class="tool-name-badge">\${esc(tn)}</span><span class="tool-card-ts">\${now}</span></div>
      <div class="tool-card-body">
        \${msg?'<div class="tool-msg">'+md(msg)+'</div>':''}
        \${report}
      </div>
      <div class="tool-actions\${isCards?' cards':''}" id="ta-\${data.requestId}">\${actHtml}</div>
    </div>\`;

  row.querySelectorAll('[data-r]').forEach(el=>{
    el.addEventListener('click',()=>chipClick(sid,data.requestId,el.dataset.r,el,row));
  });

  c.appendChild(row);
  c.scrollTop=c.scrollHeight;
  return row;
}

function chipClick(sid, reqId, text, chipEl, bubble){
  bubble.querySelectorAll('[data-r]').forEach(el=>el.disabled=true);
  chipEl.classList.add('selected');
  document.getElementById('tc-'+reqId)?.classList.add('responded');
  clearTimer(sid);

  // Editable chips (ending with ': ') go into the textarea for the user to complete.
  if(text.trimEnd().endsWith(':')){
    const ta=document.querySelector('.composer-input[data-session="'+sid+'"]');
    const btn=document.querySelector('.send-btn[data-session="'+sid+'"]');
    if(ta){ta.value=text;ta.disabled=false;ta.focus();}
    if(btn) btn.disabled=false;
    return;
  }

  doSend(sid, text);
}

// ── Quick replies bar ─────────────────────────────────────────────────────────
function fillQReplies(sid){
  const c = document.getElementById('chips-'+sid);
  if(!c) return;
  const opts = getQReplies(sid);
  c.innerHTML = opts.map((o,i)=>\`<button class="chip\${i===0?' primary':''}" data-r="\${esc(o)}">\${esc(o)}</button>\`).join('');
  c.querySelectorAll('[data-r]').forEach(el=>{
    el.addEventListener('click',()=>doSend(sid, el.dataset.r));
  });
}

function setSessionEnabled(sid, enabled){
  const ta = document.querySelector('.composer-input[data-session="'+sid+'"]');
  const btn = document.querySelector('.send-btn[data-session="'+sid+'"]');
  if(ta) ta.disabled=!enabled;
  if(btn) btn.disabled=!enabled;
  document.getElementById('chips-'+sid)?.querySelectorAll('[data-r]').forEach(el=>el.disabled=!enabled);
}

function setDot(sid, state){
  const dot=document.getElementById('dot-'+sid);
  if(!dot) return;
  dot.className='session-dot '+(state==='waiting'?'dot-waiting':state==='idle'?'dot-idle':'dot-active');
}

function setChatStatus(sid, text, cls){
  const el=document.getElementById('chat-status-'+sid);
  if(!el) return;
  el.className='chat-status'+(cls?' '+cls:'');
  el.textContent=text;
}

// ── Send ──────────────────────────────────────────────────────────────────────
async function doSend(sid, message){
  if(!message?.trim()) return;
  const ta=document.querySelector('.composer-input[data-session="'+sid+'"]');
  const btn=document.querySelector('.send-btn[data-session="'+sid+'"]');
  if(ta){ta.value='';ta.style.height='auto';}
  if(btn) btn.disabled=true;
  const chips=document.getElementById('chips-'+sid);
  if(chips) chips.innerHTML='';
  try{
    const sr = await fetch('/sessions/'+sid+'/state');
    const st = await sr.json();
    const req = st.latestPendingRequest;
    if(!req) throw new Error('No pending request. The AI must ask a question first.');
    await fetch('/response',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:req.requestId,response:message,source:'web'})});
  }catch(err){
    addMsg(sid,'agent','⚠️ '+err.message,null,null);
    if(btn) btn.disabled=false;
  }
}

// ── State change handler ──────────────────────────────────────────────────────
function handleStateChange(data){
  const sid=data.sessionId;
  if(!sid) return;
  if(data.state==='waiting_for_response'){
    pending[sid]=data.requestId;
    const bubble=renderToolBubble(sid,data);
    setSessionEnabled(sid,true);
    fillQReplies(sid);
    setDot(sid,'waiting');
    setChatStatus(sid,'Waiting for your response…','waiting');
    notifyTab(sid);
    if(bubble){
      const def=getDefaultAction(data);
      if(def) startTimer(sid,120,def.text,def.label,bubble,data.requestId);
    }
  }else if(data.state==='completed'){
    delete pending[sid];
    setSessionEnabled(sid,false);
    clearTimer(sid);
    const chips=document.getElementById('chips-'+sid);
    if(chips) chips.innerHTML='';
    setDot(sid,'idle');
    setChatStatus(sid,'Agent working…');
  }
}

function notifyTab(sid){
  if(activePnl==='session-'+sid) return;
  const badge=document.getElementById('badge-'+sid);
  if(badge){badge.textContent='●';badge.style.display='';}
}

// ── Auto-decision countdown ──────────────────────────────────────────────────
function clearTimer(sid){
  if(timers[sid]){
    clearInterval(timers[sid].iv);
    clearTimeout(timers[sid].to);
    document.getElementById('cd-'+sid)?.remove();
    delete timers[sid];
  }
}

function getDefaultAction(data){
  const tn=data.toolName, td=data.toolData||{};
  if(tn==='Request_Approval') return {text:'✅ Approved. Proceed with the action.',label:'Approve'};
  if(tn==='Gate_Close'||tn==='Gate_Checkpoint'||tn==='Gate_Start'){
    const ns=td.next_suggestion;
    return ns
      ?{text:'Excellent. Please proceed with: '+ns,label:'Proceed'}
      :{text:tn==='Gate_Close'?'Turn closed and report accepted.':'Proceeding with the next step.',label:tn==='Gate_Close'?'Accept':'Proceed'};
  }
  if(tn==='Ask_Oracle') return {text:'Proceed with the most likely solution.',label:'Try best'};
  if(tn==='Ask_Multiple_Choice'&&td.options?.length){
    const rec=td.options.find(o=>o.id===td.recommendation)||td.options[0];
    return {text:'I select option '+rec.id+': '+rec.title,label:rec.title};
  }
  return null; // Gate_Blocked and unknowns: no auto-decision
}

function startTimer(sid, secs, actionText, label, bubble, reqId){
  clearTimer(sid);
  const card=bubble.querySelector('.tool-card');
  if(!card) return;
  const cdId='cd-'+sid;
  const cdBarId='cd-bar-'+sid;
  const cdTxtId='cd-txt-'+sid;
  const cd=document.createElement('div');
  cd.id=cdId;
  cd.className='countdown';
  cd.innerHTML=\`<div class="countdown-track"><div class="countdown-bar" id="\${esc(cdBarId)}" style="width:100%"></div></div>
    <div style="display:flex;align-items:center;gap:8px">
      <div class="countdown-label" id="\${esc(cdTxtId)}" style="flex:1">\${secs}s — auto: <strong>\${esc(label)}</strong></div>
      <button onclick="clearTimer('\${esc(sid)}')" style="background:transparent;border:1px solid var(--border);border-radius:4px;color:var(--muted);font-size:10px;padding:2px 8px;cursor:pointer;flex-shrink:0;font-family:inherit">✕ Cancel</button>
    </div>\`;
  card.appendChild(cd);
  let rem=secs;
  timers[sid]={
    iv:setInterval(()=>{
      rem--;
      if(rem<=0){clearTimer(sid);return;}
      const bar=document.getElementById(cdBarId);
      const txt=document.getElementById(cdTxtId);
      if(bar) bar.style.width=(rem/secs*100)+'%';
      if(txt) txt.innerHTML=rem+'s — auto: <strong>'+esc(label)+'</strong>';
    },1000),
    to:setTimeout(()=>{
      const chips=bubble.querySelectorAll('[data-r]');
      const match=Array.from(chips).find(el=>el.dataset.r===actionText);
      const target=match||chips[0];
      if(target&&!target.disabled) chipClick(sid,reqId,actionText,target,bubble);
    },secs*1000)
  };
}

// ── Load history ──────────────────────────────────────────────────────────────
async function loadSession(sid){
  try{
    const r = await fetch('/sessions/'+sid+'/messages');
    const d = await r.json();
    const c = document.getElementById('messages-'+sid);
    if(!c) return;
    c.innerHTML='';
    const sr = await fetch('/sessions/'+sid+'/state');
    const st = await sr.json();
    // Skip the pending request message from history — it will be rendered as an interactive
    // tool bubble below, so rendering it as a plain message first would duplicate it.
    const pendingId = st.latestPendingRequest?.requestId;
    (d.messages||[]).forEach(m=>{
      if(!pendingId||m.id!==pendingId) addMsg(sid,m.sender,m.content,m.source,m.timestamp);
    });
    if(st.latestPendingRequest){
      const req=st.latestPendingRequest;
      handleStateChange({state:'waiting_for_response',sessionId:sid,requestId:req.requestId,toolName:req.toolName,toolData:req,message:req.message||req.question||req.summary||req.problem_description});
    }
    if(c.children.length===0) c.innerHTML='<div class="empty-state">No messages yet. The agent will speak first.</div>';
  }catch(e){console.error('loadSession',e);}
}

async function loadAll(){ for(const s of __S__) await loadSession(s.id); }

// ── Session discovery ─────────────────────────────────────────────────────────
// Fetches the live session list from the server and adds any sessions that are
// not yet in __S__ (e.g. sessions registered before the page loaded, or sessions
// that registered while the SSE connection was down).
async function discoverSessions(){
  try{
    const r=await fetch('/sessions');
    const d=await r.json();
    for(const s of (d.sessions||[])){
      if(!__S__.find(x=>x.id===s.id)) addSessionToUI(s.id,s.name,s.quickReplyOptions||null);
    }
  }catch(e){}
}

// ── SSE ────────────────────────────────────────────────────────────────────────
function connStatus(ok){
  const dot=document.getElementById('connDot');
  const lbl=document.getElementById('connLabel');
  if(dot) dot.className='conn-dot '+(ok?'online':'offline');
  if(lbl) lbl.textContent=ok?'Connected':'Reconnecting…';
}

function setupSSE(){
  if(sseObj){try{sseObj.close();}catch(e){}}
  sseObj = new EventSource('/mcp?clientType=web');
  sseObj.onopen=()=>{reconnect=0;connStatus(true);discoverSessions().then(()=>loadAll());};
  sseObj.onmessage=e=>{
    try{dispatch(JSON.parse(e.data));}catch(err){console.error(err);}
  };
  sseObj.onerror=()=>{
    sseObj.close();connStatus(false);
    const d=Math.min(1000*Math.pow(2,reconnect),30000);
    reconnect++;
    if(reconnTO) clearTimeout(reconnTO);
    reconnTO=setTimeout(setupSSE,d);
  };
}

function dispatch(env){
  const t=env.type, d=env.data;
  if(t==='heartbeat'||t==='connection') return;
  if(t==='chat_message'){
    const sid=d?.sessionId??env.sessionId;
    const msg=d?.message??env.message;
    if(sid&&msg){addMsg(sid,msg.sender,msg.content,msg.source,msg.timestamp);notifyTab(sid);}
  }else if(t==='request-state-change'){
    handleStateChange(d||env);
  }else if(t==='session-registered'){
    addSessionToUI(d.sessionId,d.title,d.quickReplyOptions);
  }else if(t==='session-unregistered'){
    removeSessionFromUI(d.sessionId);
  }else if(t==='session-name-changed'){
    const nav=document.querySelector('[data-session="'+d.sessionId+'"] .nav-label');
    if(nav) nav.textContent=d.name;
    const hdr=document.querySelector('#panel-session-'+d.sessionId+' .chat-title');
    if(hdr) hdr.textContent=d.name;
    const s=__S__.find(s=>s.id===d.sessionId);
    if(s) s.title=d.name;
  }else if(t==='proxy-log'){
    if(activePnl==='proxy-logs') addProxyLog(d,true);
  }else if(t==='proxy-log-update'){
    updateProxyLog(d);
  }
}

// ── Proxy logs ─────────────────────────────────────────────────────────────────
async function loadProxyLogs(){
  try{
    const r=await fetch('/proxy/logs');
    const data=await r.json();
    const logs=data.logs||data;
    const c=document.getElementById('proxy-logs');
    c.innerHTML='';
    if(!logs.length){c.innerHTML='<div class="empty-state">No proxy logs yet. Enable the proxy to capture traffic.</div>';return;}
    logs.forEach(l=>addProxyLog(l,false));
  }catch(e){console.error(e);}
}

function addProxyLog(entry,prepend){
  window._pldc[entry.id]=entry;
  const c=document.getElementById('proxy-logs');
  if(!c) return;
  c.querySelector('.empty-state')?.remove();
  const ok=entry.responseStatus>=200&&entry.responseStatus<300;
  const method=entry.method||'GET';
  const badge=entry.ruleApplied?'<span class="log-badge">Rule</span>':'';
  const div=document.createElement('div');
  div.className='log-entry'+(entry.ruleApplied?' modified':'');
  div.dataset.logId=entry.id;
  div.innerHTML=\`
    <div class="log-summary" onclick="toggleLog('\${entry.id}')">
      <span class="log-method \${method}">\${esc(method)}</span>
      \${badge}
      <span class="log-url">\${esc(entry.url||'')}</span>
      <span class="log-status \${entry.responseStatus?(ok?'ok':'err'):'pending'}">\${entry.responseStatus||'…'}</span>
      <span class="log-time">\${entry.timestamp?new Date(entry.timestamp).toLocaleTimeString():''}</span>
      \${entry.duration?'<span class="log-time">'+entry.duration+'ms</span>':''}
    </div>
    <div class="log-details" id="ld-\${entry.id}">
      <div class="log-actions">
        <button class="btn" onclick="copyLog('\${entry.id}')">📋 Copy JSON</button>
        <button class="btn" onclick="ruleFromLog('\${entry.id}')">🎯 Create Rule</button>
      </div>
      <div class="log-section"><h4>Request Body</h4><pre>\${esc(fmt(entry.requestBodyModified??entry.requestBody))}</pre></div>
      <div class="log-section"><h4>Response Body</h4><pre>\${esc(fmt(entry.responseBody))}</pre></div>
    </div>\`;
  applyFilter(div,entry);
  if(prepend&&c.firstChild) c.insertBefore(div,c.firstChild); else c.appendChild(div);
  while(c.children.length>200) c.removeChild(c.lastChild);
}

function updateProxyLog(entry){
  window._pldc[entry.id]=entry;
  const div=document.querySelector('[data-log-id="'+entry.id+'"]');
  if(!div) return;
  const status=div.querySelector('.log-status');
  if(status){
    const ok=entry.responseStatus>=200&&entry.responseStatus<300;
    status.className='log-status '+(entry.responseStatus?(ok?'ok':'err'):'pending');
    status.textContent=entry.responseStatus||'…';
  }
  const pres=document.querySelectorAll('#ld-'+entry.id+' pre');
  if(pres[0]) pres[0].textContent=fmt(entry.requestBodyModified??entry.requestBody);
  if(pres[1]) pres[1].textContent=fmt(entry.responseBody);
}

function toggleLog(id){
  const d=document.getElementById('ld-'+id);
  if(d) d.style.display=d.style.display==='block'?'none':'block';
}

function clearProxyLogs(){
  fetch('/proxy/clear-logs',{method:'POST'}).then(()=>{
    document.getElementById('proxy-logs').innerHTML='<div class="empty-state">Logs cleared.</div>';
  });
}

function toggleModifiedFilter(){
  const on=document.getElementById('filter-modified').checked;
  document.querySelectorAll('.log-entry').forEach(el=>{
    el.style.display=(on&&!el.classList.contains('modified'))?'none':'';
  });
}

function applyFilter(el,entry){
  const cb=document.getElementById('filter-modified');
  if(cb&&cb.checked&&!entry.ruleApplied) el.style.display='none';
}

async function copyLog(id){
  const e=window._pldc[id];
  if(!e) return;
  try{await navigator.clipboard.writeText(JSON.stringify(e,null,2));}
  catch(err){alert(JSON.stringify(e,null,2));}
}

function ruleFromLog(id){
  const e=window._pldc[id];
  if(!e) return;
  document.getElementById('r-pattern').value=e.url?e.url.replace(/[.*+?^{}()|$[\\]\\\\]/g,'\\\\\\\\$&'):'';
  showAddForm();
  switchTo('proxy-rules');
}

// ── Proxy rules ────────────────────────────────────────────────────────────────
async function loadRules(){
  try{
    const r=await fetch('/proxy/rules');
    const rules=await r.json();
    const c=document.getElementById('rules-list');
    if(!Array.isArray(rules)||!rules.length){c.innerHTML='<div class="empty-state">No rules yet.</div>';return;}
    c.innerHTML=rules.map(rule=>\`
      <div class="rule-card\${rule.enabled===false?' disabled':''}" id="rc-\${esc(rule.id)}">
        <div class="rule-info">
          <div class="rule-name">\${esc(rule.name||rule.id)}</div>
          <div class="rule-pattern">\${esc(rule.urlPattern||'')}</div>
        </div>
        <div class="rule-btns">
          <button class="btn" onclick="toggleRule('\${esc(rule.id)}',\${!rule.enabled})">\${rule.enabled===false?'Enable':'Disable'}</button>
          <button class="btn danger" onclick="deleteRule('\${esc(rule.id)}')">Delete</button>
        </div>
      </div>\`).join('');
  }catch(e){console.error(e);}
}

async function toggleRule(id,enabled){
  await fetch('/proxy/rules/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled})});
  loadRules();
}

async function deleteRule(id){
  if(!confirm('Delete this rule?')) return;
  await fetch('/proxy/rules/'+id,{method:'DELETE'});
  loadRules();
}

function showAddForm(){document.getElementById('add-form').classList.add('open');}
function hideAddForm(){
  document.getElementById('add-form').classList.remove('open');
  ['r-name','r-pattern','r-redirect','r-jsonata','r-sid'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('r-drop-status').value='204';
  document.getElementById('r-enabled').checked=true;
  document.getElementById('r-drop').checked=false;
}

async function saveRule(){
  const pattern=document.getElementById('r-pattern').value.trim();
  if(!pattern){alert('URL Pattern is required.');return;}
  const rule={
    name:document.getElementById('r-name').value.trim(),
    urlPattern:pattern,
    redirectTo:document.getElementById('r-redirect').value.trim()||undefined,
    jsonataExpression:document.getElementById('r-jsonata').value.trim()||undefined,
    scope:document.getElementById('r-scope').value,
    sessionId:document.getElementById('r-sid').value.trim()||undefined,
    enabled:document.getElementById('r-enabled').checked,
    dropRequest:document.getElementById('r-drop').checked,
    dropStatus:document.getElementById('r-drop').checked?parseInt(document.getElementById('r-drop-status').value)||204:undefined
  };
  try{
    await fetch('/proxy/rules',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(rule)});
    hideAddForm();loadRules();
  }catch(e){alert('Error: '+e.message);}
}

// ── Debug logs ─────────────────────────────────────────────────────────────────
async function loadDebug(){
  try{
    const r=await fetch('/proxy/logs');
    const d=await r.json();
    const logs=d.debugLogs||[];
    if(logs.length===debugSeen) return;
    const newLogs=logs.slice(debugSeen);
    debugSeen=logs.length;
    const c=document.getElementById('debug-logs');
    c.querySelector('.empty-state')?.remove();
    const filter=(document.getElementById('debug-filter')?.value||'').toLowerCase();
    newLogs.forEach(e=>{
      if(filter&&!String(e.message||'').toLowerCase().includes(filter)) return;
      const div=document.createElement('div');
      div.className='debug-log';
      const lvl=(e.level||'').toLowerCase();
      div.innerHTML=\`<span class="debug-ts">\${e.timestamp?new Date(e.timestamp).toLocaleTimeString():''}</span><span class="debug-msg lvl-\${esc(lvl)}">\${esc(String(e.message||''))}</span>\`;
      c.appendChild(div);
    });
    c.scrollTop=c.scrollHeight;
  }catch(e){}
}

function applyDebugFilter(){debugSeen=0;document.getElementById('debug-logs').innerHTML='<div class="empty-state">Loading…</div>';loadDebug();}
function clearDebug(){debugSeen=0;document.getElementById('debug-logs').innerHTML='<div class="empty-state">Cleared.</div>';}
function startDebugPoll(){if(!debugPoll)debugPoll=setInterval(loadDebug,2000);loadDebug();}
function stopDebugPoll(){if(debugPoll){clearInterval(debugPoll);debugPoll=null;}}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init(){
  await discoverSessions(); // Discover sessions registered before this page loaded
  await loadAll();
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
