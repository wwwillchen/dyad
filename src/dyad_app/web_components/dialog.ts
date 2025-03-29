import {LitElement, html, css, type PropertyValueMap} from 'lit';
import {customElement, property, query} from 'lit/decorators.js';

@customElement('dyad-dialog')
export class DyadDialog extends LitElement {
  static override styles = css`
    .dialog-container {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 900;
    }

    .dialog-container[open] {
      display: flex;
    }

    .dialog-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
    }

    .dialog-content {
      position: relative;
      background: var(--sys-surface);
      color: var(--sys-on-surface);
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
      z-index: 1001;
      max-width: calc(100vw - 32px);
      max-height: calc(100vh - 32px);
    }
  `;

  @property({type: Boolean, reflect: true})
  open = false;

  @property({type: Boolean})
  disableSoftDismiss = false;

  @property({type: String})
  closeDialogEvent!: string;

  @query('.dialog-container')
  private dialogContainer!: HTMLElement;

  private handleEscKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopImmediatePropagation();
      if (!this.disableSoftDismiss) {
        this.onClose();
      }
    }
  };

  protected override updated(
    changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>,
  ) {
    if (changedProperties.has('open')) {
      this.toggleDialog(this.open);
    }
  }

  private toggleDialog(open: boolean) {
    if (open) {
      document.body.style.overflow = 'hidden'; // Prevent body scroll
      this.dialogContainer.setAttribute('open', '');
      document.addEventListener('keydown', this.handleEscKey);
    } else {
      document.body.style.overflow = ''; // Restore body scroll
      this.dialogContainer.removeAttribute('open');
      document.removeEventListener('keydown', this.handleEscKey);
    }
  }

  private onClose = () => {
    this.open = false;
    this.dispatchEvent(new MesopEvent(this.closeDialogEvent, {}));
  };

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.body.style.overflow = ''; // Ensure body scroll is restored
    document.removeEventListener('keydown', this.handleEscKey);
  }

  override render() {
    return html`
      <div class="dialog-container">
        <div class="dialog-backdrop" @click=${this.onBackdropClick}></div>
        <div class="dialog-content" @click=${(e: Event) => e.stopPropagation()}>
          <slot></slot>
        </div>
      </div>
    `;
  }

  private onBackdropClick(event: Event) {
    event.stopPropagation();
    if (!this.disableSoftDismiss) {
      this.onClose();
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dyad-dialog': DyadDialog;
  }
}
