import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import { streamText, stepCountIs, tool, type ModelMessage } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { z } from "zod";

describe("AI SDK step history contract", () => {
  it("preserves the original base and cumulative response tail after prepareStep overrides", async () => {
    const base: ModelMessage[] = [
      { role: "user", content: "Old request" },
      { role: "assistant", content: "Old answer" },
      { role: "user", content: "Current task" },
    ];
    const summary: ModelMessage = {
      role: "assistant",
      content: "Compacted summary",
    };
    let requests = 0;
    const model = new MockLanguageModelV3({
      doStream: async () => {
        requests += 1;
        return {
          stream: simulateReadableStream<LanguageModelV3StreamPart>({
            chunks: [
              { type: "stream-start", warnings: [] },
              {
                type: "tool-call",
                toolCallId: `call-${requests}`,
                toolName: "read_file",
                input: "{}",
              },
              {
                type: "finish",
                finishReason: { unified: "tool-calls", raw: "tool_calls" },
                usage: {
                  inputTokens: {
                    total: 1,
                    noCache: 1,
                    cacheRead: 0,
                    cacheWrite: 0,
                  },
                  outputTokens: { total: 1, text: 0, reasoning: 0 },
                },
              },
            ],
          }),
        };
      },
    });
    const seen: ModelMessage[][] = [];
    const result = streamText({
      model,
      messages: base,
      stopWhen: stepCountIs(3),
      tools: {
        read_file: tool({
          inputSchema: z.object({}),
          execute: async () => "file contents",
        }),
      },
      prepareStep: ({ messages }) => {
        seen.push(messages);
        return { messages: [base[2], summary, ...messages.slice(base.length)] };
      },
    });
    await result.consumeStream();
    expect(await result.steps).toHaveLength(3);
    expect(seen).toHaveLength(3);
    for (const [step, messages] of seen.entries()) {
      expect(messages).toHaveLength(base.length + step * 2);
      base.forEach((message, index) => expect(messages[index]).toBe(message));
      expect(messages).not.toContain(summary);
      expect(
        messages.slice(base.length).map((message) => message.role),
      ).toEqual(
        Array.from({ length: step }, () => ["assistant", "tool"]).flat(),
      );
    }
  });
});
