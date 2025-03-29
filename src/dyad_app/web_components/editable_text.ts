import {LitElement, html, css} from 'lit';
import {customElement, property} from 'lit/decorators.js';

@customElement('dyad-editable-text')
export class EditableText extends LitElement {
  @property({type: String})
  initialValue = '';

  @property({type: String})
  blurEvent = '';

  static override styles = css`
    :host {
      display: block;
    }

    .editable {
      outline: none;
      min-height: 24px;
      padding: 4px;
      background-color: var(--surface-container);
      color: var(--on-surface-variant);
      font-family: inherit;
      font-size: 18px;
      font-weight: 600;
      line-height: inherit;
    }

    .editable:empty::before {
      content: 'Write here...';
      color: var(--sys-on-surface);
      opacity: 0.5;
    }
  `;

  override render() {
    return html`
      <div
        class="editable"
        contenteditable="true"
        .innerText=${this.initialValue}
        @blur=${this._handleBlur}
      ></div>
    `;
  }

  private _handleBlur(e: Event) {
    const target = e.target as HTMLDivElement;
    this.dispatchEvent(
      new MesopEvent(this.blurEvent, {value: target.innerText}),
    );
  }
}
