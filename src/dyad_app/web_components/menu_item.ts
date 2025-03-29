import {LitElement, html, css} from 'lit';
import {customElement} from 'lit/decorators.js';

@customElement('dyad-menu-item')
export class MenuItem extends LitElement {
  static override styles = css`
    :host {
      display: block;
      background-color: var(--sys-surface-container);
      border-radius: 8px;
      cursor: pointer;
      transition: background-color 0.3s ease;
    }

    :host(:hover) {
      background-color: var(--sys-surface-container-highest);
    }
  `;

  override render() {
    return html`<slot></slot>`;
  }
}
