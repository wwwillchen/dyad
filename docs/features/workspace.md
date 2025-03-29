# Workspace

Workspace is the root directory from where you run Dyad.

For example, if your current working directory is `~/foo`, and you run `dyad .`, then `~/foo` is your workspace root.

You can only reference and edit files in your workspace.

If your workspace is a Git repo, then Dyad will respect your `.gitignore` files which means that files in gitignore are excluded from [[Indexing|indexing]].
