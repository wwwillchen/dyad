# Dyad CLI

This package is special because it's not depended on by the root package (since this depends on the root package). This means that type-checking/IDE support don't work as expected.

## Run locally

```sh
DYAD_CLI_PACKAGE_NAME=mesop DYAD_APP_PACKAGE_NAME=mesop uv run --package dyad packages/dyad_cli/src/dyad_cli/__init__.py ~/mesop-demo/main.py
```

> Optional: env var - DYAD_APP_VERSION=0.14.0

## Run tests

```sh
uv run --package dyad pytest packages/dyad_cli/tests/test_dyad_cli.py
```
