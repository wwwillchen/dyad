# Code References

You can reference an existing code file or the codebase in your [workspace](./workspace.md) by using code references.

## File reference

**Example:** `#file:path/to/file.py`

You can reference any of the files in your workspace.

???+ tip "Editing a file"
If you want to change a specific file, it's recommended to use the explicit file reference (vs. relying on the implicit related files search).

## Codebase

**Example:** `#codebase`

This will ensure the default agent searches the codebase before trying to edit the codebase.
See [indexing](./indexing.md) for more details on how it finds relevant files.

## Codebase (all)

**Example:** `#codebase-all`

Reference every code file in your workspace.

???+ warning "Use sparingly"
This can result in a very large number of input tokens! We recommend using a model like Gemini which has a very large context window. Also, this can result in significant costs so this should be used sparingly.

## File tree

**Example:** `#file-tree`

List out all the names of the files in your workspace in a tree-like format.
