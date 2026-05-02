import { AppState, RequestStateChange } from './types';
import { UIManager } from './ui';

declare const marked: any;

const TOOL_ICONS: Record<string, string> = {
  Gate_Start: '🎯',
  Gate_Checkpoint: '📊',
  Gate_Close: '🏁',
  Gate_Blocked: '🚫',
  Request_Approval: '🔐',
  Ask_Oracle: '🔮',
  Ask_Multiple_Choice: '🔀',
  Ask_Human_Expert: '💬',
};

export class ToolManager {
  private timedDecisionInterval: any = null;
  private timedDecisionTimeout: any = null;
  private activeBubbleId: string | null = null;

  constructor(private state: AppState, private ui: UIManager) {}

  public handleRequestStateChange(data: RequestStateChange) {
    if (data.state === 'waiting_for_response') {
      this.state.currentPendingRequestId = data.requestId;

      document.querySelector('.waiting-indicator')?.remove();

      const bubble = this.renderToolBubble(data);
      this.activeBubbleId = 'tool-bubble-' + data.requestId;

      this.ui.setControlsEnabled(true);
      this.repopulateQuickReplies();
      this.ui.playNotificationBeep();
      this.evaluateAutoDecisionPolicy(data, bubble);
    } else {
      this.state.currentPendingRequestId = null;
      this.ui.setControlsEnabled(false);
      this.clearTimedDecisionTimer();
      const chipsContainer = document.getElementById('chipsContainer');
      if (chipsContainer) chipsContainer.innerHTML = '';
    }
  }

  private renderToolBubble(data: RequestStateChange): HTMLElement {
    const container = document.getElementById('messages');
    if (!container) return document.createElement('div');

    container.querySelector('.empty-state')?.remove();

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const icon = TOOL_ICONS[data.toolName || ''] || '🔧';
    const toolNameLabel = (data.toolName || 'Tool Request').replace(/_/g, ' ');

    let toolMsg = data.message || (data.toolData as any)?.message || (data.toolData as any)?.question
      || (data.toolData as any)?.summary || (data.toolData as any)?.problem_description || '';

    if (!toolMsg && data.toolName === 'Request_Approval' && data.toolData) {
      const td = data.toolData as any;
      toolMsg = `**Action:** ${td.action_type}\n\n**Impact:** ${td.impact}\n\n**Justification:** ${td.justification}`;
    }

    let parsedMsg = '';
    try {
      if (toolMsg) parsedMsg = marked.parse(toolMsg.trim());
    } catch {
      parsedMsg = this.ui.escapeHtml(toolMsg).replace(/\n/g, '<br>');
    }

    const gateReport = this.buildGateReport(data);
    const actionsHtml = this.buildActionsHtml(data);
    const isMultipleChoice = data.toolName === 'Ask_Multiple_Choice' && (data.toolData as any)?.options;

    const row = document.createElement('div');
    row.className = 'message-row agent tool-bubble';
    row.id = 'tool-bubble-' + data.requestId;

    row.innerHTML = `
      <div class="message-info">
        <span class="sender">${icon} ${this.ui.escapeHtml(toolNameLabel)}</span>
        <span class="timestamp">${time}</span>
      </div>
      <div class="message-bubble">
        ${parsedMsg ? `<div class="message-content">${parsedMsg}</div>` : ''}
        ${gateReport}
        ${actionsHtml ? `<div class="tool-chips${isMultipleChoice ? ' multiple-choice-container' : ''}">${actionsHtml}</div>` : ''}
      </div>
    `;

    container.appendChild(row);
    container.scrollTop = container.scrollHeight;

    this.attachBubbleEvents(row, data);
    return row;
  }

