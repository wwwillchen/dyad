import type {MarkSpec, MarkType} from 'prosemirror-model';
import {type EditorState, Plugin, PluginKey} from 'prosemirror-state';

// Define the mention mark
export const mentionMark: MarkSpec = {
  inclusive: false,
  attrs: {
    label: {default: ''},
    value: {default: ''},
  },
  parseDOM: [
    {
      tag: 'span.mention',
      getAttrs: (dom: HTMLElement) => ({
        label: dom.textContent,
        value: dom.getAttribute('data-value'),
      }),
    },
  ],
  toDOM: (mark) => [
    'span',
    {
      class: 'mention',
      'data-value': mark.attrs.value,
    },
    0,
  ],
};

// Define the hashtag mark
export const hashtagMark: MarkSpec = {
  inclusive: false,
  attrs: {
    label: {default: ''},
    value: {default: ''},
  },
  parseDOM: [
    {
      tag: 'span.hashtag',
      getAttrs: (dom: HTMLElement) => ({
        label: dom.textContent,
        value: dom.getAttribute('data-value'),
      }),
    },
  ],
  toDOM: (mark) => [
    'span',
    {
      class: 'hashtag',
      'data-value': mark.attrs.value,
    },
    0,
  ],
};

// Import the PluginKey defined earlier
export const autocompletePluginKey = new PluginKey('autocomplete');

// Updated utility function to get the word preceding the cursor
function getWordBefore(state: EditorState) {
  const {from} = state.selection;
  const $from = state.doc.resolve(from);

  // Check if the cursor is inside an existing mention or hashtag mark
  const marks = $from.marks();
  if (
    marks.some(
      (mark) => mark.type.name === 'mention' || mark.type.name === 'hashtag',
    )
  ) {
    return null;
  }

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, ' ');
  const words = textBefore.split(' ');
  const lastWord = words[words.length - 1];
  const wordRange = textBefore.lastIndexOf(lastWord);
  const trigger = lastWord ? lastWord[0] : null;
  const query = lastWord ? lastWord.slice(1) : '';
  if (trigger === '@' || trigger === '#') {
    return {trigger, query, from: from - lastWord.length, to: from};
  }
  return null;
}

// Cache for loaded SVG icons
const svgCache: Map<string, string> = new Map();

// Helper function to load and cache SVG content
async function loadSvgIcon(url: string): Promise<string> {
  if (svgCache.has(url)) {
    return svgCache.get(url)!;
  }

  try {
    const response = await fetch(url);

    const svgText = response.ok ? await response.text() : '';
    svgCache.set(url, svgText);
    return svgText;
  } catch (error) {
    console.error('Error loading SVG:', error);
    return '';
  }
}

