import {LitElement, html, css} from 'lit';
import {customElement, property} from 'lit/decorators.js';

@customElement('dyad-link')
export class DyadLink extends LitElement {
  static override styles = css`
    :host {
      display: inline-block;
    }

    a {
      text-decoration: inherit;
      color: inherit;
    }
  `;

  @property({type: String})
  width = '';

  @property({type: String})
  href = '';

  @property({type: String})
  target = '_self';

  @property({type: String})
  rel = '';

  override render() {
    const hostStyles = this.width ? `width: ${this.width}` : '';

    return html`
      <style>
        :host {
          ${hostStyles}
        }
      </style>
      <a href="${this.href}" target="${this.target}" rel="${this.rel}">
        <slot></slot>
      </a>
    `;
  }
}
