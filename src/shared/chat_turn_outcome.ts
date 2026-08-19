export const CHAT_TURN_TERMINAL_OUTCOMES = [
  "completed",
  "cancelled",
  "errored",
] as const;

export type ChatTurnTerminalOutcome =
  (typeof CHAT_TURN_TERMINAL_OUTCOMES)[number];
