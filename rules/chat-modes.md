# Chat modes

- Always prefer Agent mode (`local-agent`) over legacy Build mode (`build`) when adding new features or updating existing features that select or create a writable chat mode. Use Build only as an explicit fallback when Agent is unavailable (for example, exhausted quota) or when a documented legacy-only constraint requires it; reuse the centralized mode-resolution logic instead of adding feature-specific entitlement or quota checks.
