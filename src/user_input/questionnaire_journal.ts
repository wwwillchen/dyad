import { mkdir, readFile, writeFile, rename, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { UserInputQuestionSchema } from "@/ipc/types/user_input";
import { getUserDataPath } from "@/paths/paths";
import type { UserInputQuestion, UserInputParkValue } from "./state";

export interface QuestionnaireReceipt {
  requestId: string;
  chatId: number;
  questions: UserInputQuestion[];
  outcome: "pending" | "answered" | "dismissed" | "interrupted";
  answers?: Record<string, string>;
}
const receiptSchema = z.object({
  requestId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  chatId: z.number().int(),
  questions: z.array(UserInputQuestionSchema).min(1).max(5),
  outcome: z.enum(["pending", "answered", "dismissed", "interrupted"]),
  answers: z.record(z.string(), z.string()).optional(),
});
const directory = () => path.join(getUserDataPath(), "questionnaire-receipts");
function file(requestId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(requestId))
    throw new Error("Invalid questionnaire identity");
  return path.join(directory(), `${requestId}.json`);
}
export async function persistQuestionnaire(receipt: QuestionnaireReceipt) {
  receiptSchema.parse(receipt);
  await mkdir(directory(), { recursive: true });
  const destination = file(receipt.requestId);
  await writeFile(destination + ".tmp", JSON.stringify(receipt), {
    mode: 0o600,
  });
  await rename(destination + ".tmp", destination);
}
export async function settleQuestionnaire(
  requestId: string,
  value: UserInputParkValue | null,
) {
  let receipt: QuestionnaireReceipt;
  try {
    receipt = receiptSchema.parse(
      JSON.parse(await readFile(file(requestId), "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (receipt.outcome !== "pending") return;
  const answers = value?.kind === "questionnaire" ? value.answers : null;
  await persistQuestionnaire({
    ...receipt,
    outcome: answers ? "answered" : value ? "dismissed" : "interrupted",
    ...(answers ? { answers } : {}),
  });
}
/** A dead MCP request is never replayed. Its durable human outcome becomes
 * context for a fresh CLI session, not permission to repeat operations. */
export async function recoverQuestionnaires(
  chatId: number,
): Promise<QuestionnaireReceipt[]> {
  let names: string[];
  try {
    names = await readdir(directory());
  } catch {
    return [];
  }
  const receipts: QuestionnaireReceipt[] = [];
  for (const name of names.filter((name) => name.endsWith(".json"))) {
    let receipt: QuestionnaireReceipt;
    try {
      receipt = receiptSchema.parse(
        JSON.parse(await readFile(path.join(directory(), name), "utf8")),
      );
    } catch {
      continue;
    }
    if (receipt.chatId !== chatId) continue;
    if (receipt.outcome === "pending") {
      receipt.outcome = "interrupted";
      await persistQuestionnaire(receipt);
    }
    receipts.push(receipt);
  }
  return receipts.slice(-50);
}
