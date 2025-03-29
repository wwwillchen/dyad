import {LitElement, html, css, type PropertyValues} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';

import {EditorState, type Transaction, Plugin} from 'prosemirror-state';
import {Decoration, DecorationSet, EditorView} from 'prosemirror-view';
import {
  Schema,
  type Node as ProseMirrorNode,
  Fragment,
} from 'prosemirror-model';
import {schema as basicSchema} from 'prosemirror-schema-basic';

import {keymap} from 'prosemirror-keymap';
import {baseKeymap} from 'prosemirror-commands';
import {history} from 'prosemirror-history';
import {
  autocompletePlugin,
  autocompletePluginKey,
  hashtagMark,
  mentionMark,
} from './autocomplete';
import {prosemirrorStyles} from './prosemirror_styles';

import {TextSelection} from 'prosemirror-state';

const DYAD_SKIP_INPUT_DISPATCH = 'DYAD_SKIP_INPUT_DISPATCH';

/**
 * Custom command to insert a hard break (`<br>`) at the current cursor position.
 * @param {EditorState} state - The current editor state.
 * @param {Function} dispatch - The dispatch function to apply transactions.
 * @returns {boolean} - Returns true if the command was successful.
 */
const insertHardBreak = (
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
) => {
  const {schema, selection} = state;
  const {$from, empty} = selection;

  if (!empty) return false; // Only insert hard break if selection is empty

  const hardBreak = schema.nodes.hard_break;
  if (!hardBreak) return false; // Ensure the schema supports hard_break

  const tr = state.tr.insert($from.pos, hardBreak.create());

  // Move the cursor after the hard break
  tr.setSelection(TextSelection.create(tr.doc, $from.pos + 1));

  if (dispatch) {
    dispatch(tr.scrollIntoView());
  }

  return true;
};

declare global {
  class MesopEvent extends CustomEvent<any> {
    constructor(type: string, detail: any);
  }

  interface HTMLElementTagNameMap {
    'dyad-chat-input': ChatInput;
  }
}

interface Suggestion {
  label: string;
  children?: Suggestion[];
}

@customElement('dyad-chat-input')
export class ChatInput extends LitElement {
  @property({type: String})
  initialValue = '';

  @property({type: Number})
  clearCounter = 0;

  @property({type: Number})
  focusCounter = 0;

  @property({type: String})
  sendChatEvent = '';

  @property({type: String})
  blurEvent = '';

  @property({type: String})
  hashtagClickEvent = '';

  @property({type: String})
  requestSuggestionsEvent = '';

  @property({type: String})
  placeholder = '';

  @property({type: Array})
  suggestions: string[] = [];

  @state()
  private value = '';

  private editorView?: EditorView;

  @property({type: String})
  suggestionAcceptedEvent = '';

  static override styles = [
    css`
      .hashtag {
        cursor: pointer;
        color: var(--sys-primary);
        background-color: var(--sys-surface-variant);
        border-radius: 8px;
        padding: 2px 2px;
        margin: 0 4px;
        border-radius: 3px;
        overflow-wrap: break-word;
      }

      .mention {
        cursor: pointer;
        color: var(--sys-on-primary);
        background-color: var(--sys-primary);
        padding: 2px;
        margin: 0px 8px;
        border-radius: 8px;
        overflow-wrap: break-word;
      }

      :host {
        display: block;
        position: relative;
      }

      #editor {
        min-height: 24px;
        max-height: min(360px, 50vh);
        overflow-y: auto;
        border: none;
        font-size: 1rem;
        line-height: 1.5;
        font-family: inherit;
        background-color: var(--surface-container);
        color: var(--on-surface-variant);
        padding: 8px;
      }

      #editor::-webkit-scrollbar {
        width: 8px;
      }

      #editor::-webkit-scrollbar-track {
        background: var(--surface-container);
      }

      #editor::-webkit-scrollbar-thumb {
        background: var(--sys-on-surface-variant);
        opacity: 0.5;
        border-radius: 4px;
      }

      .ProseMirror {
        outline: none;
        min-height: 100%;
      }

      .placeholder-text {
        color: var(--sys-on-surface);
        opacity: 0.5;
      }

      p {
        margin: 0;
      }
    `,
    prosemirrorStyles,
  ];

