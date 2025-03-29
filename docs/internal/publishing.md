# Publishing

## Main packages

This guide is currently for publising a private release to GitHub.

1. **Bump version:**

Example command:

```sh
uv run scripts/bump_version.py --version 0.1.1
```

2. **Build pip packages:**

```sh
./scripts/build_pip.sh
```

3. **Install pip package:**

_preferred_:

```sh
uv pip install dist/*.whl --system
```

_alternative_:

Create a virtual environment and install the wheel:

```sh
uv venv && source .venv/bin/activate
```

```sh
pip install dist/*.whl --force-reinstall
```

4.  **Run dyad:**

You can now use dyad like this:

```sh
dyad .
```

Or:

```sh
uvx dyad .
```

5. **Release package:**

Once you follow the build steps and test it out locally, you can release the package to GitHub (later, pypi):

```sh
./scripts/release_pip.sh
```

## CLI package

The CLI package is special because it's versioned separately from all the other packages and should be upgraded fairly infrequently.

1. **Bump version:**

Example command:

```sh
uv run scripts/bump_version.py --version 0.1.1 --cli=true
```
