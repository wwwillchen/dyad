import {LitElement, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';

@customElement('dyad-copy-to-clipboard')
export class CopyToClipboard extends LitElement {
  @property({type: String})
  text = '';

  @property({type: Number})
  counter = 0;

  constructor() {
    super();
    this.text = '';
    this.counter = 0;
  }

  override render() {
    return html``;
  }

  override updated(changedProperties: Map<string, any>) {
    if (changedProperties.has('counter')) {
      this.writeToClipboard(this.text);
    }
  }

  private async writeToClipboard(text: string) {
    if (!text) {
      console.debug('No text to copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      console.debug('Text successfully copied to clipboard');
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  }
}
