# E2E testing

# How to run

Start fake LLM server:

```sh
uv run e2e/fakes/fake_llm_server.py
```

Start Dyad server:

```sh
LLM_PROXY_BASE_URL=http://127.0.0.1:5000/v1 uv run src/dyad_app/cli/cli.py e2e/workspaces/simple_workspace --reset-workspace --user-data-dir=$(mktemp -d)
```

- Uses the Fake LLM server started above
- Opens a test workspace and resets it on startup
- Uses temp directory for user data dir

This creates a hermetic environment.
