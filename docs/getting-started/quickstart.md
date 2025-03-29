# Quickstart

If you haven't installed Dyad yet, please read our [installation guide](index.md).

In your terminal, go to the root of your Git repo and open Dyad:

```shell
cd ~/GitHub/repo
dyad .
```

You should have the URL ["http://localhost:8605](http://localhost:8605/) automatically opened up and see a UI that looks like the following:

<img src="/assets/screenshots/home.png" class="screenshot">

## Setup model

The first thing that you will need to do is setup LLM provider access (e.g. OpenAI, Anthropic Claude, Google Gemini). In the middle of the home screen, you can see a few of the most popular LLM providers to setup access for.

If you already have LLM provider API keys set as environmental variables (e.g. `OPENAI_API_KEY`), then you can skip to the next step.

If you haven't setup API keys with any LLM providers yet, I recommend using [Google AI Studio to setup a Gemini API key](https://aistudio.google.com/apikey) because it's free with fairly generous usage limits. Once you've gotten your API key, you can paste it in as a setting.

> Note: you can also set it as an environmental variable, e.g. `GEMINI_API_KEY`, load your environmental variables (e.g. `source ~/.zshrc`) and start Dyad again.

???+ tip "Want to skip the hassle of setting up API keys?"
Check out [Dyad Pro](https://www.dyad.sh/#plans) for a one-stop shop to get access to all the leading models.

By default, Dyad will use one of the models that you've setup an API key for, but if you want to select the specific model, you can click on the model names on the chat input (middle of the bottom), which will open up a model picker dialog.

For more information, such as connecting to a local model (e.g. ollama), please read the [models docs](../features/models.md).

## Chatting

You can start chatting with the model you've setup by typing into the chat input. Try something like "write a haiku" and see what you get.

If you've used any of the popular chat UIs like ChatGPT, then Dyad's chat interface will be familiar.

### Referencing a file

You can reference a file in your workspace by typing `#` into the chat input. You will see an autocomplete which will suggest the files in your codebase.

<img src="/assets/screenshots/autocomplete.png" class="screenshot">

For more information on which files are suggested, please read our [indexing deep dive](../features/indexing.md)

## Editing a file

If you want to edit a file, you can click on "Apply" at the top of the markdown code block (only when the file is done being generated) or clicking on "Apply all" in the right-hand sidebar to apply changes for all the code blocks in the latest chat message.

<img src="/assets/screenshots/apply-entrypoints.png" class="screenshot">

## Next steps

Congratulations on learning how to use Dyad! To learn more, we recommend reading through the feature guides:

[Features](../features/index.md){: .next-step}
