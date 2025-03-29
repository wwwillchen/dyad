import {LitElement, html, css} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {
  loadSandpackClient,
  type SandboxSetup,
  type ClientOptions,
} from '@codesandbox/sandpack-client';

@customElement('dyad-sandpack')
export class Sandpack extends LitElement {
  @property({type: Object}) files = {};
  @property({type: String}) entry?: string;
  @property({type: Object}) dependencies?: Record<string, string>;

  private client: any = null;

  static override styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    iframe {
      width: 100%;
      height: 100%;
      border: none;
      border-radius: 4px;
    }
  `;

  override async firstUpdated() {
    await this.initializeSandpack();
  }

  private async initializeSandpack() {
    const iframe = this.shadowRoot?.getElementById('sandpack-iframe');
    if (!iframe) return;

    const content: SandboxSetup = {
      files: this.files,
      dependencies: this.dependencies,
    };

    if (this.entry) {
      content.entry = this.entry;
    }

    const options: ClientOptions = {
      bundlerURL: 'https://sandpack.dyad.sh/',
      showOpenInCodeSandbox: false,
    };

    try {
      this.client = await loadSandpackClient(
        iframe as HTMLIFrameElement,
        content,
        options,
      );
    } catch (error) {
      console.error('Failed to initialize Sandpack:', error);
    }
  }

  override render() {
    return html`
      <iframe
        sandbox="allow-scripts allow-same-origin allow-forms allow-top-navigation-by-user-activation"
        id="sandpack-iframe"
      ></iframe>
    `;
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
  }
}
