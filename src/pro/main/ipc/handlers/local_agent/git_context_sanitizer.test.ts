import { describe, expect, it } from "vitest";

import {
  GitContextEchoSanitizer,
  stripGitContextEchoes,
  stripGitContextEchoesFromAssistantMessages,
} from "./git_context_sanitizer";

describe("GitContextEchoSanitizer", () => {
  it("strips an echoed Git-context tag split across stream chunks", () => {
    const sanitizer = new GitContextEchoSanitizer();

    const output = [
      sanitizer.push("Done.<dyad-git-con"),
      sanitizer.push('text commit="fake">'),
      sanitizer.push("</dyad-git-context>"),
      sanitizer.finish(),
    ].join("");

    expect(output).toBe("Done.");
  });

  it("preserves ordinary text around internal tag markup", () => {
    expect(
      stripGitContextEchoes(
        'Before <dyad-git-context commit="fake">unexpected</dyad-git-context> after',
      ),
    ).toBe("Before unexpected after");
  });

  it("does not strip similarly named user text", () => {
    expect(stripGitContextEchoes("Use <dyad-git-contextual> here.")).toBe(
      "Use <dyad-git-contextual> here.",
    );
  });

  it("preserves unterminated prose instead of buffering it without bound", () => {
    const sanitizer = new GitContextEchoSanitizer();
    const prose = `<dyad-git-context ${"ordinary prose ".repeat(24)}`;

    expect(sanitizer.push(prose)).toBe(prose);
    expect(sanitizer.finish()).toBe("");
  });

  it("keeps marker indexes aligned after Unicode with expanding lowercase forms", () => {
    expect(
      stripGitContextEchoes(
        'İ<dyad-git-context commit="fake"></dyad-git-context>after',
      ),
    ).toBe("İafter");
  });

  it("drops a distinctive internal tag fragment if the stream ends", () => {
    const sanitizer = new GitContextEchoSanitizer();

    expect(sanitizer.push("Done.<dyad-git-con")).toBe("Done.");
    expect(sanitizer.finish()).toBe("");
  });

  it("removes echoes from assistant message text only", () => {
    const tag = '<dyad-git-context commit="fake"></dyad-git-context>';
    const messages = stripGitContextEchoesFromAssistantMessages([
      { role: "user", content: `User literal: ${tag}` },
      {
        role: "assistant",
        content: [
          { type: "text", text: `Finished.${tag}` },
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "read_file",
            input: {},
          },
        ],
      },
    ]);

    expect(messages[0]).toEqual({
      role: "user",
      content: `User literal: ${tag}`,
    });
    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: [
        { type: "text", text: "Finished." },
        { type: "tool-call", toolCallId: "call-1" },
      ],
    });
  });

  it("sanitizes tags split across assistant text parts", () => {
    const messages = stripGitContextEchoesFromAssistantMessages([
      {
        role: "assistant",
        content: [
          { type: "text", text: "Before <dyad-git-con" },
          { type: "text", text: 'text commit="fake">inside</dyad-git-' },
          { type: "text", text: "context> after" },
        ],
      },
    ]);

    expect(messages).toEqual([
      {
        role: "assistant",
        content: [
          { type: "text", text: "Before " },
          { type: "text", text: "inside" },
          { type: "text", text: " after" },
        ],
      },
    ]);
  });

  it("sanitizes reasoning parts and drops empty assistant content", () => {
    const tag = '<dyad-git-context commit="fake"></dyad-git-context>';
    const messages = stripGitContextEchoesFromAssistantMessages([
      { role: "assistant", content: tag },
      {
        role: "assistant",
        content: [{ type: "text", text: tag }],
      },
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: `Consider.${tag}` },
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "read_file",
            input: {},
          },
          { type: "text", text: tag },
        ],
      },
    ]);

    expect(messages).toEqual([
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "Consider." },
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "read_file",
            input: {},
          },
        ],
      },
    ]);
  });
});
