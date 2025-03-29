import {LitElement, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';

@customElement('dyad-poller')
export class Poller extends LitElement {
  @property({type: String}) pollEvent = '';

  override connectedCallback() {
    super.connectedCallback();
    // Dispatch exactly one event on connection
    if (this.pollEvent) {
      this.dispatchEvent(new MesopEvent(this.pollEvent, {}));
    }
  }

  override render() {
    return html`<slot></slot>`;
  }
}
