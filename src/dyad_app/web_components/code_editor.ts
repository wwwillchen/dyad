import {LitElement, html, css} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {monaco} from './monaco';
import 'monaco-editor/min/vs/editor/editor.main.css';
import './monaco_themes';

@customElement('dyad-code-editor')
export class CodeEditor extends LitElement {
  @property({type: String}) code = '';
  @property({type: String}) language = '';
  @property({type: Boolean}) isDarkTheme = false;
  @property({type: String}) updatedDocEvent = '';
  @property({type: Number}) highlightedLineNumber = 0;

  private editor: monaco.editor.IStandaloneCodeEditor | null = null;

  static override styles = css`
    :host {
      display: block;
    }
    .editor-container {
      width: 100%;
      height: 100%;
    }
  `;

  override updated(changedProps: Map<string | number | symbol, unknown>) {
    super.updated(changedProps);

    const shouldReinitialize =
      changedProps.has('code') ||
      changedProps.has('language') ||
      changedProps.has('isDarkTheme');

    if (!this.editor || shouldReinitialize) {
      this.initializeEditor();
    }

    if (changedProps.has('highlightedLineNumber')) {
      this.scrollAndHighlightLine();
    }
  }

  override createRenderRoot() {
    return this;
  }

  initializeEditor() {
    if (this.editor) {
      this.editor.dispose();
      this.editor = null;
    }

    const container = this.renderRoot.querySelector('.editor-container');
    if (!container) return;

    this.editor = monaco.editor.create(container as HTMLElement, {
      value: this.code,
      language: this.language,
      automaticLayout: true,
      minimap: {enabled: true},
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      readOnly: false,
      theme: this.isDarkTheme ? 'dyad-dark' : 'dyad-light',
      wordWrap: 'on',
    });

    this.editor.onDidChangeModelContent(() => {
      if (this.editor) {
        this.dispatchEvent(
          new MesopEvent(this.updatedDocEvent, {
            doc: this.editor.getValue(),
          }),
        );
      }
    });

    this.scrollAndHighlightLine();
  }

  private scrollAndHighlightLine() {
    if (!this.editor || !this.highlightedLineNumber) return;

    this.editor.createDecorationsCollection([
      {
        range: new monaco.Range(
          this.highlightedLineNumber,
          1,
          this.highlightedLineNumber,
          1,
        ),
        options: {
          isWholeLine: true,
          className: 'highlighted-line',
          inlineClassName: 'highlighted-line',
        },
      },
    ]);

    // Scroll to the line
    this.editor.revealLineInCenter(this.highlightedLineNumber);
  }

  override render() {
    return html` <div class="editor-container"></div>`;
  }

  override disconnectedCallback() {
    if (this.editor) {
      this.editor.dispose();
      this.editor = null;
    }
    super.disconnectedCallback();
  }
}
