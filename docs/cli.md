# Dyad CLI Reference

If you haven't installed the Dyad CLI, please follow our [getting started guide](./getting-started/index.md).

## Basics

### Opening a workspace

The most common command is to open a workspace, by running the following command in the terminal:

```sh
dyad
```

This will open Dyad using the current working directory as the workspace.

If you want to open another directory, you can pass in the path:

```sh
dyad ./path/to/dir
```

## Options

### Port

You can customize which port Dyad will run on by passing in `--port`. By default, Dyad will start on 8605 or if that's busy, pick a port number slightly higher.

### Log level

You can customize the logging level of Dyad by passing in `--log-level`. By default, Dyad will print warning logs in the terminal but you can access all the log messages through the Settings -> Log page.

### Do not launch browser

By default, Dyad will open the browser with the URL that Dyad is running on. If you don't want this behavior, you can pass in `--no-browser`

### Pin version

By default, Dyad will use the latest version published on PyPI. This makes it easy to get the latest updates (e.g. new models, features, and bugfixes), however if you want to pin to a specific version of Dyad, you can set the environmental variable: `DYAD_APP_VERSION` to a specific Dyad version.

## Extensions

### Refresh extensions

If you're developing extensions and have changed your extension configuration (e.g. pyproject.toml), you can refresh the extensions by passing in: `--refresh-extensions`.

???+ tip "Most extension changes can be reloaded in-browser"

      If you're changin the extension code (e.g. py files), then you can do a soft reload by opening the overflow menu in the top-right corner and clicking "Reload extensions". The keyboard shortcut is Ctrl (or Command for Mac) + Shift + E.

## Destructive operations

???+ warning "These will cause irreversible changes"

     These are generally not needed but can be helpful for debugging issues with Dyad.

### Reset workspace

You can reset your workspace data (e.g. chat conversations) by running the following command:

```sh
dyad --reset-workspace
```

This will reset the workspace data for the current working directory.

### Reset user data

You can reset your user data (e.g. settings) by running the following command:

```sh
dyad --reset-user-data
```
