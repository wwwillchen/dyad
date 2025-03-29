# Development

## Core app

### Setup

Setup pre-commit hook:

```sh
uvx pre-commit install
```

Setup env: (maybe can skip)

```sh
uv sync
```

> Tip: run `uv self update` to update `uv` to the latest version.

Install JS deps:

```sh
yarn
```

Then:

2. inside VS Code select Python interpreter at `./.venv`

### Run locally

In one terminal:

```sh
uv run mesop main.py
```

In another terminal:

```sh
npm run build:watch
```

> TIP: if you're not editing the monaco-related modules, you can use `BUNDLE` to only compile the modules needed which is much faster, e.g. `BUNDLE='prosemirror' npm run build:watch`.

#### Run locally with extensions

```sh
 ./scripts/run_with_extensions.sh
```

## Docs

```
mkdocs serve
```

## Extensions

If you're developing a new extension in this repo:

1. `cd packages`
1. `uv init $package_name --lib` (e.g. dyad_foo)

## Mesop

If you want to use a local Mesop pip package, then first build the Mesop pip package, and then do:

```sh
uv add "mesop @ /private/tmp/mesoprelease-test/mesop-$VERSION.whl"
```
