import { ConsoleEntrySchema } from "@/ipc/types/supabase";
import { formatLogsForAI } from "@/shared/format_logs";
import { escapeXmlAttr, escapeXmlContent } from "../../../../shared/xmlEscape";
import type { ClaudeToolCard } from "../../../shared/claude_tool_cards";

const LIMIT = 12_000;
const TRUNCATED = "\n… (display truncated)";
function text(value: unknown, limit = LIMIT): string {
  const str = typeof value === "string" ? value : "";
  return str.length > limit ? str.slice(0, limit) + TRUNCATED : str;
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function resultText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value
      .filter((v) => object(v).type === "text")
      .map((v) =>
        typeof object(v).text === "string" ? (object(v).text as string) : "",
      )
      .join("\n");
  return "";
}
function decode(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
function displayPath(value: unknown, root: string): string {
  const path = text(value, 1000);
  const prefix = root.replace(/\\/g, "/").replace(/\/$/, "") + "/";
  if (path.replace(/\\/g, "/") === prefix.slice(0, -1)) return ".";
  return path.replace(/\\/g, "/").startsWith(prefix)
    ? path.replace(/\\/g, "/").slice(prefix.length)
    : path;
}

export function presentClaudeTool(
  name: string,
  rawInput: unknown,
  root: string,
): ClaudeToolCard | null {
  const input = object(rawInput);
  const base = { state: "pending" as const, body: "" };
  const path = displayPath(input.file_path, root);
  switch (name) {
    case "mcp__dyad__permission":
    case "EndConversation":
      return null;
    case "Read": {
      const offset =
        typeof input.offset === "number" && input.offset > 0
          ? input.offset
          : undefined;
      const limit =
        typeof input.limit === "number" && input.limit > 0
          ? input.limit
          : undefined;
      return {
        ...base,
        kind: "read",
        path,
        startLine: offset?.toString(),
        endLine: limit ? ((offset ?? 1) + limit - 1).toString() : undefined,
      };
    }
    case "Glob":
      return {
        ...base,
        kind: "list",
        path: displayPath(input.path, root) || ".",
        summary: text(input.pattern, 1000),
      };
    case "Write":
      return { ...base, kind: "write", path, body: text(input.content) };
    case "Edit":
      return {
        ...base,
        kind: "edit",
        path,
        summary: input.replace_all
          ? "Replace all matching occurrences"
          : undefined,
        blocks: [
          {
            searchContent: text(input.old_string, LIMIT / 2),
            replaceContent: text(input.new_string, LIMIT / 2),
          },
        ],
      };
    case "mcp__dyad__diagnostics":
      return { ...base, kind: "logs" };
    case "mcp__dyad__install_dependencies":
      return {
        ...base,
        kind: "packages",
        packages: text(
          Array.isArray(input.packages)
            ? input.packages.filter((p) => typeof p === "string").join(" ")
            : input.packages,
          2000,
        ),
      };
    case "mcp__dyad__type_check":
      return { ...base, kind: "status", title: "Type checking all files" };
    case "mcp__dyad__run_tests":
      return { ...base, kind: "status", title: "Running tests" };
    case "mcp__dyad__restart_preview":
      return { ...base, kind: "status", title: "Queueing preview restart" };
    default:
      return {
        ...base,
        kind: "status",
        title: text(name, 200),
        summary: text(input.description ?? input.query ?? input.file_path, 500),
      };
  }
}

export function completeClaudeTool(
  card: ClaudeToolCard,
  name: string,
  rawResult: unknown,
  isError: boolean,
  root: string,
): ClaudeToolCard {
  const raw = resultText(rawResult);
  const decoded =
    rawResult && !Array.isArray(rawResult) && typeof rawResult === "object"
      ? rawResult
      : decode(raw);
  const data = object(decoded);
  const error = isError || typeof data.error === "string";
  const result = {
    ...card,
    state: error ? "error" : "finished",
  } as ClaudeToolCard;
  const details = text(typeof decoded === "string" ? decoded : raw);
  if (error) {
    const reason = text(data.error ?? details, 2000) || "Tool execution failed";
    if (["read", "write", "edit", "list"].includes(card.kind))
      result.summary = reason;
    else result.body = reason;
    if (name === "mcp__dyad__type_check") result.title = "Type check failed";
    if (name === "mcp__dyad__run_tests") result.title = "Tests failed";
    if (name === "mcp__dyad__restart_preview")
      result.title = "Preview restart failed";
    return result;
  }
  switch (card.kind) {
    case "read": // File contents are deliberately not persisted in the card.
    case "write":
    case "edit":
    case "packages":
      return result;
    case "list": {
      const files = Array.isArray(decoded)
        ? decoded
        : Array.isArray(data.filenames)
          ? data.filenames
          : Array.isArray(data.files)
            ? data.files
            : raw.trim() && !/^No files found\.?$/i.test(raw.trim())
              ? raw.trim().split(/\r?\n/)
              : [];
      const paths = files.filter((v): v is string => typeof v === "string");
      const total =
        typeof data.numFiles === "number"
          ? Math.max(paths.length, data.numFiles)
          : paths.length;
      result.count = `${total}`;
      result.body = paths.length
        ? text(
            paths
              .slice(0, 20)
              .map((p) => ` - ${displayPath(p, root)}`)
              .join("\n") +
              (total > Math.min(paths.length, 20)
                ? `\n... and ${total - Math.min(paths.length, 20)} more paths (${total} total)`
                : `\n(${total} paths total)`),
          )
        : "";
      if (data.truncated === true || data._dyadMcpTruncation)
        result.body += TRUNCATED;
      return result;
    }
    case "logs": {
      if (Array.isArray(decoded)) {
        const entries = decoded.filter((v) => !object(v)._dyadMcpTruncation);
        const logs = entries.flatMap((v) => {
          const parsed = ConsoleEntrySchema.safeParse(v);
          return parsed.success &&
            Number.isFinite(new Date(parsed.data.timestamp).getTime())
            ? [parsed.data]
            : [];
        });
        const truncated =
          entries.length !== decoded.length || logs.length !== entries.length;
        const count = logs.filter((log) => !log.runtimeBoundary).length;
        result.count = String(count);
        result.body = logs.length
          ? text(formatLogsForAI(logs.slice(0, 50), count))
          : "";
        if (logs.length > 50 || truncated) result.body += TRUNCATED;
      } else result.body = details;
      return result;
    }
    case "status": {
      if (name === "mcp__dyad__restart_preview") {
        result.title = "Preview restart queued";
      } else if (name === "mcp__dyad__type_check") {
        const problems = Array.isArray(data.problems)
          ? data.problems
          : undefined;
        result.title =
          data.outcome === "incomplete" || data._dyadMcpTruncation
            ? "Type check incomplete"
            : problems
              ? problems.length
                ? "Type errors found"
                : "Type check passed"
              : "Type check incomplete";
        if (
          !problems ||
          data.outcome === "incomplete" ||
          data._dyadMcpTruncation
        )
          result.state = "warning";
        result.body = problems?.length
          ? text(
              problems
                .slice(0, 50)
                .map((v) => {
                  const p = object(v);
                  return `${text(p.file ?? p.filePath, 1000)}${typeof p.line === "number" ? `:${p.line}` : ""}${typeof p.column === "number" ? `:${p.column}` : ""}: ${text(p.message)}`;
                })
                .join("\n") + (problems.length > 50 ? TRUNCATED : ""),
            )
          : problems
            ? ""
            : details;
        if (data._dyadMcpTruncation) result.body += TRUNCATED;
      } else if (name === "mcp__dyad__run_tests") {
        result.state = data.aborted
          ? "aborted"
          : data.timedOut || data.code !== 0
            ? "error"
            : "finished";
        result.title = data.aborted
          ? "Tests interrupted"
          : data.timedOut
            ? "Tests timed out"
            : data.code === 0
              ? "Tests passed"
              : "Tests failed";
        result.body =
          typeof data.output === "string" ? text(data.output) : details;
      } else result.body = details;
      return result;
    }
  }
}

function serialize(id: string, card: ClaudeToolCard) {
  return `<dyad-claude-tool tool-use-id="${escapeXmlAttr(id)}">${escapeXmlContent(JSON.stringify(card))}</dyad-claude-tool>`;
}

// Keep the serialized card alongside the projection so updates replace exactly
// one call, including when identical tools run concurrently. Finished cards stay
// in the message and can be rendered without a live CLI session after reload.
export class ClaudeToolCards {
  private cards = new Map<
    string,
    { name: string; card: ClaudeToolCard; xml: string }
  >();
  start(
    content: string,
    id: string,
    name: string,
    input: unknown,
    root: string,
  ): string {
    if (this.cards.has(id)) return content;
    const card = presentClaudeTool(name, input, root);
    if (!card) return content;
    const xml = serialize(id, card);
    this.cards.set(id, { name, card, xml });
    return `${content}\n\n${xml}\n\n`;
  }
  complete(
    content: string,
    id: string,
    value: unknown,
    error: boolean,
    root: string,
    structuredResult?: unknown,
  ): string {
    const entry = this.cards.get(id);
    if (!entry || entry.card.state !== "pending") return content;
    return this.update(
      content,
      id,
      completeClaudeTool(
        entry.card,
        entry.name,
        entry.name === "Glob" && !error && structuredResult
          ? structuredResult
          : value,
        error,
        root,
      ),
    );
  }
  finish(content: string): string {
    for (const [id, entry] of this.cards) {
      if (entry.card.state === "pending")
        content = this.update(content, id, { ...entry.card, state: "aborted" });
    }
    return content;
  }
  private update(content: string, id: string, card: ClaudeToolCard): string {
    const entry = this.cards.get(id)!;
    const xml = serialize(id, card);
    const updated = content.replace(entry.xml, () => xml);
    this.cards.set(id, { ...entry, card, xml });
    return updated;
  }
}
