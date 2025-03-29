import {LitElement, html, css, type PropertyValues} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {EditorState, type Transaction} from 'prosemirror-state';
import {Decoration, DecorationSet, EditorView} from 'prosemirror-view';
import type {Schema} from 'prosemirror-model';
import {Plugin} from 'prosemirror-state';
import {keymap} from 'prosemirror-keymap';
import {baseKeymap} from 'prosemirror-commands';
import {history} from 'prosemirror-history';
import {prosemirrorStyles} from './prosemirror_styles';
import {createMarkdownParser} from './markdown_parser';
import type {MarkdownParser} from 'prosemirror-markdown';
import {
  defaultMarkdownSerializer,
  schema as markdownSchema,
} from 'prosemirror-markdown';
import {buildInputRules} from './input_rules';

@customElement('dyad-pad-input')
export class PadInput extends LitElement {
  @property({type: String})
  initialValue = '';

  @state()
  private value = '';

  @property({type: String})
  inputEvent = '';

  @property({type: String})
  blurEvent = '';

  @property({type: Boolean})
  disabled = false; // added disabled property

  private editorView?: EditorView;

  static override styles = [
    css`
      :host {
        display: block;
        position: relative;
      }

      a {
        text-decoration: none;
        color: var(--sys-primary);
      }

      a:hover {
        text-decoration: underline;
      }

      #editor {
        min-height: 64px;
        overflow-y: auto;
        border: none;
        font-size: 1rem;
        line-height: 1.5;
        font-family: inherit;
        background-color: var(--surface-container);
        color: var(--on-surface-variant);
        padding: 8px;
      }

      .ProseMirror {
        outline: none;
        min-height: 100%;
      }

      .placeholder-text {
        color: var(--sys-on-surface);
        opacity: 0.5;
      }
    `,
    prosemirrorStyles,
  ];
  schema: Schema;
  parser: MarkdownParser;
  state!: EditorState;

  constructor() {
    super();
    this.schema = markdownSchema;
    this.parser = createMarkdownParser(this.schema);
  }

  override render() {
    return html` <div id="editor"></div> `;
  }

  override firstUpdated() {
    const editorElement = this.shadowRoot?.getElementById('editor');
    this.value = this.initialValue;
    if (editorElement) {
      this._initializeEditor(editorElement);
    }
  }

  override updated(changedProperties: PropertyValues<this>) {
    super.updated(changedProperties);
    if (changedProperties.has('initialValue')) {
      this.editorView?.updateState(
        this.state.apply(
          this.state.tr.replaceWith(
            0,
            this.state.doc.content.size,
            this.parser.parse(this.initialValue),
          ),
        ),
      );
    }
  }
  private _initializeEditor(element: HTMLElement) {
    // Add a custom paste handler plugin that parses markdown
    const pastePlugin = new Plugin({
      props: {
        handlePaste: (view, event: ClipboardEvent) => {
          event.preventDefault();

          const text = event.clipboardData?.getData('text/plain');

          if (text && view.dispatch) {
            const {tr} = view.state;
            const {from, to} = view.state.selection;

            // Parse the pasted text as markdown
            const parsedContent = this.parser.parse(text);

            // Replace selection with parsed markdown content
            tr.replaceWith(from, to, parsedContent);
            view.dispatch(tr);
          }

          return true;
        },
      },
    });

    this.state = EditorState.create({
      schema: this.schema,
      plugins: [
        keymap(baseKeymap),
        history(),
        buildInputRules(this.schema),
        pastePlugin,
        placeholderPlugin(),
      ],
      doc: this.parser.parse(this.value),
    });

    this.editorView = new EditorView(element, {
      state: this.state,
      dispatchTransaction: this._dispatchTransaction.bind(this),
      editable: () => !this.disabled,
      handleDOMEvents: {
        blur: this._handleBlur.bind(this),
      },
    });
  }

  private _dispatchTransaction(tr: Transaction) {
    const newState = this.editorView!.state.apply(tr);
    this.editorView!.updateState(newState);

    const serialized = defaultMarkdownSerializer.serialize(
      this.editorView!.state.doc,
    );
    if (serialized !== this.value) {
      this.value = serialized;
      this.dispatchEvent(new MesopEvent(this.inputEvent, {value: this.value}));
    }
  }

  /**
   * Handle the blur event and dispatch a MesopEvent with the current value.
   */
  private _handleBlur(view: EditorView, event: FocusEvent): boolean {
    if (this.blurEvent) {
      this.dispatchEvent(new MesopEvent(this.blurEvent, {value: this.value}));
    }
    return false; // Returning false allows normal event propagation.
  }
}

function placeholderPlugin() {
  return new Plugin({
    props: {
      decorations(state) {
        const doc = state.doc;
        if (
          doc.childCount === 1 &&
          doc.firstChild!.isTextblock &&
          doc.firstChild!.content.size === 0
        ) {
          const placeholderNode = document.createElement('span');
          placeholderNode.textContent = 'Write here...';
          placeholderNode.className = 'placeholder-text';
          return DecorationSet.create(doc, [
            Decoration.widget(1, placeholderNode),
          ]);
        }
      },
    },
  });
}
