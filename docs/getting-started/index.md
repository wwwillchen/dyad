# Installing & Running

If you are familiar with setting up a Python environment, then run the following command in your terminal:

```shell
pip install dyad
```

Once, you have installed Dyad, you can run it in your current directory:

```shell
dyad .
```

This will launch the Dyad app in your default browser. Follow the in-app instructions or read the quickstart guide:

[Quickstart](./quickstart.md){: .next-step}

## Python environment

If you're not familiar with setting up a Python environment, we recommend you to use **uv** to install Dyad. **uv** is like a modern version of **pip** but faster and easier to use.

Install uv by following [their installation guide](https://docs.astral.sh/uv/getting-started/installation/).

Once, you have installed it, you can do:

```shell
uv pip install dyad
```

And then you can run Dyad from the CLI like this: `dyad .`.

???+ tip "Doesn't work?"

    If that doesn't work (e.g. you're running into a dependency issue), run this:
    ```shell
    uvx dyad .
    ```

    This download Dyad and run it in one command. See [uv tool docs](https://docs.astral.sh/uv/guides/tools/) for more details.

## Upgrading

To upgrade Dyad, run the following command:

```sh
pip install --upgrade dyad
```

## Next steps

Follow the quickstart guide to learn how to use Dyad:

[Quickstart](./quickstart.md){: .next-step}