  dispatchHashtagEvent(label: string) {
    this.dispatchEvent(
      new MesopEvent(this.hashtagClickEvent, {
        value: label,
      }),
    );
  }

  override render() {
    return html` <div id="editor"></div> `;
  }

  override firstUpdated() {
    const editorElement = this.shadowRoot?.getElementById('editor');
    if (editorElement) {
      this._initializeEditor(editorElement);
    }
    this.value = this.initialValue;
  }

  private _updateEditorContent(schema: Schema, skipInputDispatch = false) {
    if (!this.editorView) return;

    const {state} = this.editorView;
    let newDoc: ProseMirrorNode;

    if (this.initialValue.trim() !== '') {
      const parsedNodes = this._parseInitialValue(this.initialValue, schema);
      newDoc = schema.nodes.paragraph.createAndFill(
        {},
        Fragment.from(parsedNodes),
      )!;
    } else {
      newDoc = schema.nodes.paragraph.createAndFill()!;
    }

    // Replace the entire document content with the new node
    let tr = state.tr.replaceWith(0, state.doc.content.size, newDoc);
    if (skipInputDispatch) {
      tr = tr.setMeta(DYAD_SKIP_INPUT_DISPATCH, true);
    }
    this.editorView.dispatch(tr);
  }

  override willUpdate(changedProperties: PropertyValues<this>) {
    if (
      changedProperties.has('initialValue') ||
      changedProperties.has('clearCounter')
    ) {
      if (this.editorView) {
        const {schema} = this.editorView.state;
        this._updateEditorContent(
          schema,
          changedProperties.has('clearCounter'),
        );
      }
    }

    if (changedProperties.has('suggestions') && this.editorView) {
      const pluginState = autocompletePluginKey.getState(this.editorView.state);
      const tr = this.editorView.state.tr.setMeta(autocompletePluginKey, {
        ...pluginState,
        suggestions: this.suggestions,
      });
      this.editorView.dispatch(tr);
    }

    if (changedProperties.has('focusCounter')) {
      this._focusEditor();
    }
  }

  private _focusEditor(): void {
    if (!this.editorView) return;
    const state = this.editorView.state;
    if (state.doc.textContent) {
      // Create a text selection at the end of the document.
      const tr = state.tr.setSelection(TextSelection.atEnd(state.doc));
      this.editorView.dispatch(tr);
    }

    this.editorView.focus();
  }

  private get isMac(): boolean {
    return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  }

