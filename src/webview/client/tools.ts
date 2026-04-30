import { AppState, RequestStateChange } from './types';
import { UIManager } from './ui';

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
    } else {
      this.state.currentPendingRequestId = null;
      this.ui.setControlsEnabled(false);
      this.clearTimedDecisionTimer();
    }
  }

  private renderChips(container: HTMLElement, data: RequestStateChange) {
    if (data.toolName === 'Request_Approval') {
      container.innerHTML = `
        <button class="chip" style="background:var(--vscode-testing-iconPassed);color:white;font-weight:bold" id="btn-approve">✅ Approve</button>
        <button class="chip" style="background:var(--vscode-testing-iconFailed);color:white;font-weight:bold" id="btn-deny">❌ Deny</button>
        <button class="chip" id="btn-mod">📝 Approve with changes</button>
      `;
      this.attachChipEvents(container, {
        'btn-approve': '✅ Approved. Proceed with the action.',
        'btn-deny': '❌ Denied. Please do not proceed.',
        'btn-mod': 'Approve, but with modifications: '
      });
    } else if (data.toolName === 'Report_Completion') {
      container.innerHTML = `
        <button class="chip" id="btn-next">⏭️ Next step</button>
        <button class="chip" id="btn-refactor">🧹 Refactor</button>
        <button class="chip" id="btn-tests">🧪 Add tests</button>
        <button class="chip" id="btn-ux">✨ Polish UX</button>
        <button class="chip" id="btn-assign">📋 Assign task...</button>
        <button class="chip" id="btn-done">✅ All done</button>
      `;
      this.attachChipEvents(container, {
        'btn-next': 'Great work! Proceed to the next logical step.',
        'btn-refactor': 'Review the recent changes and refactor for better architecture and consistency.',
        'btn-tests': 'Check test coverage for the recent changes and add missing tests.',
        'btn-ux': 'Review the UI/UX. Suggest and implement improvements or UI delight.',
        'btn-assign': 'Here is your next task: ',
        'btn-done': 'All done. You may stop.'
      });
    } else if (data.toolName === 'Ask_Oracle') {
      container.innerHTML = `
        <button class="chip" id="btn-best">✅ Try best solution</button>
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
    } else if ((data.toolName === 'Ask_Multiple_Choice' || data.toolName === 'Request_Timed_Decision') && data.toolData?.options) {
      container.className = 'multiple-choice-container';
      this.renderMultipleChoice(container, data);
    } else {
      container.innerHTML = this.getDefaultChipsHtml();
      this.attachDefaultChipEvents(container);
    }
  }

  private renderMultipleChoice(container: HTMLElement, data: RequestStateChange) {
    const isTimed = data.toolName === 'Request_Timed_Decision';
    const defaultOptionId = isTimed ? data.toolData.default_option_id : data.toolData.recommendation;
    let defaultOptionTitle = '';

    container.innerHTML = data.toolData.options.map((opt: any) => {
      const isDefault = opt.id === defaultOptionId;
      if (isDefault) defaultOptionTitle = opt.title;
      const cardClass = isDefault ? 'option-card recommended' : 'option-card';
      const badge = isDefault ? (isTimed ? '<span class="rec-badge">⏱️ Auto-select</span>' : '<span class="rec-badge">Recommended</span>') : '';
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

    data.toolData.options.forEach((opt: any) => {
      const btn = document.getElementById(`opt-${opt.id}`);
      btn?.addEventListener('click', () => {
        this.sendChip(`I select option ${opt.id}: ${opt.title}`);
      });
    });

    if (isTimed && defaultOptionId && defaultOptionTitle) {
      this.startTimedDecisionCountdown(data.toolData.timeout_seconds || 120, defaultOptionId, defaultOptionTitle);
    }
  }

  private attachChipEvents(container: HTMLElement, mapping: Record<string, string>) {
    Object.entries(mapping).forEach(([id, text]) => {
      const btn = document.getElementById(id);
      btn?.addEventListener('click', () => this.sendChip(text));
    });
  }

  private getDefaultChipsHtml() {
    return this.state.quickReplyOptions.map((option, index) =>
      `<button class="chip" id="default-chip-${index}">${this.ui.escapeHtml(option)}</button>`
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

  private startTimedDecisionCountdown(timeoutSeconds: number, defaultOptionId: string, defaultOptionTitle: string) {
    this.clearTimedDecisionTimer();
    const chipsContainer = document.getElementById('chipsContainer');
    if (!chipsContainer) return;

    const countdownWrapper = document.createElement('div');
    countdownWrapper.id = 'countdownWrapper';
    countdownWrapper.innerHTML = `
      <div class="countdown-bar" id="countdownBar" style="width:100%"></div>
      <div class="countdown-text" id="countdownText">${timeoutSeconds}s — auto-selecting: ${this.ui.escapeHtml(defaultOptionTitle)}</div>
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
      if (text) text.textContent = `${remaining}s — auto-selecting: ${this.ui.escapeHtml(defaultOptionTitle)}`;
    }, 1000);

    this.timedDecisionTimeout = setTimeout(() => {
      this.sendChip(`I select option ${defaultOptionId}: ${defaultOptionTitle} (auto-selected after timeout)`);
    }, timeoutSeconds * 1000);
  }
}
