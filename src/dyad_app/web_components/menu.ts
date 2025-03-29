import {LitElement, html, css, type PropertyValues} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';

/**
 * `dyad-menu` is a web component that creates a menu similar to Angular Material's menu.
 * It takes a query selector string for the menu trigger and uses a slot for the menu content.
 *
 * Usage:
 * <dyad-menu trigger="#menuButton">
 *   <div class="menu-item">Item 1</div>
 *   <div class="menu-item">Item 2</div>
 * </dyad-menu>
 */
@customElement('dyad-menu')
class LitMenu extends LitElement {
  static override styles = css`
    :host {
      position: absolute;
      display: none;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
      border-radius: 4px;
      min-width: 150px;
      z-index: 9999999;
      opacity: 0;
      transform: scaleY(0);
      transform-origin: top;
      transition:
        opacity 0.3s ease,
        transform 0.3s ease;
    }

    :host([open]) {
      display: block;
      opacity: 1;
      transform: scaleY(1);
    }

    /* Adjust transform-origin when menu is positioned above */
    :host([position='top']) {
      transform-origin: bottom;
    }

    ::slotted(*) {
      padding: 8px 16px;
      cursor: pointer;
      white-space: nowrap;
    }

    ::slotted(*:hover) {
      background-color: #f1f1f1;
    }
  `;

  /**
   * The trigger selector string to identify the element that will open the menu.
   */
  @property({type: String})
  trigger = '';

  @state()
  openMenu = false;

  /**
   * Internal state to track the menu's position: 'bottom' or 'top'.
   */
  @state()
  menuPosition = 'bottom';

  constructor() {
    super();
    this._handleTriggerClick = this._handleTriggerClick.bind(this);
    this._handleOutsideClick = this._handleOutsideClick.bind(this);
    this._handleEscape = this._handleEscape.bind(this);
    this._handleResize = this._handleResize.bind(this);
  }

  override updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('openMenu')) {
      if (this.openMenu) {
        this.setAttribute('open', '');
      } else {
        this.removeAttribute('open');
      }
    }

    if (changedProperties.has('menuPosition')) {
      this.setAttribute('position', this.menuPosition);
    }
  }

  override firstUpdated() {
    if (!this.trigger) {
      console.error('dyad-menu: "trigger" attribute is required.');
      return;
    }

    const triggerElement = this.getTriggerElement();
    if (!triggerElement) {
      console.error(
        `dyad-menu: No element found for selector "${this.trigger}".`,
      );
      return;
    }

    triggerElement.addEventListener('click', this._handleTriggerClick);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.trigger) {
      const triggerElement = this.getTriggerElement();
      if (triggerElement) {
        triggerElement.removeEventListener('click', this._handleTriggerClick);
      }
    }
    document.removeEventListener('click', this._handleOutsideClick);
    document.removeEventListener('keydown', this._handleEscape);
    window.removeEventListener('resize', this._handleResize);
  }

  /**
   * Handle click on the trigger to toggle the menu.
   */
  _handleTriggerClick(event: Event) {
    event.stopPropagation();
    this.openMenu = !this.openMenu;
    if (this.openMenu) {
      // Wait for the menu to render so its dimensions are available.
      this.updateComplete.then(() => {
        this._positionMenu();
        document.addEventListener('click', this._handleOutsideClick);
        document.addEventListener('keydown', this._handleEscape);
        window.addEventListener('resize', this._handleResize);
      });
    } else {
      this._removeGlobalListeners();
    }
  }

  _removeGlobalListeners() {
    document.removeEventListener('click', this._handleOutsideClick);
    document.removeEventListener('keydown', this._handleEscape);
    window.removeEventListener('resize', this._handleResize);
  }

  /**
   * Position the menu relative to the trigger element,
   * ensuring it does not overflow the viewport horizontally.
   */
  _positionMenu() {
    const triggerElement = this.getTriggerElement();
    if (!triggerElement) return;

    const triggerRect = triggerElement.getBoundingClientRect();
    const menuRect = this.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Default: position below the trigger, left-aligned.
    let top = triggerRect.bottom + scrollY;
    let left = triggerRect.left + scrollX;
    let position = 'bottom';

    // If there's not enough space below but enough above, position the menu above.
    if (
      viewportHeight - triggerRect.bottom < menuRect.height &&
      triggerRect.top > menuRect.height
    ) {
      top = triggerRect.top + scrollY - menuRect.height;
      position = 'top';
    }

    // Check if the menu would overflow on the right.
    // triggerRect.left is relative to the viewport.
    if (triggerRect.left + menuRect.width > viewportWidth) {
      // Position the menu so that its right edge aligns with the trigger's right edge.
      left = triggerRect.right - menuRect.width + scrollX;
      // Clamp to avoid overflowing on the left.
      if (left < scrollX + 10) {
        left = scrollX + 10;
      }
    }

    this.menuPosition = position;
    this.style.top = `${top}px`;
    this.style.left = `${left}px`;
  }

  /**
   * Close the menu if a click occurs outside the trigger.
   */
  _handleOutsideClick(event: Event) {
    const triggerElement = this.getTriggerElement();
    if (triggerElement && !triggerElement.contains(event.target as Node)) {
      this.openMenu = false;
    }
  }

  /**
   * Close the menu when the Escape key is pressed.
   */
  _handleEscape(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.openMenu = false;
    }
  }

  /**
   * Reposition the menu on window resize.
   */
  _handleResize() {
    if (this.openMenu) {
      this._positionMenu();
    }
  }

  override render() {
    return html`<slot></slot>`;
  }

  getTriggerElement(): HTMLElement {
    const element = document.querySelector(this.trigger)!.parentElement;
    if (!element) {
      throw new Error(`No element found for selector "${this.trigger}".`);
    }
    return element as HTMLElement;
  }
}

export {LitMenu};
