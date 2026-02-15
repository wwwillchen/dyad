import { describe, expect, it, vi } from "vitest";
import { wrapOpenAIResponsesModelWithForkedReasoningSupport } from "../ipc/utils/llm_engine_provider";

describe("wrapOpenAIResponsesModelWithForkedReasoningSupport", () => {
  it("appends reasoning input items when reasoning parts have no itemId", async () => {
    const getArgs = vi.fn().mockResolvedValue({
      args: {
        input: [
          { role: "user", content: [{ type: "input_text", text: "hello" }] },
        ],
      },
      warnings: [
        {
          type: "other",
          message:
            "Non-OpenAI reasoning parts are not supported. Skipping reasoning part: {}",
        },
      ],
    });

    const model = {
      getArgs,
      doGenerate: vi.fn(),
      doStream: vi.fn(),
    } as any;

    const wrapped = wrapOpenAIResponsesModelWithForkedReasoningSupport(
      model,
    ) as any;
    const result = await wrapped.getArgs({
      prompt: [
        {
          role: "assistant",
          content: [
            {
              type: "reasoning",
              text: "I should inspect the repository first.",
            },
          ],
        },
      ],
    });

    expect(result.args.input).toHaveLength(2);
    expect(result.args.input[1]).toEqual({
      type: "reasoning",
      id: "dyad_reasoning_0_0",
      summary: [
        {
          type: "summary_text",
          text: "I should inspect the repository first.",
        },
      ],
    });
    expect(result.warnings).toEqual([]);
  });

  it("keeps reasoning with existing itemId untouched", async () => {
    const getArgs = vi.fn().mockResolvedValue({
      args: {
        input: [
          { role: "user", content: [{ type: "input_text", text: "hello" }] },
        ],
      },
      warnings: [{ type: "other", message: "keep me" }],
    });

    const model = {
      getArgs,
      doGenerate: vi.fn(),
      doStream: vi.fn(),
    } as any;

    const wrapped = wrapOpenAIResponsesModelWithForkedReasoningSupport(
      model,
    ) as any;
    const result = await wrapped.getArgs({
      prompt: [
        {
          role: "assistant",
          content: [
            {
              type: "reasoning",
              text: "I already have an id.",
              providerOptions: { openai: { itemId: "rs_existing" } },
            },
          ],
        },
      ],
    });

    expect(result.args.input).toHaveLength(1);
    expect(result.warnings).toEqual([{ type: "other", message: "keep me" }]);
  });
});
