# Code Editing

Dyad supports multiple strategies for code editing.

## Whole file edits

This approach uses two [types of models](./models.md#model-types): first, the core model to write a draft of the code changes, while commenting unchanged code as such (e.g. `# keep code the same`). This approach was popularized by Cursor with their Fast Apply feature.

This is the recommended file editing approach when considering the combination of cost, speed and reliability. The main downside is that it can be quite slow _unless_ you use a fast model provider like Groq.

## Regionalized edits

???+ warning "Experimental feature"

This approach uses an AST parser ([Tree Sitter](https://tree-sitter.github.io/tree-sitter/)) to annotate a source code file into regions (e.g. classes, functions, and methods are marked as discrete regions and sub-regions) so that (in theory) only the edited regions need to be updated.

However, this approach has been quite unreliable because LLMs have difficulty following the instructions.
