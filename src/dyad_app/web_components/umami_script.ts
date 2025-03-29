import {LitElement} from 'lit';
import {customElement} from 'lit/decorators.js';

@customElement('dyad-umami-script')
export class UmamiScript extends LitElement {
  override connectedCallback() {
    super.connectedCallback();
    this.injectUmamiScript();
  }

  private getNonceFromExistingScript(): string | null {
    const existingScript = document.querySelector('script[nonce]');
    return existingScript ? (existingScript as any).nonce : null;
  }

  private injectUmamiScript() {
    // Check if script already exists to avoid duplicates
    if (
      !document.querySelector(
        'script[data-website-id="d9b5e175-c7bb-4843-8367-a6ac3170fbd5"]',
      )
    ) {
      try {
        const script = document.createElement('script');
        script.defer = true;

        // Get nonce from an existing script element
        const nonce = this.getNonceFromExistingScript();
        if (nonce) {
          script.setAttribute('nonce', nonce);
        }

        // Handle Trusted Types if they're enforced in this document
        if (window.trustedTypes?.createPolicy) {
          // Create a policy that allows the specific Umami URL
          const policy = window.trustedTypes.createPolicy('umami', {
            createScriptURL: (url: string) => {
              if (url === 'https://cloud.umami.is/script.js') {
                return url;
              }
              throw new Error('Untrusted script URL');
            },
          });

          // Use the policy to create a trusted URL
          script.src = policy.createScriptURL(
            'https://cloud.umami.is/script.js',
          ) as unknown as string;
        } else {
          // Fall back to direct assignment if Trusted Types aren't available
          script.src = 'https://cloud.umami.is/script.js';
        }

        script.setAttribute(
          'data-website-id',
          'd9b5e175-c7bb-4843-8367-a6ac3170fbd5',
        );
        document.head.appendChild(script);
        console.debug(
          `Umami analytics script injected${nonce ? ' with nonce' : ''}`,
        );
      } catch (error) {
        console.error('Failed to inject Umami script:', error);
      }
    }
  }

  // This component doesn't render any visible content
  override render() {
    return null;
  }
}