  private _initializeEditor(element: HTMLElement) {
    const schema = new Schema({
      nodes: basicSchema.spec.nodes,
      // @ts-ignore
      marks: {
        ...basicSchema.spec.marks,
        mention: mentionMark,
        hashtag: hashtagMark,
      },
    });

    const enterKeyHandler = (state: EditorState) => {
      const autocompleteState = autocompletePluginKey.getState(state);

      if (autocompleteState?.active) {
        return false;
      }
      this.dispatchEvent(
        new MesopEvent(this.sendChatEvent, {value: this.value}),
      );
      return true;
    };

    const backspaceKeyHandler = (
      state: EditorState,
      dispatch: ((tr: Transaction) => void) | undefined,
    ): boolean => {
      const {selection} = state;
      if (!selection.empty) return false;
      const {$from} = selection;
      if ($from.parentOffset === 0) return false;
      const nodeBefore = $from.nodeBefore;
      if (!nodeBefore || !nodeBefore.isText) return false;
      const hasSpecialMark = nodeBefore.marks.some(
        (mark) => mark.type.name === 'mention' || mark.type.name === 'hashtag',
      );
      if (!hasSpecialMark) return false;
      const startPos = $from.pos - (nodeBefore.text?.length || 0);
      if (dispatch) {
        dispatch(state.tr.delete(startPos, $from.pos).scrollIntoView());
      }
      return true;
    };

    const customKeymapPlugin = keymap({
      'Shift-Enter': (state, dispatch) => {
        return insertHardBreak(state, dispatch);
      },
      'Enter': enterKeyHandler,
      'Backspace': backspaceKeyHandler,
    });

    function placeholderPlugin(text: string) {
      return new Plugin({
        props: {
          decorations(state) {
            const {doc} = state;
            if (doc.textContent.trim() === '') {
              const placeholderNode = document.createElement('span');
              placeholderNode.textContent = text;
              placeholderNode.className = 'placeholder-text';
              // Use position 0 if there are no children; otherwise, use 1.
              const pos = doc.childCount === 0 ? 0 : 1;
              return DecorationSet.create(doc, [
                Decoration.widget(pos, placeholderNode, {side: 1}),
              ]);
            }
            return null;
          },
        },
      });
    }

    const pastePlainTextPlugin = new Plugin({
      props: {
        handlePaste: (view, event: ClipboardEvent) => {
          event.preventDefault();

          const text = event.clipboardData?.getData('text/plain') ?? '';
          const {schema} = view.state;

          // Define a regex to find both "#file:foo.py" and "#dir:path/to/dir" patterns
          const regex = /#(?:file|dir):([\S]+)/g;
          const nodes = [];
          let lastIndex = 0;
          let match: RegExpExecArray | null;

          // biome-ignore lint/suspicious/noAssignInExpressions: not that bad
          while ((match = regex.exec(text)) !== null) {
            const matchStart = match.index;
            // Insert any plain text before the matched pattern.
            if (matchStart > lastIndex) {
              nodes.push(schema.text(text.slice(lastIndex, matchStart)));
            }

            const fullPath = match[1];
            const displayName = fullPath.split('/').pop() ?? fullPath;

            // Create a hashtag mark with the full reference but display only the last part
            const mark = schema.marks.hashtag
              ? schema.marks.hashtag.create({
                  label: displayName,
                  value: match[0].slice(1), // slice off the "#"
                })
              : null;

            nodes.push(schema.text(`#${displayName}`, mark ? [mark] : []));
            lastIndex = regex.lastIndex;
          }

          // Insert any remaining text after the last match.
          if (lastIndex < text.length) {
            nodes.push(schema.text(text.slice(lastIndex)));
          }

          // Create a fragment from the array of nodes.
          const fragment =
            nodes.length > 1 ? Fragment.fromArray(nodes) : nodes[0];

          // Replace the selected content in the editor with the fragment.
          const {from, to} = view.state.selection;
          const tr = view.state.tr.replaceWith(from, to, fragment);
          view.dispatch(tr);
          return true;
        },
      },
    });

    const plugins = [
      placeholderPlugin(
        this.placeholder ||
          'Type here... (use # for files, @ for agents, / to focus)',
      ),
      customKeymapPlugin,
      pastePlainTextPlugin,
      autocompletePlugin({
        suggestions: this.suggestions,
        onRequestSuggestions: (query: string, triggerType: string) => {
          this.dispatchEvent(
            new MesopEvent(this.requestSuggestionsEvent, {
              query,
              type: triggerType,
            }),
          );
        },
        onSuggestionAccepted: (suggestion: any, triggerType: string) => {
          if (this.suggestionAcceptedEvent) {
            this.dispatchEvent(
              new MesopEvent(this.suggestionAcceptedEvent, {
                suggestion,
                type: triggerType,
              }),
            );
          }
        },
      }),
      keymap(baseKeymap),
      history(),
    ];
    let doc: ProseMirrorNode | undefined;
    if (this.initialValue.trim() !== '') {
      doc = schema.nodes.paragraph.createAndFill(
        {},
        this._parseInitialValue(this.initialValue, schema),
      )!;
    } else {
      doc = undefined;
    }

    const state = EditorState.create({
      schema,
      plugins,
      doc,
    });

    this.editorView = new EditorView(element, {
      state,
      dispatchTransaction: this._dispatchTransaction.bind(this),
      attributes: {
        tabindex: '0',
      },
      handleDOMEvents: {
        blur: () => {
          this._onBlur();
          return false;
        },
        copy: (view, event: ClipboardEvent) => {
          const {state} = view;
          let text = '';
          const {from, to, empty} = state.selection;
          if (!empty) {
            const slice = state.doc.slice(from, to);
            // Use doc when doing (ctrl+a), use paragraph when selecting individually.
            const tempDoc =
              state.schema.nodes.doc.createAndFill({}, slice.content) ??
              state.schema.nodes.paragraph.createAndFill({}, slice.content);
            text = tempDoc ? this.getTextWithHardBreaks(tempDoc) : '';
          } else {
            text = this.getTextWithHardBreaks(state.doc);
          }
          if (event.clipboardData) {
            event.clipboardData.setData('text/plain', text);
            event.preventDefault();
          }
          return true;
        },
        cut: (view, event: ClipboardEvent) => {
          const {state} = view;
          const {empty} = state.selection;

          if (!empty) {
            const {from, to} = state.selection;
            const slice = state.doc.slice(from, to);
            // Use doc when doing (ctrl+a), use paragraph when selecting individually.
            const tempDoc =
              state.schema.nodes.doc.createAndFill({}, slice.content) ??
              state.schema.nodes.paragraph.createAndFill({}, slice.content);
            const text = tempDoc ? this.getTextWithHardBreaks(tempDoc) : '';

            if (event.clipboardData) {
              event.clipboardData.setData('text/plain', text);
              event.preventDefault();

              const tr = state.tr.deleteSelection();
              view.dispatch(tr);
            }
          }
          return true;
        },
      },
    });
  }

