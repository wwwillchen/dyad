# Extension FAQ

## What kind of extensions can I use?

There's many possibilities for extensions because they allow you to create your own agent (aka bot). For example, you could create an agent with a custom tool which looks up information in your team's internal wiki. This could be a powerful way of augmenting LLM with private, contextual information to get better results.

You can even create non-coding related agents, for example, answering messages on X or looking up relevant posts on Reddit.

## Is the extension API stable?

We are actively developing the extension API, but we will give advanced deprecation notice (at least one version) before removing an extension API.

???+ note "Public API"

    Only use `import dyad` to import the Dyad extension API (this is what's shown in the docs and examples).

    If you try to import anything else (e.g. `import dyad.sub_package.foo`), these can break at any time and are considered internal implementation details of Dyad. If there's something not exposed in the main Dyad namespace, please file an issue on GitHub, and we can discuss exposing it as a public API.
