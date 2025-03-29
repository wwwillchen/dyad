import {LitElement, html} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {marked} from 'marked';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';
import DOMPurify from 'dompurify';
import {monaco} from './monaco';
import './monaco_themes';

interface Citation {
  title: string;
  description: string;
  url?: string;
}

@customElement('dyad-markdown')
export class Markdown extends LitElement {
  @property({type: String}) content = '';
  @property({type: Boolean}) darkTheme = false;
  @property({type: Boolean}) shouldAnimate = false;
  @property({type: Object}) citations: Record<string, Citation> = {};
  private _codeBlocks: {text: string; filePath: string}[] = [];
  @state() htmlContent = '';
  @property({type: String}) applyCodeEvent = '';
  @state() private previousContent = '';
  @state() private animationInProgress = false;
  @property({type: Number}) typingSpeed = 2; // ms per character

  // Scroll-related properties
  private isUserScrolling = false;
  private userScrollTimeout: number | null = null;
  private lastScrollTop = 0;
  private scrollableContainer: HTMLElement | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.setupScrollListener();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.cleanupScrollListener();
  }

  private handleScroll = (event: Event) => {
    const container = event.target as HTMLElement;
    const currentScroll = container.scrollTop;
    if (currentScroll < this.lastScrollTop) {
      this.isUserScrolling = true;
      if (this.userScrollTimeout) {
        window.clearTimeout(this.userScrollTimeout);
      }
      this.userScrollTimeout = window.setTimeout(() => {
        this.isUserScrolling = false;
      }, 1000);
    }
    this.lastScrollTop = currentScroll;
  };

  private setupScrollListener() {
    this.scrollableContainer = this.findScrollableContainer(this);
    this.scrollableContainer?.addEventListener('scroll', this.handleScroll, {
      passive: true,
    });
  }

  private cleanupScrollListener() {
    if (this.userScrollTimeout) {
      window.clearTimeout(this.userScrollTimeout);
    }
    this.scrollableContainer?.removeEventListener('scroll', this.handleScroll);
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

  private scrollToBottom(behavior: ScrollBehavior = 'smooth') {
    if (this.scrollableContainer) {
      this.scrollableContainer.scrollTo({
        top: this.scrollableContainer.scrollHeight,
        behavior,
      });
    }
  }

  override async updated(changedProperties: Map<string, any>) {
    if (
      changedProperties.has('shouldAnimate') ||
      (changedProperties.has('content') &&
        this.content !== this.previousContent &&
        !this.animationInProgress)
    ) {
      this.animateContentUpdate();
    }

    // Auto-scroll if near the bottom and user is not scrolling.
    if (
      !this.isUserScrolling &&
      this.scrollableContainer &&
      this.shouldAnimate
    ) {
      const {scrollTop, clientHeight, scrollHeight} = this.scrollableContainer;
      const threshold = 280;
      const isAtBottom = scrollHeight - (scrollTop + clientHeight) <= threshold;
      if (isAtBottom) {
        requestAnimationFrame(() => {
          this.scrollToBottom('instant');
        });
      }
    }

    // Ensure Monaco colorization happens.
    await this.updateComplete;
    // requestAnimationFrame(this.applyMonacoColorize);
  }

  async animateContentUpdate() {
    // Lock in the current target content.
    const targetContent = this.content;
    this.animationInProgress = true;

    // If animation is disabled, shouldAnimate was just enabled, or this is not an append, update immediately
    if (
      !this.shouldAnimate ||
      !targetContent.startsWith(this.previousContent) ||
      this.previousContent === ''
    ) {
      this.previousContent = targetContent;
      await this.updateMarkdown(targetContent);
      this.animationInProgress = false;
      return;
    }

    // Determine the new content to be appended.
    const newContent = targetContent.substring(this.previousContent.length);
    const newLength = newContent.length;

    // Calculate block size based on content length
    // Assumption:
    // 400ms between updates (from server)
    // 10ms per update to render
    const targetUpdates = 400 / 10;
    const blockSize = Math.max(1, Math.ceil(newLength / targetUpdates));

    let currentContent = this.previousContent;

    for (let i = 0; i < newContent.length; i += blockSize) {
      // Check if animation was cancelled
      if (!this.shouldAnimate) {
        return;
      }

      const block = newContent.substring(i, i + blockSize);
      currentContent += block;
      await this.updateMarkdown(currentContent);
      await this.delay(0);
    }

    // Force a final update using the target content.
    await this.updateMarkdown(targetContent);
    await this.delay(50);
    this.previousContent = targetContent;
    this.animationInProgress = false;

    // If content changed during the animation, run the update again.
    if (this.content !== targetContent) {
      this.animateContentUpdate();
    }
  }

  delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async updateMarkdown(contentToRender: string = this.previousContent) {
    // Helper to escape HTML in code blocks.
    function escapeHtml(unsafe: string): string {
      return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    // Create a custom renderer for code blocks.
    const renderer = new marked.Renderer();
    this._codeBlocks = [];
    let index = -1;
    renderer.code = ({text, lang}) => {
      const langSegments = lang?.split(' ') ?? [];
      let language = langSegments.length > 0 ? langSegments[0] : '';

      if (language === 'tsx') {
        language = 'typescript';
      } else if (language === 'jsx') {
        language = 'javascript';
      }

      const filePath = langSegments[1]
        ? langSegments[1].match(/path="([^"]*)"/)?.[1]!
        : '';
      const title = filePath || language;
      const isCodeBlockClosed = checkIsCodeBlockClosed(contentToRender, text);

      this._codeBlocks.push({text, filePath});
      index += 1;
      return `
        <div class="code-block-header">
          <div class="file-path" title="${title}">${title}</div>
          <div class="code-actions">
            <a class="code-copy-target-${index} code-copy-target">
              <span class="code-action-label">Copy</span>
              <span class="material-symbols-rounded">content_copy</span>
            </a>
            ${
              filePath && isCodeBlockClosed
                ? `
            <a class="code-apply-target-${index} code-apply-target">
              <span class="code-action-label">Apply</span>
              <span class="material-symbols-rounded">play_arrow</span>
            </a>
            `
                : ''
            }
          </div>
        </div>
        <div class="code-block">
          <pre><code class="monaco-code" data-code-index="${index}" data-lang="${language}">${escapeHtml(
            text,
          )}</code></pre>
        </div>`;
    };

    function checkIsCodeBlockClosed(
      markdown: string,
      codeBlockContent: string,
    ): boolean {
      const escapedContent = codeBlockContent.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&',
      );
      const codeBlockPattern = new RegExp(
        `\`\`\`[^\\\`]*${escapedContent}[^\\\`]*\`\`\``,
        's',
      );
      return codeBlockPattern.test(markdown);
    }

    const mentionTokenizer = {
      name: 'mention',
      level: 'inline',
      start(src: string) {
        return src.match(/[@#]/)?.index;
      },
      tokenizer(src: string) {
        const rule = /^([@#])(\S+)/;
        const match = rule.exec(src);
        if (match) {
          return {
            type: 'mention',
            raw: match[0],
            symbol: match[1],
            text: match[2],
          };
        }
      },
      renderer(token: any) {
        const className = token.symbol === '@' ? 'mention' : 'hashtag';
        return `<span class="${className}">${token.symbol}${token.text}</span>`;
      },
    };

    const citationTokenizer = {
      name: 'citation',
      level: 'inline',
      start(src: string) {
        return src.match(/\[(?!\s*\d+\]\()/)?.index;
      },
      tokenizer(src: string) {
        const rule = /^\[((?:[^[\]]|\[[^\]]*\])*)\](?!\()/;
        const match = rule.exec(src);
        if (match) {
          const key = match[1];
          const nextChar = src[match[0].length];
          if (nextChar === '(') return undefined;
          return {
            type: 'citation',
            raw: match[0],
            key: key,
          };
        }
      },
      renderer: (token: any) => {
        const normalizedKey = token.key.replace(/[\u2013\u2014-]/g, '-');
        const citation =
          this.citations[normalizedKey] ||
          this.citations[token.key] ||
          Object.entries(this.citations).find(
            ([k]) => k.replace(/[\u2013\u2014-]/g, '-') === normalizedKey,
          )?.[1];
        if (citation) {
          let url = '';
          if (citation.url) {
            url = `<a href="${
              citation.url || '#'
            }" target="_blank" class="citation-url">Visit Source</a>`;
          }
          return `
            <span class="citation">
              ${token.key}
              <span class="citation-tooltip">
                <span class="citation-title">${escapeHtml(
                  citation.title,
                )}</span>
                <span class="citation-description">${escapeHtml(
                  citation.description,
                )}</span>
                ${url}
              </span>
            </span>`;
        }
        return `[${token.key}]`;
      },
    };

    marked.use({
      renderer,
      extensions: [mentionTokenizer, citationTokenizer],
    });

    marked.setOptions({
      renderer,
      gfm: true,
      breaks: true,
    });

    this.htmlContent = await marked.parse(contentToRender);
    this.requestUpdate();

    // Apply Monaco colorization after rendering.
    this.updateComplete.then(() =>
      requestAnimationFrame(this.applyMonacoColorize),
    );
  }

  private applyMonacoColorize = async () => {
    const codeBlocks = this.renderRoot.querySelectorAll('code.monaco-code');
    for (const block of Array.from(codeBlocks)) {
      if (block.querySelector('span')) {
        continue;
      }
      try {
        await monaco.editor.colorizeElement(block as HTMLElement, {
          theme: this.darkTheme ? 'dyad-dark' : 'dyad-light',
        });
      } catch (e) {
        console.error('Monaco colorize error', e);
      }
    }
  };

  override createRenderRoot() {
    this.addEventListener('click', this.onClick);
    return this;
  }

  private onClick = (e: Event) => {
    const target = e.target as HTMLElement;
    const actionHandlers = {
      'code-copy-target': this.handleCodeCopy,
      'code-apply-target': this.handleCodeApply,
    };

    for (const [className, handler] of Object.entries(actionHandlers)) {
      if (target.classList.contains(className)) {
        handler(target);
        break;
      }
      const parent = target.parentElement;
      if (parent?.classList.contains(className)) {
        handler(parent);
        break;
      }
    }
  };

  private handleCodeCopy = (target: HTMLElement) => {
    const index = this.getCodeBlockIndex(target, 'code-copy-target-');
    if (index !== -1) {
      navigator.clipboard.writeText(this._codeBlocks[index].text);
    }
  };

  private handleCodeApply = (target: HTMLElement) => {
    const index = this.getCodeBlockIndex(target, 'code-apply-target-');
    if (index !== -1) {
      this.dispatchEvent(
        new MesopEvent(this.applyCodeEvent, {
          codeEdit: this._codeBlocks[index].text,
          filePath: this._codeBlocks[index].filePath,
        }),
      );
    }
  };

  private getCodeBlockIndex(element: HTMLElement, prefix: string): number {
    for (const className of element.classList) {
      if (className.startsWith(prefix)) {
        const parts = className.split('-');
        return Number.parseInt(parts[parts.length - 1]);
      }
    }
    return -1;
  }

  override render() {
    return html`<div class="markdown">
      ${unsafeHTML(DOMPurify.sanitize(this.htmlContent))}
    </div>`;
  }
}