  private _dispatchTransaction(tr: Transaction) {
    const newState = this.editorView!.state.apply(tr);
    this.editorView!.updateState(newState);

    const newValue = this.getTextWithHardBreaks(this.editorView!.state.doc);
    if (newValue !== this.value) {
      this.value = newValue;
    }
  }

  /**
   * @param {ProseMirrorNode} doc - The ProseMirror document node.
   * @returns {string} - The serialized text with '\n' for hard breaks.
   */
  private getTextWithHardBreaks(doc: ProseMirrorNode): string {
    let text = '';

    doc.descendants((node, pos) => {
      if (node.type.name === 'hard_break') {
        text += '\n';
        return true;
      }

      if (node.isText) {
        const mentionMark = node.marks.find(
          (mark) => mark.type.name === 'mention',
        );
        const hashtagMark = node.marks.find(
          (mark) => mark.type.name === 'hashtag',
        );

        if (mentionMark) {
          text += `@${mentionMark.attrs.value} `;
        } else if (hashtagMark) {
          text += `#${hashtagMark.attrs.value} `;
        } else {
          // Regular text node without mention/hashtag marks
          text += node.text;
        }
      }

      return true;
    });

    return text;
  }

  private _onBlur() {
    const jsonValue = this.editorView!.state.doc.toJSON();
    this.dispatchEvent(
      new MesopEvent(this.blurEvent, {
        value: this.value,
        jsonValue: JSON.stringify(jsonValue),
      }),
    );
  }

  /**
   * Parses the provided text looking for @mentions, #file:... and #dir:... references.
   * Returns an array of ProseMirror nodes (typically text nodes with marks).
   *
   * @param text The plain text to parse.
   * @param schema The current ProseMirror schema.
   * @returns An array of nodes representing the parsed text.
   */
  private _parseInitialValue(text: string, schema: Schema): ProseMirrorNode[] {
    const nodes: ProseMirrorNode[] = [];
    // - Group 1 & 2: Match "#file:<anything>" or "#dir:<anything>"
    // - Group 3 & 4: Match "@<username>" where username can contain alphanumerics, underscore, or hyphen
    const regex = /(#(?:file|dir):([\S]+))|(@([a-zA-Z0-9_-]+))/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: not that bad
    while ((match = regex.exec(text)) !== null) {
      // Add any plain text preceding the match
      if (match.index > lastIndex) {
        nodes.push(schema.text(text.slice(lastIndex, match.index)));
      }

      // Check if we have a file/dir reference match
      if (match[1]) {
        const path = match[2];
        // Grab only the last part from the path
        const displayName = path.split('/').pop() ?? path;
        // Create a hashtag mark with a label and a value
        const mark = schema.marks.hashtag
          ? schema.marks.hashtag.create({
              label: displayName,
              value: match[1].slice(1), // Remove the leading '#'
            })
          : null;
        // Create a text node with the normalized reference
        nodes.push(schema.text(`#${displayName}`, mark ? [mark] : []));
      }
      // Otherwise check if we have a mention match
      else if (match[3]) {
        const username = match[4];
        const mark = schema.marks.mention
          ? schema.marks.mention.create({value: username})
          : null;
        nodes.push(schema.text(`@${username}`, mark ? [mark] : []));
      }
      lastIndex = regex.lastIndex;
    }

    // Append any remaining text after the last match
    if (lastIndex < text.length) {
      nodes.push(schema.text(text.slice(lastIndex)));
    }
    return nodes;
  }
}