  private buildGateReport(data: RequestStateChange): string {
    const td = data.toolData as any;
    if (!td) return '';
    const e = (s: string) => this.ui.escapeHtml(String(s ?? ''));
    let html = '';

    // Final state banner for Gate_Close
    if (data.toolName === 'Gate_Close' && td.final_state) {
      const states: Record<string, [string, string]> = {
        completed: ['✅', 'gate-completed'],
        partial: ['⚠️', 'gate-partial'],
        blocked: ['🚫', 'gate-blocked'],
      };
      const [icon, cls] = states[td.final_state] || ['📋', ''];
      const label = td.final_state.charAt(0).toUpperCase() + td.final_state.slice(1);
      html += `<div class="gate-state ${cls}">${icon} ${e(label)}</div>`;
    }

    // Requirements grid
    const reqs: Array<{requirement_id: string; status: string; evidence_ref?: string}> =
      td.requirement_coverage || (data.toolName === 'Gate_Checkpoint' ? td.requirement_delta : null) || [];
    if (reqs.length) {
      const covered = reqs.filter(r => r.status === 'covered').length;
      const sectionTitle = data.toolName === 'Gate_Checkpoint' ? 'Progress' : 'Requirements';
      html += `<div class="gate-section">
        <div class="gate-section-hdr">${sectionTitle} <span class="gate-badge">${covered}/${reqs.length}</span></div>
        <div class="gate-req-list">`;
      for (const r of reqs) {
        const icon = r.status === 'covered' ? '✅' : r.status === 'partial' ? '⚠️' : (data.toolName === 'Gate_Checkpoint' ? '🔄' : '❌');
        html += `<div class="gate-req-row">${icon} <code>${e(r.requirement_id)}</code>`;
        if (r.evidence_ref) html += ` <span class="gate-evidence">${e(r.evidence_ref)}</span>`;
        html += `</div>`;
      }
      html += `</div></div>`;
    }

    // Expected requirements for Gate_Start
    if (data.toolName === 'Gate_Start' && td.expected_requirements?.length) {
      html += `<div class="gate-section">
        <div class="gate-section-hdr">Expected Requirements <span class="gate-badge">${td.expected_requirements.length}</span></div>
        <div class="gate-req-list">`;
      for (const r of td.expected_requirements as string[]) {
        html += `<div class="gate-req-row">📋 <code>${e(r)}</code></div>`;
      }
      html += `</div></div>`;
    }

    // Validations
    const vals: Array<{check_id: string; result: string; details?: string}> = td.validations || [];
    if (vals.length) {
      const passed = vals.filter(v => v.result === 'pass').length;
      html += `<div class="gate-section">
        <div class="gate-section-hdr">Validations <span class="gate-badge">${passed}/${vals.length}</span></div>`;
      for (const v of vals) {
        const icon = v.result === 'pass' ? '✅' : v.result === 'warn' ? '⚠️' : '❌';
        html += `<div class="gate-req-row">${icon} <code>${e(v.check_id)}</code>`;
        if (v.details) html += ` <span class="gate-evidence">${e(v.details)}</span>`;
        html += `</div>`;
      }
      html += `</div>`;
    }

    // Blocker card (Gate_Blocked or Gate_Close with blocked final_state)
    const b = td.blocker_details || (td.final_state === 'blocked' ? td.blocker : null);
    if (b) {
      html += `<div class="gate-blocker">
        <div class="gate-blocker-hdr">🚫 ${e(b.severity?.toUpperCase() || 'BLOCKED')}</div>
        ${b.description ? `<div class="gate-blocker-desc">${e(b.description)}</div>` : ''}
        ${b.needed_input ? `<div class="gate-blocker-meta">💡 <strong>Needed:</strong> ${e(b.needed_input)}</div>` : ''}
        ${b.next_unblock_step ? `<div class="gate-blocker-meta">👣 <strong>Next:</strong> ${e(b.next_unblock_step)}</div>` : ''}
      </div>`;
    }

    return html;
  }

