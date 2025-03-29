import {LitElement, css, type PropertyValues} from 'lit';
import {customElement, property} from 'lit/decorators.js';

@customElement('dyad-scroller')
export class Scroller extends LitElement {
  @property({type: Number})
  scrollCounter = 0;

  static override styles = css`
    :host {
      display: block;
    }
  `;

  override willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('scrollCounter')) {
      console.log('scrollCounter', this.scrollCounter);
      if (this.scrollCounter === 0) {
        // Don't bother scrolling if the counter is 0 because
        // the user may have reloaded the page and scrolling
        // is jarring.
        return;
      }
      const target = document.querySelector(
        "[data-key='scroll-to-bottom-target']",
      );
      if (target) {
        setTimeout(() => {
          const scrollableContainer = this.findScrollableContainer(target);
          if (scrollableContainer) {
            scrollableContainer.scrollTo({
              top: scrollableContainer.scrollHeight,
              behavior: 'smooth',
            });
            console.debug('scrolling to bottom');
          }
        }, 200);
      }
    }
  }

  private findScrollableContainer(element: Element | null): HTMLElement | null {
    while (element && element !== document.body) {
      const style = window.getComputedStyle(element);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        return element as HTMLElement;
      }
      element = element.parentElement;
    }
    return null;
  }
}
