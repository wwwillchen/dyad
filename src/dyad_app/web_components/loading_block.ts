import {LitElement, html, css} from 'lit';
import {customElement} from 'lit/decorators.js';

@customElement('dyad-loading-block')
export class LoadingBlock extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }

    .loading-block {
      position: relative;
      overflow: hidden;
      background-color: var(--sys-surface-container);
      border-radius: 4px;
      width: 100%;
      height: 160px;
    }

    .loading-block::after {
      content: '';
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      transform: translateX(-100%);
      background-image: linear-gradient(
        90deg,
        var(--sys-surface-container-high) 0,
        var(--sys-surface-container) 20%,
        var(--sys-surface-container-low) 60%,
        var(--sys-surface-container-lowest)
      );
      animation: shimmer 2s infinite;
    }

    @keyframes shimmer {
      100% {
        transform: translateX(100%);
      }
    }
  `;

  override render() {
    return html` <div class="loading-block"></div> `;
  }
}
