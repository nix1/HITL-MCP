import { AppState, RequestStateChange } from './types';
import { UIManager } from './ui';

// Declaring marked since it's loaded via CDN/script tag in HTML
declare const marked: any;

export class ToolManager {
  private timedDecisionInterval: any = null;
  private timedDecisionTimeout: any = null;

  constructor(private state: AppState, private ui: UIManager) {}

  public handleRequestStateChange(data: RequestStateChange) {
    if (data.state === 'waiting_for_response') {
      this.state.currentPendingRequestId = data.requestId;
      this.ui.setControlsEnabled(true);

      const oldIndicator = document.querySelector('.waiting-indicator');
      if (oldIndicator) oldIndicator.remove();

      const chipsContainer = document.getElementById('chipsContainer');
      if (chipsContainer) {
        chipsContainer.className = 'quick-replies-chips';
        this.renderChips(chipsContainer, data);
      }
      this.ui.playNotificationBeep();

      // Automatically trigger policy-based auto-decision
      this.evaluateAutoDecisionPolicy(data);
    } else {
      this.state.currentPendingRequestId = null;
      this.ui.setControlsEnabled(false);
      this.clearTimedDecisionTimer();
    }
  }

  private evaluateAutoDecisionPolicy(data: RequestStateChange) {
    if (this.state.autoDecisionPolicy === 'manual') return;

    // Find the default option for this tool
    const defaultAction = this.getDefaultActionForTool(data);
    if (!defaultAction) return;

    if (this.state.autoDecisionPolicy === 'instant') {
      this.sendChip(defaultAction.text + ' (auto-selected instantly)');
    } else if (this.state.autoDecisionPolicy === 'timed') {
      this.startTimedDecisionCountdown(
        this.state.autoDecisionTimeout || 120, 
        defaultAction.text, 
        defaultAction.label
      );
    }
  }

  private getDefaultActionForTool(data: RequestStateChange): { text: string, label: string } | null {
    if (data.toolName === 'Request_Approval') {
      return { text: '✅ Approved. Proceed with the action.', label: 'Approve' };
    } else if (data.toolName === 'Report_Completion') {
      return { text: 'Great work! Proceed to the next logical step.', label: 'Next Step' };
    } else if (data.toolName === 'Ask_Oracle') {
      return { text: 'Proceed with the most likely solution.', label: 'Try Best Solution' };
    } else if (data.toolName === 'Ask_Multiple_Choice' && data.toolData?.options) {
      const recId = data.toolData.recommendation;
      const recOpt = data.toolData.options.find((o: any) => o.id === recId) || data.toolData.options[0];
      return { text: `I select option ${recOpt.id}: ${recOpt.title}`, label: recOpt.title };
    } else if (this.state.quickReplyOptions.length > 0) {
      return { text: this.state.quickReplyOptions[0], label: this.state.quickReplyOptions[0] };
    }
    return null;
  }

  private renderChips(container: HTMLElement, data: RequestStateChange) {
    const toolNameBadge = `<div class="tool-badge">${this.ui.escapeHtml(data.toolName || 'Tool Request')}</div>`;
    
    let toolMsg = data.message || data.toolData?.message || data.toolData?.question || data.toolData?.summary || data.toolData?.problem_description || '';
    
    // Fallback if message is missing but we have Request_Approval data
    if (!toolMsg && data.toolName === 'Request_Approval' && data.toolData) {
      toolMsg = `**Action:** ${data.toolData.action_type}\n\n**Impact:** ${data.toolData.impact}\n\n**Justification:** ${data.toolData.justification}`;
    }

    // Use marked for rich formatting in the header
    let parsedMsg = '';
    try {
      if (toolMsg) {
        // Use parseInline for simpler rendering without <p> wraps if possible, 
        // or just parse and we'll fix the CSS
        parsedMsg = marked.parse(toolMsg);
      }
    } catch (e) {
      parsedMsg = this.ui.escapeHtml(toolMsg).replace(/\n/g, '<br>');
    }

    const msgHtml = `<div class="tool-context-header">${toolNameBadge}${parsedMsg}</div>`;

    if (data.toolName === 'Request_Approval') {
      container.innerHTML = msgHtml + `
        <button class="chip primary" id="btn-approve">✅ Approve</button>
        <button class="chip" id="btn-deny">❌ Deny</button>
        <button class="chip" id="btn-mod">📝 Approve with changes</button>
      `;
      this.attachChipEvents(container, {
        'btn-approve': '✅ Approved. Proceed with the action.',
        'btn-deny': '❌ Denied. Please do not proceed.',
        'btn-mod': 'Approve, but with modifications: '
      });
    } else if (data.toolName === 'Report_Completion') {
      const nextSug = data.toolData?.next_suggestion;
      const nextBtnLabel = nextSug ? `✅ Proceed: ${nextSug.length > 30 ? nextSug.substring(0, 27) + '...' : nextSug}` : '⏭️ Next step';
      const nextBtnResponse = nextSug ? `Excellent. Please proceed with: ${nextSug}` : 'Great work! Proceed to the next logical step.';

      container.innerHTML = msgHtml + `
        <button class="chip primary" id="btn-next">${this.ui.escapeHtml(nextBtnLabel)}</button>
        <button class="chip" id="btn-refactor">🧹 Refactor</button>
        <button class="chip" id="btn-tests">🧪 Add tests</button>
        <button class="chip" id="btn-ux">✨ Polish UX</button>
        <button class="chip" id="btn-assign">📋 Assign task...</button>
        <button class="chip" id="btn-done">✅ All done</button>
      `;
      this.attachChipEvents(container, {
        'btn-next': nextBtnResponse,
        'btn-refactor': 'Review the recent changes and refactor for better architecture and consistency.',
        'btn-tests': 'Check test coverage for the recent changes and add missing tests.',
        'btn-ux': 'Review the UI/UX. Suggest and implement improvements or UI delight.',
        'btn-assign': 'Here is your next task: ',
        'btn-done': 'All done. You may stop.'
      });
    } else if (data.toolName === 'Ask_Oracle') {
      container.innerHTML = msgHtml + `
        <button class="chip primary" id="btn-best">✅ Try best solution</button>
        <button class="chip" id="btn-ignore">⏭️ Ignore & continue</button>
        <button class="chip" id="btn-instead">🔄 Try instead...</button>
        <button class="chip" id="btn-fixed">🛠️ Fixed manually</button>
      `;
      this.attachChipEvents(container, {
        'btn-best': 'Proceed with the most likely solution.',
        'btn-ignore': 'Ignore this error and continue.',
        'btn-instead': 'Try a different approach: ',
        'btn-fixed': 'I have fixed the issue manually. Please proceed.'
      });
    } else if (data.toolName === 'Ask_Multiple_Choice' && data.toolData?.options) {
      container.className = 'multiple-choice-container';
      container.innerHTML = msgHtml;
      this.renderMultipleChoice(container, data, true);
    } else {
      container.innerHTML = msgHtml + this.getDefaultChipsHtml();
      this.attachDefaultChipEvents(container);
    }
  }