  private buildActionsHtml(data: RequestStateChange): string {
    const e = (s: string) => this.ui.escapeHtml(s);

    if (data.toolName === 'Request_Approval') {
      return `
        <button class="chip primary" data-response="✅ Approved. Proceed with the action.">✅ Approve</button>
        <button class="chip" data-response="❌ Denied. Please do not proceed.">❌ Deny</button>
        <button class="chip" data-response="Approve, but with modifications: ">📝 Approve with changes</button>
      `;
    }

    if (data.toolName === 'Gate_Close' || data.toolName === 'Gate_Checkpoint' || data.toolName === 'Gate_Start') {
      const td = data.toolData as any;
      const nextSug = td?.next_suggestion as string | undefined;
      const nextBtnLabel = nextSug
        ? `✅ Proceed: ${nextSug.length > 30 ? nextSug.substring(0, 27) + '...' : nextSug}`
        : (data.toolName === 'Gate_Close' ? '🏁 Close Turn' : '⏭️ Proceed');
      const nextBtnResponse = nextSug ? `Excellent. Please proceed with: ${nextSug}` : (data.toolName === 'Gate_Close' ? 'Turn closed and report accepted.' : 'Proceeding with the next step.');

      return `
        <button class="chip primary" data-response="${e(nextBtnResponse)}">${e(nextBtnLabel)}</button>
        <button class="chip" data-response="Review the recent changes and refactor for better architecture and consistency.">🧹 Refactor</button>
        <button class="chip" data-response="Check test coverage for the recent changes and add missing tests.">🧪 Add tests</button>
        <button class="chip" data-response="Review the UI/UX. Suggest and implement improvements or UI delight.">✨ Polish UX</button>
        <button class="chip" data-response="Here is your next task: ">📋 Assign task...</button>
        ${data.toolName === 'Gate_Close' ? '<button class="chip" data-response="I am not satisfied with the results. Please fix: ">❌ Needs work</button>' : ''}
      `;
    }

    if (data.toolName === 'Gate_Blocked') {
      return `
        <button class="chip primary" data-response="I will help you unblock this. Please provide: ">🙋 Provide info</button>
        <button class="chip" data-response="Try a different approach that doesn't depend on this blocker: ">🔄 Change approach</button>
        <button class="chip" data-response="Ignore this blocker for now and focus on other tasks.">⏭️ Ignore &amp; skip</button>
      `;
    }

    if (data.toolName === 'Ask_Oracle') {
      return `
        <button class="chip primary" data-response="Proceed with the most likely solution.">✅ Try best solution</button>
        <button class="chip" data-response="Ignore this error and continue.">⏭️ Ignore &amp; continue</button>
        <button class="chip" data-response="Try a different approach: ">🔄 Try instead...</button>
        <button class="chip" data-response="I have fixed the issue manually. Please proceed.">🛠️ Fixed manually</button>
      `;
    }

    if (data.toolName === 'Ask_Multiple_Choice' && (data.toolData as any)?.options) {
      const td = data.toolData as any;
      const recId = td.recommendation;
      return td.options.map((opt: any) => {
        const isRec = opt.id === recId;
        return `
          <button class="option-card${isRec ? ' recommended' : ''}" data-response="${e(`I select option ${opt.id}: ${opt.title}`)}">
            <div class="option-card-title">
              <span>${e(opt.id)}. ${e(opt.title)}</span>
              ${isRec ? '<span class="rec-badge">Recommended</span>' : ''}
            </div>
            ${opt.description ? `<div class="option-card-desc">${e(opt.description)}</div>` : ''}
          </button>
        `;
      }).join('');
    }

    // Default: quick-reply options
    return this.state.quickReplyOptions.map((opt, i) =>
      `<button class="chip ${i === 0 ? 'primary' : ''}" data-response="${e(opt)}">${e(opt)}</button>`
    ).join('');
  }

  private attachBubbleEvents(bubble: HTMLElement, data: RequestStateChange) {
    bubble.querySelectorAll<HTMLButtonElement>('[data-response]').forEach(el => {
      el.addEventListener('click', () => {
        this.sendBubbleChip(el.dataset.response || '', data.requestId, el, bubble);
      });
    });
  }

