# Indexing

Dyad maintains an index of your [workspace](./workspace.md) to enable these features:

- **Semantic search** - Dyad has a code search tool which does a semantic search by comparing your prompt and looking for similar code files in your workspace.
- **Chat suggestions** - if you type `#` in the chat input, you will get an autocomplete box with suggestions for files in your workspace.

Dyad creates a full index on app startup and then incrementally updates the index when files are modified, added or deleted.

If you're running into a bug with indexing, you can try to delete and restart the index by going to the **Settings** page > **Indexing** sub-page.

## How it works

Indexing works by using an embedding model. Whenever a file is added or changed, Dyad's indexing service will create an embedding for the file and store it in its vector store. This embedding will be used to find semantically relevant files given the user's input.

> Note: Dyad's code search tool uses an intermediary LLM (router model) to format a code search query from the user input to improve the semantic search.

## Customizing embedding

TODO: how to customize this.

## Ignoring files

If you want to ignore files, you can create a `.dyadignore` at the root of your workspace directory and on each line, include the path that you want to ignore. This is the same syntax used for `.gitignore`.

> Note: make sure the ignore file setting is enabled (on by default) by going to the **Settings** page > **Indexing** sub-page.
