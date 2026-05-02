import { AppState, ServerStatus, ChatMessage } from './types';
import { NetworkManager } from './network';

// Declaring marked since it's loaded via CDN/script tag in HTML
declare const marked: any;

export class UIManager {
  constructor(private state: AppState, private network: NetworkManager) {
    this.setupTextarea();
  }

  private setupTextarea() {
    const textarea = document.getElementById('messageInput') as HTMLTextAreaElement;
    if (!textarea) return;

    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    textarea.addEventListener('paste', async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const blob = items[i].getAsFile();
          if (!blob) continue;

          const reader = new FileReader();
          reader.onload = (event) => {
            const base64Data = (event.target?.result as string).split(',')[1];
            this.addImagePreview(base64Data, blob.type);
          };
          reader.readAsDataURL(blob);
        }
      }
    });
  }

  private addImagePreview(base64Data: string, mimeType: string) {
    const inputContainer = document.querySelector('.input-area');
    if (!inputContainer) return;

    const imagePreview = document.createElement('div');
    imagePreview.className = 'image-preview';
    imagePreview.innerHTML = `<img src="data:${mimeType};base64,${base64Data}" alt="Pasted image"><span class="remove-image">×</span>`;
    (imagePreview as any).dataset.imageData = base64Data;
    (imagePreview as any).dataset.mimeType = mimeType;

    const textarea = document.getElementById('messageInput');
    inputContainer.insertBefore(imagePreview, textarea);

    imagePreview.querySelector('.remove-image')?.addEventListener('click', () => {
      imagePreview.remove();
    });
  }

  public playNotificationBeep() {
    this.network.postMessage('playNotificationSound');
  }

  public escapeHtml(unsafe: string): string {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  public addMessageToUI(msg: ChatMessage) {
    const container = document.getElementById('messages');
    if (!container) return;

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

  public sendMessage() {
    const input = document.getElementById('messageInput') as HTMLTextAreaElement;
    const content = input.value.trim();
    if (!content) return;

    this.network.postMessage('sendMessage', {
      content: content,
      requestId: this.state.currentPendingRequestId
    });

    input.value = '';
    input.style.height = 'auto';
    this.setControlsEnabled(false);
  }

  public setControlsEnabled(enabled: boolean) {
    const sendButton = document.getElementById('sendButton') as HTMLButtonElement;
    if (sendButton) sendButton.disabled = !enabled;

    // Only target chips in the quick-reply bar, not chips inside tool-bubble history entries
    const chipsContainer = document.getElementById('chipsContainer');
    if (chipsContainer) {
      (chipsContainer.querySelectorAll('.chip') as NodeListOf<HTMLButtonElement>)
        .forEach(c => c.disabled = !enabled);
      (chipsContainer.querySelectorAll('.option-card') as NodeListOf<HTMLButtonElement>)
        .forEach(c => c.disabled = !enabled);
    }
  }

  public updateStatusUI(data: ServerStatus) {
    this.state.currentServerStatus = data;
    if (data.globalProxyEnabled !== undefined) {
      this.state.globalProxyEnabled = data.globalProxyEnabled;
    }
    const sDot = document.getElementById('server-status-dot');
    const pDot = document.getElementById('proxy-status-dot');

    if (sDot) {
      sDot.className = data.isRunning ? 'status-dot online' : 'status-dot offline';
    }

    if (pDot && data.proxy) {
      pDot.className = data.proxy.running
        ? (this.state.globalProxyEnabled ? 'status-dot online' : 'status-dot pending')
        : 'status-dot offline';
    }
  }

  public async showConfigMenu() {
    const existingMenu = document.getElementById('configMenu');
    if (existingMenu) {
      existingMenu.remove();
      return;
    }

    this.network.postMessage('requestServerStatus');
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

    const options = this.getDynamicMenuOptions();

    options.forEach(option => {
      const item = document.createElement('div');
      item.textContent = option.text;
      item.style.padding = '8px 12px';
      item.style.cursor = 'pointer';
      item.style.color = 'var(--vscode-menu-foreground)';
      (item as any).onmouseover = () => item.style.background = 'var(--vscode-menu-selectionBackground)';
      (item as any).onmouseout = () => item.style.background = 'transparent';
      item.onclick = () => {
        this.network.postMessage('mcpAction', { action: option.action });
        menu.remove();
      };
      menu.appendChild(item);
    });

    document.body.appendChild(menu);

    setTimeout(() => {
      document.addEventListener('click', (e) => {
        if (!menu.contains(e.target as Node)) {
          menu.remove();
        }
      }, { once: true });
    }, 10);
  }

  private getDynamicMenuOptions() {
    const data = this.state.currentServerStatus;
    const options = [
      { text: '📊 Show Status', action: 'requestServerStatus' }
    ];

    if (data) {
      if (data.isRunning) {
        options.push({ text: '🔴 Stop Server', action: 'stopServer' });
        options.push({ text: '🔄 Restart Server', action: 'restartServer' });
      } else {
        options.push({ text: '▶️ Start Server', action: 'startServer' });
      }

      if (data.proxy && data.proxy.running) {
        if (this.state.globalProxyEnabled) {
          options.push({ text: '🔌 Disable Proxy', action: 'disableGlobalProxy' });
        } else {
          options.push({ text: '🔌 Enable Proxy', action: 'enableGlobalProxy' });
        }
        options.push({ text: '🔐 Install Proxy Certificate', action: 'installCertificate' });
        options.push({ text: '🗑️ Uninstall Proxy Certificate', action: 'uninstallCertificate' });
      }
    }

    options.push({ text: this.state.overrideFileExists ? '📁 Recreate Override File' : '📁 Create Override File', action: 'overridePrompt' });
    options.push({ text: '📝 Name This Chat', action: 'nameSession' });
    options.push({ text: '🌐 Open Web View', action: 'openWebView' });
    options.push({ text: '❓ Help & Documentation', action: 'openHelp' });
    options.push({ text: '🐛 Report Issue', action: 'reportIssue' });
    options.push({ text: '💡 Request Feature', action: 'requestFeature' });

    return options;
  }
}
