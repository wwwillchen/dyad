import { describe, expect, it } from "vitest";
import {
  mergeRejectedPromptIntoChatDraft,
  mergeRejectedAttachmentsIntoChatDraft,
  removeSubmittedFirstPromptAttachments,
} from "./editing_buffer";

describe("first prompt editing buffer", () => {
  it("moves rejected files to the destination while preserving newer and other-chat drafts", () => {
    const attachment = (name: string) => ({
      file: new File([name], name),
      type: "chat-context" as const,
    });
    const submitted = attachment("submitted.txt");
    const newerHome = attachment("new-home.txt");
    const newerChat = attachment("new-chat.txt");
    const otherChat = attachment("other-chat.txt");
    const drafts = new Map([
      [7, [newerChat]],
      [8, [otherChat]],
    ]);
    const restored = mergeRejectedAttachmentsIntoChatDraft(drafts, 7, [
      submitted,
    ]);
    expect(restored.get(7)).toEqual([submitted, newerChat]);
    expect(restored.get(8)).toBe(drafts.get(8));
    expect(drafts.get(7)).toEqual([newerChat]);
    expect(
      removeSubmittedFirstPromptAttachments(
        [submitted, newerHome],
        [submitted],
      ),
    ).toEqual([newerHome]);
    expect(
      mergeRejectedAttachmentsIntoChatDraft(restored, 7, [submitted]),
    ).toBe(restored);
  });

  it("restores attachment-only first prompts into an empty destination", () => {
    const submitted = [
      { file: new File(["image"], "image.png"), type: "chat-context" as const },
    ];
    expect(
      mergeRejectedAttachmentsIntoChatDraft(new Map(), 7, submitted).get(7),
    ).toEqual(submitted);
    const drafts = new Map();
    expect(mergeRejectedAttachmentsIntoChatDraft(drafts, 7, [])).toBe(drafts);
  });
  it("keeps a newer destination draft alongside the rejected prompt", () => {
    const current = new Map([[7, "new destination draft"]]);

    expect(
      mergeRejectedPromptIntoChatDraft(current, 7, "rejected first prompt").get(
        7,
      ),
    ).toBe("rejected first prompt\n\nnew destination draft");
  });

  it("removes accepted attachments while retaining newer attachments", () => {
    const acceptedFile = new File(["accepted"], "accepted.txt");
    const newerFile = new File(["newer"], "newer.txt");
    const acceptedAttachment = {
      file: acceptedFile,
      type: "chat-context" as const,
    };
    const newerAttachment = {
      file: newerFile,
      type: "chat-context" as const,
    };

    expect(
      removeSubmittedFirstPromptAttachments(
        [acceptedAttachment, newerAttachment],
        [acceptedAttachment],
      ),
    ).toEqual([newerAttachment]);
  });
});
