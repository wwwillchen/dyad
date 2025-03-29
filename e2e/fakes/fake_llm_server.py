import json
import os
import time
from typing import TypedDict

from flask import Flask, Response, request

app = Flask(__name__)


class Message(TypedDict):
    role: str
    content: str


def error(message: str) -> str:
    error_response = {
        "error": {
            "message": message,
            "type": "server_error",
            "code": "internal_server_error",
        }
    }
    return f"data: {json.dumps(error_response)}\n\n"


def data(content: str) -> str:
    obj = {
        "choices": [
            {
                "delta": {
                    "role": "assistant",
                    "content": content,
                },
                "finish_reason": "stop",
            }
        ],
    }
    return f"data: {json.dumps(obj)}\n\n"


def read_file(file_path: str) -> str:
    with open(
        os.path.join(os.path.dirname(__file__), "testdata", file_path)
    ) as file:
        return file.read()


def generate_sse_openai(messages: list[Message]):
    last_message = messages[-1]
    if "#dir:parent_dir" in last_message["content"]:
        yield data("This is the input I received:" + last_message["content"])
        return
    if "[assert=no-code-search]" in last_message["content"]:
        if "search_codebase" in messages[0]["content"]:
            yield error("AssertionError: expected *no* code search tool")
            return
    if "[td=stream_limmerick]" in last_message["content"]:
        limmerick_content = read_file("stream_limmerick.txt")
        chunk_size = 4
        for i in range(0, len(limmerick_content), chunk_size):
            chunk = "".join(limmerick_content[i : i + chunk_size])
            if chunk:
                time.sleep(0.010)
                yield data(chunk)

        return
    if "[td=stream_markdown]" in last_message["content"]:
        markdown_content = read_file("stream_markdown.txt")
        chunk_size = 4
        for i in range(0, len(markdown_content), chunk_size):
            chunk = "".join(markdown_content[i : i + chunk_size])
            if chunk:
                time.sleep(0.010)
                yield data(chunk)

        return
    if "[td=stream_newlines]" in last_message["content"]:
        lines = read_file("stream_newlines.txt").split("\n")
        for line in lines:
            time.sleep(0.02)
            yield data(line + "\n")
        return
    if "[td=error_code_block]" in last_message["content"]:
        yield data("```typescript\nconst a = 1;\n")
        time.sleep(0.5)
        yield data("const b = a + 1;\n")
        time.sleep(0.5)
        yield data("```\n")
        return
    if "[td=create_file]" in last_message["content"]:
        yield data(read_file("create_file.txt"))
        return
    if "[td=create_file2]" in last_message["content"]:
        yield data(read_file("create_file2.txt"))
        return
    if "[td=generate_pad]" in last_message["content"]:
        pad_content = read_file("generate_pad.txt")
        chunk_size = 100
        for i in range(0, len(pad_content), chunk_size):
            chunk = "".join(pad_content[i : i + chunk_size])
            if chunk:
                time.sleep(0.010)
                yield data(chunk)
        return
    if "[td=edit1]" in last_message["content"]:
        yield data(read_file("edit1.txt"))
        return
    if "[td=edit_multifile]" in last_message["content"]:
        yield data(read_file("edit_multifile.txt"))
        return
    if "[td=edit_readme]" in last_message["content"]:
        yield data(read_file("edit_readme.txt"))
        return
    if "Given the original code:" in last_message["content"]:
        lines = last_message["content"].split("\n")
        yield data(
            lines[3].replace("MANUAL_EDIT", "[UPDATED_MANUAL_EDIT]")
            + "\n"
            + "[LLM_MODIFIED_CODE]"
        )
        return
    if "[test=(tool-call:edit_codebase)]" in last_message["content"]:
        if "<tool-definition" in messages[0]["content"]:
            yield data(read_file("edit_codebase-router-response.txt"))
        else:
            yield data(read_file("edit_codebase-final-response.txt"))
        return
    if "[test=(tool-call:search_codebase)]" in last_message["content"]:
        if "<tool-definition" in messages[0]["content"]:
            yield data(read_file("search_codebase-router-response.txt"))
        else:
            yield data(read_file("search_codebase-final-response.txt"))
        return
    if "[test=error]" in last_message["content"]:
        yield error("FAKE_SERVER_ERROR")
        return
    if "[test=fast]" in last_message["content"]:
        yield data("[fast]")
        return
    if "[test=fast-slow]" in last_message["content"]:
        yield data("[fast]")
        time.sleep(1)
        yield data("[slow]")
        return
    for i in range(5):
        response_data = {
            "choices": [
                {
                    "delta": {
                        "role": "assistant",
                        "content": f"This is chunk {i + 1}\n",
                    },
                    "finish_reason": None if i < 4 else "stop",
                }
            ],
        }

        yield f"data: {json.dumps(response_data)}\n\n"
        time.sleep(0.001)


@app.route("/v1/chat/completions", methods=["POST"])
def openai():
    req_data = request.get_json()
    messages = req_data["messages"]
    print("Received request:", req_data)
    return Response(generate_sse_openai(messages), mimetype="text/event-stream")


@app.route("/anthropic/v1/messages", methods=["POST"])
def anthropic():
    req_data = request.get_json()
    messages = req_data["messages"]
    print("Received request:", req_data)
    return Response(
        generate_sse_anthropic(messages), mimetype="text/event-stream"
    )


def generate_sse_anthropic(messages: list[Message]):
    message_start = {
        "type": "message_start",
        "message": {
            "id": "msg_1nZdL29xx5MUA1yADyHTEsnR8uuvGzszyY",
            "type": "message",
            "role": "assistant",
            "content": [],
            "model": "claude-3-5-sonnet-20241022",
            "stop_reason": None,
            "stop_sequence": None,
            "usage": {"input_tokens": 25, "output_tokens": 1},
        },
    }
    yield f"event: message_start\ndata: {json.dumps(message_start)}\n\n"

    content_block_start = {
        "type": "content_block_start",
        "index": 0,
        "content_block": {"type": "text", "text": ""},
    }
    yield f"event: content_block_start\ndata: {json.dumps(content_block_start)}\n\n"

    ping = {"type": "ping"}
    yield f"event: ping\ndata: {json.dumps(ping)}\n\n"

    content_delta1 = {
        "type": "content_block_delta",
        "index": 0,
        "delta": {"type": "text_delta", "text": "Hello"},
    }
    yield f"event: content_block_delta\ndata: {json.dumps(content_delta1)}\n\n"

    content_delta2 = {
        "type": "content_block_delta",
        "index": 0,
        "delta": {"type": "text_delta", "text": " (from fake Anthropic API)!"},
    }
    yield f"event: content_block_delta\ndata: {json.dumps(content_delta2)}\n\n"

    content_block_stop = {"type": "content_block_stop", "index": 0}
    yield f"event: content_block_stop\ndata: {json.dumps(content_block_stop)}\n\n"

    message_delta = {
        "type": "message_delta",
        "delta": {"stop_reason": "end_turn", "stop_sequence": None},
        "usage": {"output_tokens": 15},
    }
    yield f"event: message_delta\ndata: {json.dumps(message_delta)}\n\n"

    message_stop = {"type": "message_stop"}
    yield f"event: message_stop\ndata: {json.dumps(message_stop)}\n\n"


@app.route("/", methods=["GET"])
def home():
    return "OK", 200


if __name__ == "__main__":
    app.run(port=3000, debug=True)
