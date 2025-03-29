# Build a Tool

A tool is essentially a Python function which is annnotated with `@dyad.tool`. The first two arguments are always 1. AgentContext and 2. Content, but then the rest of the arguments are dependent on your tool use case. Dyad parses the parameter names and types and function docstring to ensure that the arguments are formatted properly by the LLM when the tool is called.

## Weather tool

Let's walk through a simple weather tool example to understand the high-level structure of a tool. We will skip the actual weather API implementation since it's regular Python code and not specific to Dyad.

```python title="weather_tool.py"
--8<-- "examples/weather_tool.py"
```

## Calling other LLMs

You can also call other LLMs in your tool. Let's say you wanted to create a tool that took Python code and outputted JavaScript code. You can call an LLM inside your tool to do this.

```python title="code_translator_tool.py"
--8<-- "examples/code_translator_tool.py"
```

## More ideas

Because tools are essentially Python functions, what you can build is very open-ended. You can call GitHub APIs and fetch pull request contents, call Slack API and post messages, etc.
