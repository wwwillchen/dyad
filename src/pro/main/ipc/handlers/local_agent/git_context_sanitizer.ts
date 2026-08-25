import type { ModelMessage } from "ai";

const GIT_CONTEXT_TAG_MARKERS = [
  "<dyad-git-context",
  "</dyad-git-context",
] as const;
const MAX_TAG_MARKUP_LENGTH = 256;

/**
 * Removes internal Git-context tag markup without exposing partial tags while
 * model text is streaming. Text between an opening and closing tag is
 * preserved; only the internal markup itself is metadata.
 */
export class GitContextEchoSanitizer {
  private pending = "";

  push(chunk: string): string {
    this.pending += chunk;
    let output = "";

    while (this.pending.length > 0) {
      const markerIndex = findNextMarkerIndex(this.pending);
      if (markerIndex === -1) {
        const heldSuffixLength = getPotentialMarkerSuffixLength(this.pending);
        const emitLength = this.pending.length - heldSuffixLength;
        output += this.pending.slice(0, emitLength);
        this.pending = this.pending.slice(emitLength);
        break;
      }

      output += this.pending.slice(0, markerIndex);
      this.pending = this.pending.slice(markerIndex);

      const tagEndIndex = this.pending.indexOf(">");
      if (tagEndIndex === -1) {
        if (this.pending.length > MAX_TAG_MARKUP_LENGTH) {
          output += this.pending;
          this.pending = "";
        }
        break;
      }
      this.pending = this.pending.slice(tagEndIndex + 1);
    }

    return output;
  }

  finish(): string {
    const pending = this.pending;
    this.pending = "";
    return startsWithDistinctivePartialMarker(pending) ? "" : pending;
  }
}

export function stripGitContextEchoes(text: string): string {
  const sanitizer = new GitContextEchoSanitizer();
  return sanitizer.push(text) + sanitizer.finish();
}

export function stripGitContextEchoesFromAssistantMessages(
  messages: ModelMessage[],
): ModelMessage[] {
  return messages.flatMap((message) => {
    if (message.role !== "assistant") {
      return [message];
    }

    if (typeof message.content === "string") {
      const content = stripGitContextEchoes(message.content);
      return content.length > 0 ? [{ ...message, content }] : [];
    }

    const sanitizer = new GitContextEchoSanitizer();
    const sanitizedTextByIndex = new Map<number, string>();
    let lastSanitizedPartIndex = -1;

    message.content.forEach((part, index) => {
      if (part.type === "text" || part.type === "reasoning") {
        sanitizedTextByIndex.set(index, sanitizer.push(part.text));
        lastSanitizedPartIndex = index;
      }
    });

    if (lastSanitizedPartIndex !== -1) {
      const trailingText = sanitizer.finish();
      sanitizedTextByIndex.set(
        lastSanitizedPartIndex,
        (sanitizedTextByIndex.get(lastSanitizedPartIndex) ?? "") + trailingText,
      );
    }

    const content: typeof message.content = [];
    message.content.forEach((part, index) => {
      if (part.type !== "text" && part.type !== "reasoning") {
        content.push(part);
        return;
      }
      const text = sanitizedTextByIndex.get(index) ?? "";
      if (text.length > 0) {
        content.push({ ...part, text });
      }
    });

    return content.length > 0 ? [{ ...message, content } as ModelMessage] : [];
  });
}

function findNextMarkerIndex(text: string): number {
  const normalized = foldAsciiCase(text);
  let earliest = -1;
  for (const marker of GIT_CONTEXT_TAG_MARKERS) {
    let searchFrom = 0;
    while (searchFrom < normalized.length) {
      const index = normalized.indexOf(marker, searchFrom);
      if (index === -1) {
        break;
      }
      if (isTagBoundary(normalized[index + marker.length])) {
        if (earliest === -1 || index < earliest) {
          earliest = index;
        }
        break;
      }
      searchFrom = index + 1;
    }
  }
  return earliest;
}

function getPotentialMarkerSuffixLength(text: string): number {
  const normalized = foldAsciiCase(text);
  const maxLength = Math.min(
    normalized.length,
    Math.max(...GIT_CONTEXT_TAG_MARKERS.map((marker) => marker.length - 1)),
  );

  for (let length = maxLength; length > 0; length -= 1) {
    const suffix = normalized.slice(-length);
    if (GIT_CONTEXT_TAG_MARKERS.some((marker) => marker.startsWith(suffix))) {
      return length;
    }
  }
  return 0;
}

function startsWithDistinctivePartialMarker(text: string): boolean {
  const normalized = foldAsciiCase(text);
  const minimumDistinctivePrefix = "<dyad-git";
  return (
    normalized.length >= minimumDistinctivePrefix.length &&
    GIT_CONTEXT_TAG_MARKERS.some(
      (marker) =>
        normalized.length < marker.length && marker.startsWith(normalized),
    )
  );
}

function foldAsciiCase(text: string): string {
  return text.replace(/[A-Z]/g, (character) => character.toLowerCase());
}

function isTagBoundary(character: string | undefined): boolean {
  return (
    character === undefined ||
    character === ">" ||
    character === "/" ||
    /\s/.test(character)
  );
}
