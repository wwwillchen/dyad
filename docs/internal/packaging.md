# Packaging

The main `dyad` package is actually a thin-wrapper to [uv](https://docs.astral.sh/uv/). It runs the main `dyad-app` package as a uv tool.

**Benefits:**

- Avoids polluting the main Python environment and avoids weird dependency issues.
- Ensures the latest Dyad version is being run.

The only minor downside is that it adds a small overhead (~20ms) to startup.

## Prior art

- https://github.com/Aider-AI/aider-install uses a similar pattern, although it does not directly run the main package, but only installs it. Aider itself has an update-checking mechanism.
