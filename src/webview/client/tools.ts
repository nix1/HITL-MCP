import { AppState, RequestStateChange } from './types';
import { UIManager } from './ui';

declare const marked: any;

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

    const empty = container.querySelector('.empty-state');
    if (empty) empty.remove();

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

    const actionsHtml = this.buildActionsHtml(data);
    const isMultipleChoice = data.toolName === 'Ask_Multiple_Choice' && (data.toolData as any)?.options;

    const row = document.createElement('div');
    row.className = 'message-row agent tool-bubble';
    row.id = 'tool-bubble-' + data.requestId;

    row.innerHTML = `
      <div class="message-info">
        <span class="sender">Tool: ${this.ui.escapeHtml(toolNameLabel)}</span>
        <span class="timestamp">${time}</span>
      </div>
      <div class="message-bubble">
        <div class="tool-context-header">
          <div class="tool-badge">${this.ui.escapeHtml(toolNameLabel)}</div>
          ${parsedMsg}
        </div>
        <div class="tool-chips${isMultipleChoice ? ' multiple-choice-container' : ''}">
          ${actionsHtml}
        </div>
      </div>
    `;

    container.appendChild(row);
    container.scrollTop = container.scrollHeight;

    this.attachBubbleEvents(row, data);
    return row;
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

    if (data.toolName === 'Report_Completion') {
      const td = data.toolData as any;
      const nextSug = td?.next_suggestion as string | undefined;
      const nextBtnLabel = nextSug
        ? `✅ Proceed: ${nextSug.length > 30 ? nextSug.substring(0, 27) + '...' : nextSug}`
        : '⏭️ Next step';
      const nextBtnResponse = nextSug ? `Excellent. Please proceed with: ${nextSug}` : 'Great work! Proceed to the next logical step.';
      return `
        <button class="chip primary" data-response="${e(nextBtnResponse)}">${e(nextBtnLabel)}</button>
        <button class="chip" data-response="Review the recent changes and refactor for better architecture and consistency.">🧹 Refactor</button>
        <button class="chip" data-response="Check test coverage for the recent changes and add missing tests.">🧪 Add tests</button>
        <button class="chip" data-response="Review the UI/UX. Suggest and implement improvements or UI delight.">✨ Polish UX</button>
        <button class="chip" data-response="Here is your next task: ">📋 Assign task...</button>
        <button class="chip" data-response="All done. You may stop.">✅ All done</button>
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
    // Mark selected chip and disable all in bubble
    bubble.querySelectorAll<HTMLButtonElement>('[data-response]').forEach(el => {
      el.disabled = true;
    });
    clickedChip.classList.add('selected');
    bubble.classList.add('responded');

    // Fill textarea and send
    const input = document.getElementById('messageInput') as HTMLTextAreaElement;
    const currentText = input?.value.trim() || '';
    if (input) input.value = currentText ? text + ' ' + currentText : text;

    this.ui.sendMessage();
    this.clearTimedDecisionTimer();
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
        const input = document.getElementById('messageInput') as HTMLTextAreaElement;
        const current = input?.value.trim() || '';
        if (input) input.value = current ? (el.dataset.response || '') + ' ' + current : (el.dataset.response || '');
        this.ui.sendMessage();
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
        // fallback: send directly
        this.sendBubbleChip(defaultAction.text + ' (auto-selected instantly)', data.requestId,
          bubble.querySelector<HTMLButtonElement>('[data-response]') || document.createElement('button'), bubble);
      }
    } else if (this.state.autoDecisionPolicy === 'timed') {
      this.startTimedDecisionCountdown(this.state.autoDecisionTimeout || 120, defaultAction.text, defaultAction.label, bubble, data.requestId);
    }
  }

  private getDefaultActionForTool(data: RequestStateChange): { text: string, label: string } | null {
    if (data.toolName === 'Request_Approval') {
      return { text: '✅ Approved. Proceed with the action.', label: 'Approve' };
    } else if (data.toolName === 'Report_Completion') {
      return { text: 'Great work! Proceed to the next logical step.', label: 'Next Step' };
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
      <div class="countdown-text" id="countdownText">${timeoutSeconds}s — auto-selecting: <strong>${this.ui.escapeHtml(label)}</strong></div>
    `;
    messageBubble.appendChild(countdownWrapper);

    let remaining = timeoutSeconds;
    const bar = document.getElementById('countdownBar');
    const text = document.getElementById('countdownText');

    this.timedDecisionInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        this.clearTimedDecisionTimer();
        return;
      }
      if (bar) bar.style.width = (remaining / timeoutSeconds) * 100 + '%';
      if (text) text.innerHTML = `${remaining}s — auto-selecting: <strong>${this.ui.escapeHtml(label)}</strong>`;
    }, 1000);

    this.timedDecisionTimeout = setTimeout(() => {
      const chip = bubble.querySelector<HTMLButtonElement>(`[data-response]`);
      // Find chip matching the default action text
      const matchingChip = Array.from(bubble.querySelectorAll<HTMLButtonElement>('[data-response]'))
        .find(el => el.dataset.response === defaultActionText);
      const target = matchingChip || chip;
      if (target && !target.disabled) {
        this.sendBubbleChip(defaultActionText + ' (auto-selected after timeout)', requestId, target, bubble);
      }
    }, timeoutSeconds * 1000);
  }
}