  private renderMultipleChoice(container: HTMLElement, data: RequestStateChange, append: boolean = false) {
    const recommendationId = data.toolData.recommendation;
    
    const cardsHtml = data.toolData.options.map((opt: any) => {
      const isRecommended = opt.id === recommendationId;
      const cardClass = isRecommended ? 'option-card recommended' : 'option-card';
      const badge = isRecommended ? '<span class="rec-badge">Recommended</span>' : '';
      return `
        <button class="${cardClass}" id="opt-${opt.id}">
          <div class="option-card-title">
            <span>${this.ui.escapeHtml(opt.id)}. ${this.ui.escapeHtml(opt.title)}</span>
            ${badge}
          </div>
          ${opt.description ? `<div class="option-card-desc">${this.ui.escapeHtml(opt.description)}</div>` : ''}
        </button>
      `;
    }).join('');

    if (append) {
      container.innerHTML += cardsHtml;
    } else {
      container.innerHTML = cardsHtml;
    }

    data.toolData.options.forEach((opt: any) => {
      const btn = document.getElementById(`opt-${opt.id}`);
      btn?.addEventListener('click', () => {
        this.sendChip(`I select option ${opt.id}: ${opt.title}`);
      });
    });
  }

  private attachChipEvents(container: HTMLElement, mapping: Record<string, string>) {
    Object.entries(mapping).forEach(([id, text]) => {
      const btn = document.getElementById(id);
      btn?.addEventListener('click', () => this.sendChip(text));
    });
  }

  private getDefaultChipsHtml() {
    return this.state.quickReplyOptions.map((option, index) =>
      `<button class="chip ${index === 0 ? 'primary' : ''}" id="default-chip-${index}">${this.ui.escapeHtml(option)}</button>`
    ).join('');
  }

  private attachDefaultChipEvents(container: HTMLElement) {
    this.state.quickReplyOptions.forEach((option, index) => {
      const btn = document.getElementById(`default-chip-${index}`);
      btn?.addEventListener('click', () => this.sendChip(option));
    });
  }

  private sendChip(text: string) {
    const input = document.getElementById('messageInput') as HTMLTextAreaElement;
    const currentText = input.value.trim();
    if (currentText !== '') {
      input.value = text + ' ' + currentText;
    } else {
      input.value = text;
    }
    this.ui.sendMessage();
    this.clearTimedDecisionTimer();
  }

  public clearTimedDecisionTimer() {
    if (this.timedDecisionInterval) clearInterval(this.timedDecisionInterval);
    if (this.timedDecisionTimeout) clearTimeout(this.timedDecisionTimeout);
    this.timedDecisionInterval = null;
    this.timedDecisionTimeout = null;
    document.getElementById('countdownWrapper')?.remove();
  }

  private startTimedDecisionCountdown(timeoutSeconds: number, defaultActionText: string, label: string) {
    this.clearTimedDecisionTimer();
    const chipsContainer = document.getElementById('chipsContainer');
    if (!chipsContainer) return;

    const countdownWrapper = document.createElement('div');
    countdownWrapper.id = 'countdownWrapper';
    countdownWrapper.innerHTML = `
      <div class="countdown-bar-container">
        <div class="countdown-bar" id="countdownBar" style="width:100%"></div>
      </div>
      <div class="countdown-text" id="countdownText">${timeoutSeconds}s — auto-selecting: <strong>${this.ui.escapeHtml(label)}</strong></div>
    `;
    chipsContainer.parentElement?.insertBefore(countdownWrapper, chipsContainer.nextSibling);

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
      this.sendChip(defaultActionText + ' (auto-selected after timeout)');
    }, timeoutSeconds * 1000);
  }
}
