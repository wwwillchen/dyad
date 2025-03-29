import {LitElement, html, css} from 'lit';
import {customElement} from 'lit/decorators.js';

@customElement('dyad-viewport-watcher')
export class ViewportWatcher extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }
  `;

  private observer: IntersectionObserver | null = null;
  private isInViewport = true;

  override firstUpdated() {
    const query = "[data-key='chat-bottom-viewport-intersection-target']";
    const target = document.querySelector(query)?.parentElement;

    if (!target) {
      console.warn(`Element with "${query}" not found.`);
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          this.isInViewport = entry.isIntersecting;
          this.requestUpdate();
        });
      },
      {
        root: null, // viewport
        threshold: 0.01, // Adjust as needed
      },
    );

    this.observer.observe(target);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.observer) {
      this.observer.disconnect();
    }
  }

  override render() {
    return !this.isInViewport ? html`<slot></slot>` : html``;
  }
}
