import {LitElement, html, css} from 'lit';
import {customElement, property} from 'lit/decorators.js';
@customElement('dyad-keyboard-shortcuts')
export class KeyboardShortcuts extends LitElement {
  @property({type: String}) newChatEvent = '';
  @property({type: String}) toggleSidebarEvent = '';
  @property({type: String}) escapeEvent = '';
  @property({type: String}) focusChatEvent = '';
  @property({type: String}) applyCodeEvent = '';
  @property({type: String}) reloadExtensionEvent = '';
  @property({type: String}) toggleChatFilesEvent = '';
  static override styles = css`
    :host {
      display: contents;
    }
  `;

  private pressedKeys: Set<string> = new Set();
  private isDialogOpen = false;

  constructor() {
    super();
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
  }

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
  }

  private handleKeyDown(event: KeyboardEvent) {
    const activeElement = document.activeElement;
    if (event.shiftKey) {
      this.pressedKeys.add('shift');
    }
    if (event.altKey) {
      this.pressedKeys.add('alt');
    }
    this.pressedKeys.add(event.key.toLowerCase());

    this.isDialogOpen = false;
    document.querySelectorAll('dyad-dialog').forEach((dialog) => {
      if ((dialog as any)['open'] === true) {
        this.isDialogOpen = true;
      }
    });

    // Apply code keyboard shortcut is special because:
    // 1. it works even when dialog is open
    // 2. it works even when focus is on an editable input
    if (this.applyCodeEvent) {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const keys = (isMac ? 'meta+enter' : 'control+enter')
        .toLowerCase()
        .split('+');
      if (keys.every((key) => this.pressedKeys.has(key))) {
        this.dispatchEvent(new MesopEvent(this.applyCodeEvent, {}));
        this.pressedKeys.clear();
        return;
      }
    }

    if (this.isDialogOpen) {
      return;
    }

    if (
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLSelectElement ||
      // Many of our LitElements capture user input
      // e.g. chat input, editor, diff, etc.
      // because it's a shadow DOM, we can't actaully
      // get the native HTML element so we just
      // assume that if it's a LitElement, we should
      // disable the hotkey.
      activeElement instanceof LitElement ||
      (activeElement instanceof HTMLElement && activeElement.isContentEditable)
    ) {
      return;
    }
    console.warn('keyboardshortcut', activeElement);

    this.checkShortcuts();
  }

  private handleKeyUp(event: KeyboardEvent) {
    if (event.shiftKey) {
      this.pressedKeys.delete('shift');
    }
    if (event.altKey) {
      this.pressedKeys.delete('alt');
    }
    this.pressedKeys.delete(event.key.toLowerCase());
  }

  private checkShortcuts() {
    for (const binding of this.getKeyBindings()) {
      const keys = binding.shortcut.toLowerCase().split('+');
      if (keys.every((key) => this.pressedKeys.has(key))) {
        this.dispatchEvent(new MesopEvent(binding.event, {}));
        this.pressedKeys.clear();
      }
    }
  }

  override render() {
    return html`<slot></slot>`;
  }

  private getKeyBindings() {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    return [
      {
        shortcut: 'n',
        event: this.newChatEvent,
      },
      {
        shortcut: isMac ? 'meta+b' : 'control+b',
        event: this.toggleSidebarEvent,
      },
      {
        shortcut: isMac ? 'meta+i' : 'control+i',
        event: this.toggleChatFilesEvent,
      },
      {
        shortcut: 'escape',
        event: this.escapeEvent,
      },
      {
        shortcut: isMac ? '/' : '/',
        event: this.focusChatEvent,
      },
      {
        shortcut: isMac ? 'meta+shift+e' : 'control+shift+e',
        event: this.reloadExtensionEvent,
      },
    ];
  }
}
