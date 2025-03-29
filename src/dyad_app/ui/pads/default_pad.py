# ruff: noqa: RUF001

DEFAULT_PAD_CONTENT = """
### What are Pads?

Pads are basically lightweight markdown documents with a few superpowers:

- **Reference** pads in the chat input. Type in “#pad:” (or “#p:” for short) to see pad suggestions. This is handy for including context like what your project is about or a feature spec.

- **Automatically include** pads into your chat context by clicking the **Configure** button and setting up glob rule (e.g. coding rules for a particular filetype / language) or prompt selection instructions (e.g. “use this pad when writing tests”)
    
- **Generate** pads from the chat. You can simply prompt it to say “create a pad” or if you’re trying to generate a lengthier response (e.g. a feature spec,  project plan) then Dyad will automatically know to create a pad.

### Tips

- You can **edit** the pad title by clicking on it and just start typing.

- Pads automatically save once you click on something else (e.g. blur).
""".strip()
