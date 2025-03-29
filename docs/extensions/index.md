# Extensions Overview

Dyad Extensions can be a Python package (e.g. something distributed via `pip install`) or as simple as a Python module (e.g. `extension.py`).

We recommend creating a Python package for larger, more reusable extensions, but to get started you can create a module extension.

## Module extensions

Module extensions are simply a Python file that is loaded when you launch Dyad. You pass in the path of the main module of your extension as a command-line flag, e.g.:

```shell
dyad . --extension=./foo.py
```

You can also pass in multiple files like this:

```shell
dyad . --extension=./bar/baz.py
```

## Package extensions

Package extensions are a Python package where the `pyproject.toml` has a Dyad entrypoint:

```toml
[project.entry-points."dyad.extensions"]
$package_name = "$package_name.__init__:activate"
```

`$package_name` should be replaced with the name of your package.

I recommend using [uv](https://docs.astral.sh/uv/) to create a Python package, which you can do by running:

```sh
uv init $package_name --lib
```

## Next steps

Now that you know how an extension is packaged, let's learn how to build one:

[Building an agent](build-an-agent.md){.next-step}
