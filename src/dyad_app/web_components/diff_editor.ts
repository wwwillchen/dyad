import {LitElement, html, css} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {monaco} from './monaco';
import 'monaco-editor/min/vs/editor/editor.main.css';
import './monaco_themes';

@customElement('dyad-diff-editor')
export class DiffEditor extends LitElement {
  @property({type: String}) beforeCode = '';
  @property({type: String}) afterCode = '';
  @property({type: String}) language = '';
  @property({type: Boolean}) isDarkTheme = false;
  @property({type: Boolean}) isFinal = false;
  @property({type: String}) updatedDocEvent = '';

  private editor: monaco.editor.IStandaloneDiffEditor | null = null;
  private originalModel: monaco.editor.ITextModel | null = null;
  private modifiedModel: monaco.editor.ITextModel | null = null;

  static override styles = css`
    :host {
      display: block;
      height: 100%;
    }
  `;

  override updated(changedProps: Map<string | number | symbol, unknown>) {
    super.updated(changedProps);
    if (!this.editor) {
      this.initializeEditor();
      return;
    }

    if (changedProps.has('isDarkTheme')) {
      monaco.editor.setTheme(this.isDarkTheme ? 'vs-dark' : 'vs');
    }

    if (changedProps.has('isFinal')) {
      if (this.editor) {
        this.editor.dispose();
        this.editor = null;
      }
      if (this.originalModel) {
        this.originalModel.dispose();
        this.originalModel = null;
      }
      if (this.modifiedModel) {
        this.modifiedModel.dispose();
        this.modifiedModel = null;
      }
      this.initializeEditor();
      return;
    }

    if (changedProps.has('language')) {
      if (this.originalModel) {
        this.originalModel.dispose();
      }
      if (this.modifiedModel) {
        this.modifiedModel.dispose();
      }
      this.originalModel = monaco.editor.createModel(
        this.beforeCode,
        this.language,
      );
      this.modifiedModel = monaco.editor.createModel(
        this.afterCode,
        this.language,
      );
      this.editor.setModel({
        original: this.originalModel,
        modified: this.modifiedModel,
      });
    } else {
      // For code changes, simply update the existing models' values.
      if (changedProps.has('beforeCode') && this.originalModel) {
        this.originalModel.setValue(this.beforeCode);
      }
      if (changedProps.has('afterCode') && this.modifiedModel) {
        this.modifiedModel.setValue(this.afterCode);
      }
    }
  }

  override createRenderRoot() {
    return this;
  }

  initializeEditor() {
    const container = this.renderRoot.querySelector('.diff-editor-container');
    if (!container) return;

    monaco.editor.setTheme(this.isDarkTheme ? 'vs-dark' : 'vs');

    this.editor = monaco.editor.createDiffEditor(container as HTMLElement, {
      automaticLayout: true,
      minimap: {enabled: false},
      lineNumbers: 'on',
      scrollBeyondLastLine: true,
      readOnly: false,
      theme: this.isDarkTheme ? 'dyad-dark' : 'dyad-light',
      wordWrap: 'on',
      renderSideBySide: true,
      hideUnchangedRegions: {
        enabled: true,
        revealLineCount: 10,
        minimumLineCount: 5,
        contextLineCount: 4,
      },
    });

    this.originalModel = monaco.editor.createModel(
      this.beforeCode,
      this.language,
    );
    this.modifiedModel = monaco.editor.createModel(
      this.afterCode,
      this.language,
    );
    this.editor.setModel({
      original: this.originalModel,
      modified: this.modifiedModel,
    });

    const modifiedEditor = this.editor.getModifiedEditor();
    modifiedEditor.onDidChangeModelContent(() => {
      if (modifiedEditor.getValue() === this.afterCode) {
        return;
      }
      this.dispatchEvent(
        new MesopEvent(this.updatedDocEvent, {
          doc: modifiedEditor.getValue(),
        }),
      );
    });
  }

  override render() {
    return html`<div class="diff-editor-container"></div>`;
  }

  override disconnectedCallback() {
    if (this.editor) {
      this.editor.dispose();
      this.editor = null;
    }
    if (this.originalModel) {
      this.originalModel.dispose();
      this.originalModel = null;
    }
    if (this.modifiedModel) {
      this.modifiedModel.dispose();
      this.modifiedModel = null;
    }
    super.disconnectedCallback();
  }
}
