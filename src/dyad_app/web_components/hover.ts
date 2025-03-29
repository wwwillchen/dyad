import {LitElement, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';

@customElement('dyad-hover')
export class Hover extends LitElement {
  @property({type: String})
  mouseoverEvent = '';

  @property({type: String})
  mouseoutEvent = '';

  private mouseoutTimeout: number | null = null;
  private mouseoverTimeout: number | null = null;
  private isHovered = false;

  // Debounce times in milliseconds
  private static readonly MOUSEOVER_DELAY = 50;
  private static readonly MOUSEOUT_DELAY = 300;

  override render() {
    return html`
      <div @mouseover="${this._onMouseOver}" @mouseleave="${this._onMouseOut}">
        <slot></slot>
      </div>
    `;
  }

  private _onMouseOver() {
    if (this.mouseoutTimeout) {
      clearTimeout(this.mouseoutTimeout);
      this.mouseoutTimeout = null;
    }

    // Don't dispatch multiple mouseover events while already hovered
    if (this.isHovered) {
      return;
    }

    if (this.mouseoverTimeout) {
      clearTimeout(this.mouseoverTimeout);
    }

    this.mouseoverTimeout = window.setTimeout(() => {
      this.isHovered = true;
      this.dispatchEvent(new MesopEvent(this.mouseoverEvent, {}));
      this.mouseoverTimeout = null;
    }, Hover.MOUSEOVER_DELAY);
  }

  private _onMouseOut() {
    if (this.mouseoverTimeout) {
      clearTimeout(this.mouseoverTimeout);
      this.mouseoverTimeout = null;
    }

    if (this.mouseoutTimeout) {
      clearTimeout(this.mouseoutTimeout);
    }

    this.mouseoutTimeout = window.setTimeout(() => {
      this.isHovered = false;
      this.dispatchEvent(new MesopEvent(this.mouseoutEvent, {}));
      this.mouseoutTimeout = null;
    }, Hover.MOUSEOUT_DELAY);
  }
}
