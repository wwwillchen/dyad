import type { FirstPromptAttachment } from "./state";

export function removeSubmittedFirstPromptAttachments(
  current: readonly FirstPromptAttachment[],
  submitted: readonly FirstPromptAttachment[],
): FirstPromptAttachment[] {
  const remaining = [...current];
  for (const submittedAttachment of submitted) {
    const index = remaining.findIndex(
      (attachment) =>
        attachment.file === submittedAttachment.file &&
        attachment.type === submittedAttachment.type,
    );
    if (index !== -1) remaining.splice(index, 1);
  }
  return remaining;
}

export function mergeRejectedPromptIntoChatDraft(
  current: Map<number, string>,
  chatId: number,
  rejectedPrompt: string,
): Map<number, string> {
  if (!rejectedPrompt) return current;
  const destinationDraft = current.get(chatId);
  if (destinationDraft === rejectedPrompt) return current;

  const next = new Map(current);
  next.set(
    chatId,
    destinationDraft
      ? `${rejectedPrompt}\n\n${destinationDraft}`
      : rejectedPrompt,
  );
  return next;
}

export function mergeRejectedAttachmentsIntoChatDraft(
  current: Map<number, FirstPromptAttachment[]>,
  chatId: number,
  submitted: readonly FirstPromptAttachment[],
): Map<number, FirstPromptAttachment[]> {
  const destination = current.get(chatId) ?? [];
  const missing = submitted.filter(
    (attachment) =>
      !destination.some(
        (existing) =>
          existing.file === attachment.file &&
          existing.type === attachment.type,
      ),
  );
  if (missing.length === 0) return current;
  const next = new Map(current);
  next.set(chatId, [...missing, ...destination]);
  return next;
}
