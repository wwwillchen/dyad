# Models

Dyad is LLM-agnostic, which means you can use any language model (LLM) that you want, including local ones.

## Setting up models

You can configure models with the popular LLM providers using the [home screen](../getting-started/quickstart.md#setup-model) or by going to the **Settings page** and going to the **Models & Providers** sub-page, which will look like this:

<img src="/assets/screenshots/settings-models-and-providers.png" class="screenshot">

### Local models

If you want to connect Dyad to a local model, Dyad supports [ollama](https://ollama.com/) out of the box. If you run ollama on the default host http://localhost:11434, then it will work.

To connect to a specific ollama model, please follow the next section on [Custom models](#custom-models).

### Custom models

Although Dyad supports most of the popular models, you may want to add support for a custom model or another LLM provder. You can do this in the **Models & Providers** settings sub-page.

To add another LLM provider, click on the **Add provider** button and fill out the dialog.

> Note: the LLM provider must be OpenAI-API compatible (which almost all LLM providers are). If not, you will need to create a [custom extension](../extensions/index.md).

## Model types

Dyad gives you the flexibility for using different models, depending on the use case. Dyad has the following types of models:

- **Core**: the main workhorse and will be the primary model for generating responses. Examples: Claude Sonnet 3.5
- **Editor**: typically a faster and cheaper model which is used to apply code edit changes (usually) proposed by the Core model. Examples: Groq Llama 3.3 70B
- **Router**: used to determine which tool to use and format the LLM output using the expected schema. Example: Gemini Flash 2.0
- **Reasoner**: intended for difficult code changes, particularly involving algorithmic changes. Examples: o3-mini