  private sendBubbleChip(text: string, requestId: string, clickedChip: HTMLElement, bubble: HTMLElement) {
    bubble.querySelectorAll<HTMLButtonElement>('[data-response]').forEach(el => { el.disabled = true; });
    clickedChip.classList.add('selected');
    bubble.classList.add('responded');
    this.clearTimedDecisionTimer();

    // Editable chips (text ends with ': ') should be completed by the user before sending.
    if (text.trimEnd().endsWith(':')) {
      const input = document.getElementById('messageInput') as HTMLTextAreaElement;
      if (input) {
        input.value = text;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
      this.ui.setControlsEnabled(true);
      return;
    }

    // Non-editable chips: send directly without touching the textarea.
    this.ui.sendMessageContent(text);
  }

  private repopulateQuickReplies() {
    const chipsContainer = document.getElementById('chipsContainer');
    if (!chipsContainer) return;

    chipsContainer.innerHTML = this.state.quickReplyOptions
      .map((opt, i) =>
        `<button class="chip ${i === 0 ? 'primary' : ''}" data-response="${this.ui.escapeHtml(opt)}">${this.ui.escapeHtml(opt)}</button>`
      ).join('');

    chipsContainer.querySelectorAll<HTMLButtonElement>('[data-response]').forEach(el => {
      el.addEventListener('click', () => {
        const text = el.dataset.response || '';
        if (text.trimEnd().endsWith(':')) {
          const input = document.getElementById('messageInput') as HTMLTextAreaElement;
          if (input) { input.value = text; input.focus(); }
          return;
        }
        this.ui.sendMessageContent(text);
        this.clearTimedDecisionTimer();
      });
    });
  }

  public clearTimedDecisionTimer() {
    if (this.timedDecisionInterval) clearInterval(this.timedDecisionInterval);
    if (this.timedDecisionTimeout) clearTimeout(this.timedDecisionTimeout);
    this.timedDecisionInterval = null;
    this.timedDecisionTimeout = null;
    document.getElementById('countdownWrapper')?.remove();
  }

  private evaluateAutoDecisionPolicy(data: RequestStateChange, bubble: HTMLElement) {
    if (this.state.autoDecisionPolicy === 'manual') return;

    const defaultAction = this.getDefaultActionForTool(data);
    if (!defaultAction) return;

    if (this.state.autoDecisionPolicy === 'instant') {
      const chip = bubble.querySelector<HTMLButtonElement>(`[data-response="${this.ui.escapeHtml(defaultAction.text)}"]`);
      if (chip) chip.click();
      else {
        this.sendBubbleChip(defaultAction.text, data.requestId,
          bubble.querySelector<HTMLButtonElement>('[data-response]') || document.createElement('button'), bubble);
      }
    } else if (this.state.autoDecisionPolicy === 'timed') {
      this.startTimedDecisionCountdown(this.state.autoDecisionTimeout || 120, defaultAction.text, defaultAction.label, bubble, data.requestId);
    }
  }

  private getDefaultActionForTool(data: RequestStateChange): { text: string, label: string } | null {
    if (data.toolName === 'Request_Approval') {
      return { text: '✅ Approved. Proceed with the action.', label: 'Approve' };
    } else if (data.toolName === 'Gate_Close' || data.toolName === 'Gate_Checkpoint' || data.toolName === 'Gate_Start') {
      const td = data.toolData as any;
      const nextSug = td?.next_suggestion as string | undefined;
      const actionText = nextSug ? `Excellent. Please proceed with: ${nextSug}` : (data.toolName === 'Gate_Close' ? 'Turn closed and report accepted.' : 'Proceeding with the next step.');
      return { text: actionText, label: nextSug ? 'Proceed' : (data.toolName === 'Gate_Close' ? 'Accept Report' : 'Proceed') };
    } else if (data.toolName === 'Gate_Blocked') {
      return null;
    } else if (data.toolName === 'Ask_Oracle') {
      return { text: 'Proceed with the most likely solution.', label: 'Try Best Solution' };
    } else if (data.toolName === 'Ask_Multiple_Choice' && (data.toolData as any)?.options) {
      const td = data.toolData as any;
      const recId = td.recommendation;
      const recOpt = td.options.find((o: any) => o.id === recId) || td.options[0];
      return { text: `I select option ${recOpt.id}: ${recOpt.title}`, label: recOpt.title };
    } else if (this.state.quickReplyOptions.length > 0) {
      return { text: this.state.quickReplyOptions[0], label: this.state.quickReplyOptions[0] };
    }
    return null;
  }

  private startTimedDecisionCountdown(timeoutSeconds: number, defaultActionText: string, label: string, bubble: HTMLElement, requestId: string) {
    this.clearTimedDecisionTimer();

    const messageBubble = bubble.querySelector('.message-bubble');
    if (!messageBubble) return;

    const countdownWrapper = document.createElement('div');
    countdownWrapper.id = 'countdownWrapper';
    countdownWrapper.innerHTML = `
      <div class="countdown-bar-container">
        <div class="countdown-bar" id="countdownBar" style="width:100%"></div>
      </div>
      <div class="countdown-row">
        <div class="countdown-text" id="countdownText">${timeoutSeconds}s — auto: <strong>${this.ui.escapeHtml(label)}</strong></div>
        <button class="cancel-timer-btn" id="cancelTimerBtn" title="Cancel auto-reply and decide manually">✕ Cancel</button>
      </div>
    `;
    messageBubble.appendChild(countdownWrapper);

    document.getElementById('cancelTimerBtn')?.addEventListener('click', () => {
      this.clearTimedDecisionTimer();
      this.state.autoDecisionPolicy = 'manual';
      const sel = document.getElementById('policySelector') as HTMLSelectElement;
      if (sel) sel.value = 'manual';
    });

    let remaining = timeoutSeconds;

    this.timedDecisionInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        this.clearTimedDecisionTimer();
        return;
      }
      const bar = document.getElementById('countdownBar');
      const text = document.getElementById('countdownText');
      if (bar) bar.style.width = (remaining / timeoutSeconds) * 100 + '%';
      if (text) text.innerHTML = `${remaining}s — auto: <strong>${this.ui.escapeHtml(label)}</strong>`;
    }, 1000);

    this.timedDecisionTimeout = setTimeout(() => {
      const matchingChip = Array.from(bubble.querySelectorAll<HTMLButtonElement>('[data-response]'))
        .find(el => el.dataset.response === defaultActionText);
      const target = matchingChip || bubble.querySelector<HTMLButtonElement>('[data-response]');
      if (target && !target.disabled) {
        this.sendBubbleChip(defaultActionText, requestId, target, bubble);
      }
    }, timeoutSeconds * 1000);
  }
}