// The Autocomplete Plugin
export const autocompletePlugin = ({
  suggestions,
  onRequestSuggestions,
  onSuggestionAccepted, // Add new callback parameter
}: {
  suggestions: any[];
  onRequestSuggestions: (query: string, triggerType: string) => void;
  onSuggestionAccepted?: (suggestion: any, triggerType: string) => void;
}) => {
  return new Plugin<{
    active: boolean;
    trigger: string | null;
    query: string;
    suggestions: any[];
    from: number | null;
    to: number | null;
    selectedIndex: number;
  }>({
    key: autocompletePluginKey,
    state: {
      init() {
        return {
          active: false,
          trigger: null,
          query: '',
          suggestions: suggestions,
          from: null,
          to: null,
          selectedIndex: 0,
        };
      },
      apply(tr, prev, oldState, newState) {
        // Handle meta updates from key events
        const meta = tr.getMeta(autocompletePluginKey);
        if (meta) {
          return {
            ...prev,
            ...meta,
          };
        }

        // Handle changes to the document to activate/deactivate autocomplete
        const {selection} = newState;
        const word = getWordBefore(newState);
        const state = {...prev};

        if (word) {
          // If a trigger is detected, update the state
          state.active = true;
          state.trigger = word.trigger;
          state.query = word.query;
          state.from = word.from;
          state.to = word.to;
          state.selectedIndex = 0;

          onRequestSuggestions(word.query, word.trigger);
        } else {
          // If no trigger, deactivate the autocomplete
          state.active = false;
          state.trigger = null;
          state.query = '';
          state.suggestions = [];
          state.from = null;
          state.to = null;
          state.selectedIndex = 0;
        }

        return state;
      },
    },
    props: {
      handleDOMEvents: {
        click: (view, event) => {
          const target = event.target as HTMLElement;
          if (target?.classList.contains('hashtag')) {
            const value = target.getAttribute('data-value') || '';
            (target.getRootNode() as any).host.dispatchHashtagEvent(
              value.trim(),
            );

            return true; // Indicate that the event has been handled
          }
          return false; // Let other handlers process the event
        },
      },
      decorations(state) {
        return null;
      },
      handleKeyDown(view, event) {
        const pluginState = autocompletePluginKey.getState(view.state);
        if (!pluginState.active) return false;

        const {selectedIndex, suggestions} = pluginState;

        if (event.key === 'ArrowDown') {
          // Navigate down in the suggestions
          const nextIndex =
            selectedIndex < suggestions.length - 1 ? selectedIndex + 1 : 0;
          view.dispatch(
            view.state.tr.setMeta(autocompletePluginKey, {
              selectedIndex: nextIndex,
            }),
          );
          return true;
        }
        if (event.key === 'ArrowUp') {
          // Navigate up in the suggestions
          const prevIndex =
            selectedIndex > 0 ? selectedIndex - 1 : suggestions.length - 1;
          view.dispatch(
            view.state.tr.setMeta(autocompletePluginKey, {
              selectedIndex: prevIndex,
            }),
          );
          return true;
        }
        if (event.key === 'Enter') {
          const {from, to, suggestions, selectedIndex, trigger} = pluginState;
          if (suggestions.length > 0) {
            const selected = suggestions[selectedIndex];

            // Call the onSuggestionAccepted callback before inserting the text
            if (onSuggestionAccepted) {
              onSuggestionAccepted(selected, trigger);
            }

            const insertText =
              trigger === '@'
                ? `@${selected['name']} `
                : `#${selected['name']} `;

            let markType: MarkType | undefined = undefined;
            let markAttrs: any = {};

            if (trigger === '@') {
              markType = view.state.schema.marks.mention;
              markAttrs = {label: selected['name'], value: selected['value']};
            } else if (trigger === '#') {
              markType = view.state.schema.marks.hashtag;
              markAttrs = {label: selected['name'], value: selected['value']};
            }

            if (markType) {
              const mark = markType.create(markAttrs);
              view.dispatch(
                view.state.tr.replaceWith(
                  from,
                  to,
                  view.state.schema.text(insertText, [mark]),
                ),
              );
            } else {
              view.dispatch(
                view.state.tr.replaceWith(
                  from,
                  to,
                  view.state.schema.text(insertText),
                ),
              );
            }

            // Hide the autocomplete
            view.dispatch(
              view.state.tr.setMeta(autocompletePluginKey, {active: false}),
            );
            return true;
          }
        } else if (event.key === 'Escape') {
          // Close the autocomplete
          view.dispatch(
            view.state.tr.setMeta(autocompletePluginKey, {active: false}),
          );
          return true;
        }

        return false;
      },
    },
    view(editorView) {
      const container = document.createElement('div');
      container.role = 'listbox';
      container.dataset['testid'] = 'autocomplete-container';
      container.style.position = 'absolute';
      container.style.background = 'var(--sys-surface-container-low)';
      container.style.color = 'var(--sys-on-surface-variant)';
      container.style.padding = '5px';
      container.style.zIndex = '1000';
      container.style.borderRadius = '4px';
      container.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
      container.style.maxHeight = '250px';
      container.style.overflowY = 'auto';
      container.style.display = 'none';
      container.style.maxWidth = '460px';
      container.style.wordWrap = 'break-word';

      const backdrop = document.createElement('div');
      backdrop.style.position = 'fixed';
      backdrop.style.top = '0';
      backdrop.style.left = '0';
      backdrop.style.width = '100%';
      backdrop.style.height = '100%';
      backdrop.style.zIndex = '999';
      backdrop.style.display = 'none';

      document.body.appendChild(backdrop);
      document.body.appendChild(container);

      const hideAutocomplete = () => {
        container.style.display = 'none';
        backdrop.style.display = 'none';
        editorView.dispatch(
          editorView.state.tr.setMeta(autocompletePluginKey, {active: false}),
        );
      };

      backdrop.addEventListener('click', hideAutocomplete);

      const render = () => {
        const state = editorView.state;
        const pluginState = autocompletePluginKey.getState(state);
        if (pluginState.active && pluginState.suggestions.length > 0) {
          container.innerHTML = '';
          pluginState.suggestions.forEach((item: any, index: number) => {
            const div = document.createElement('div');
            div.setAttribute('data-index', index.toString());
            div.style.padding = '4px 5px';
            div.style.cursor = 'pointer';
            div.style.borderRadius = '4px';
            div.style.display = 'flex';
            div.style.flexDirection = 'column';
            div.style.gap = '2px';
            div.role = 'option';

            if (index === pluginState.selectedIndex) {
              div.style.background = 'var(--sys-inverse-primary)';
            }

            const header = document.createElement('div');
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.style.gap = '8px';

            const iconContainer = document.createElement('div');
            iconContainer.style.width = '20px';
            iconContainer.style.height = '20px';
            iconContainer.style.display = 'flex';
            iconContainer.style.alignItems = 'center';
            iconContainer.style.justifyContent = 'center';
            iconContainer.style.transition = 'transform 0.2s ease';

            if (item.icon) {
              const iconUrl = `/static/devicons/${item.icon}`;

              loadSvgIcon(iconUrl).then((svgContent) => {
                if (svgContent) {
                  iconContainer.innerHTML = svgContent;
                  const svgElement = iconContainer.querySelector('svg');
                  if (svgElement) {
                    svgElement.style.width = '20px';
                    svgElement.style.height = '20px';
                  }
                }
              });
            }

            // Add hover effect
            div.addEventListener('mouseenter', () => {
              iconContainer.style.transform = 'scale(1.1)';
            });
            div.addEventListener('mouseleave', () => {
              iconContainer.style.transform = 'scale(1)';
            });

            header.appendChild(iconContainer);

            const name = document.createElement('span');
            name.textContent = item.name;
            name.style.fontWeight = '500';
            header.appendChild(name);

            if (item.type) {
              const typeChip = document.createElement('span');
              typeChip.textContent = item.type;
              typeChip.style.padding = '2px 4px';
              typeChip.style.background = 'var(--sys-surface-container-high)';
              typeChip.style.borderRadius = '4px';
              typeChip.style.fontSize = '0.8em';
              header.appendChild(typeChip);
            }

            div.appendChild(header);

            if (item.description) {
              const description = document.createElement('span');
              description.textContent = item.description;
              description.style.fontSize = '0.8em';
              description.style.color = 'var(--sys-on-surface-variant)';
              description.style.marginLeft = '28px';
              div.appendChild(description);
            }

            div.addEventListener('mousedown', (e) => {
              e.preventDefault();
              const insertText =
                pluginState.trigger === '@'
                  ? `@${item['name']} `
                  : `#${item['name']} `;

              // Call the onSuggestionAccepted callback before inserting the text
              if (onSuggestionAccepted) {
                onSuggestionAccepted(item, pluginState.trigger);
              }

              let markType: MarkType | undefined = undefined;
              let markAttrs: any = {};

              if (pluginState.trigger === '@') {
                markType = editorView.state.schema.marks.mention;
                markAttrs = {label: item['name'], value: item['value']};
              } else if (pluginState.trigger === '#') {
                markType = editorView.state.schema.marks.hashtag;
                markAttrs = {label: item['name'], value: item['value']};
              }

              if (markType) {
                const mark = markType.create(markAttrs);
                editorView.dispatch(
                  editorView.state.tr.replaceWith(
                    pluginState.from,
                    pluginState.to,
                    editorView.state.schema.text(insertText, [mark]),
                  ),
                );
              } else {
                editorView.dispatch(
                  editorView.state.tr.replaceWith(
                    pluginState.from,
                    pluginState.to,
                    editorView.state.schema.text(insertText),
                  ),
                );
              }

              hideAutocomplete();
            });
            container.appendChild(div);
          });

          // Position the container above the cursor
          const coords = editorView.coordsAtPos(pluginState.to);

          // Temporarily set display to block to calculate dimensions
          container.style.display = 'block';
          backdrop.style.display = 'block';

          // Calculate the left position
          const editorRect = editorView.dom.getBoundingClientRect();
          const leftPosition = Math.min(
            coords.left,
            editorRect.right - container.offsetWidth - 5,
          );
          container.style.left = `${leftPosition}px`;

          // Calculate the top position
          const containerHeight = container.offsetHeight;
          const topPosition = coords.top + window.scrollY - containerHeight - 5;

          // Ensure the container doesn't go above the viewport
          container.style.top = `${
            topPosition >= 0 ? topPosition : coords.bottom + window.scrollY
          }px`;

          // Scroll the active item into view
          const selectedDiv = container.querySelector(
            `div[data-index="${pluginState.selectedIndex}"]`,
          );
          if (selectedDiv) {
            selectedDiv.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest',
            });
          }
        } else {
          container.style.display = 'none';
          backdrop.style.display = 'none';
        }
      };

      const update = () => {
        render();
      };

      const destroy = () => {
        container.remove();
        backdrop.remove();
      };

      return {
        update,
        destroy,
      };
    },
  });
};
