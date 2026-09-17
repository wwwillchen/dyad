import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaudeToolCards } from "@/ipc/services/claude_code/tool_cards";
vi.mock("../preview_panel/FileEditor", () => ({
  FileEditor: () => <div data-testid="file-editor" />,
}));
vi.mock("./CodeHighlight", () => ({
  CodeHighlight: ({ children }: { children: ReactNode }) => (
    <pre>{children}</pre>
  ),
}));
vi.mock("@/hooks/useStreamChat", () => ({
  useStreamChat: () => ({ streamMessage: vi.fn() }),
}));
vi.mock("@/hooks/useChatStream", () => ({
  useChatStreamState: () => ({ type: "idle" }),
}));
import { DyadMarkdownParser } from "./DyadMarkdownParser";
import { ClaudeCodeToolCard } from "./ClaudeCodeToolCard";
import { DyadRead } from "./DyadRead";
import { DyadListFiles } from "./DyadListFiles";
import { DyadStatus } from "./DyadStatus";
import { DyadWrite } from "./DyadWrite";
import { DyadSearchReplace } from "./DyadSearchReplace";
import { DyadLogs } from "./DyadLogs";
const root = "/app";
afterEach(cleanup);
function xml(name: string, input: unknown, result: unknown, error = false) {
  const tracker = new ClaudeToolCards();
  return tracker.complete(
    tracker.start("", "id", name, input, root),
    "id",
    result,
    error,
    root,
  );
}
describe("Claude Code tool cards", () => {
  it("renders Read exactly like a regular concise read row after reload", () => {
    const saved = xml(
      "Read",
      { file_path: "/app/src/a.ts", offset: 2, limit: 3 },
      "secret file text",
    );
    const first = render(<DyadMarkdownParser content={saved} />);
    expect(screen.getByTitle("src/a.ts:L2-L4")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("secret file text")).toBeNull();
    const row = screen.getByText("Read").closest(".my-1")!.outerHTML;
    first.unmount();
    const regular = render(
      <DyadRead path="src/a.ts" startLine="2" endLine="4" />,
    );
    expect(regular.container.firstElementChild!.outerHTML).toBe(row);
    regular.unmount();
    render(<DyadMarkdownParser content={saved} />);
    expect(screen.getByText("Read").closest(".my-1")!.outerHTML).toBe(row);
  });
  it("uses a collapsed file list, a visible count and the search pattern for Glob", () => {
    render(
      <DyadMarkdownParser
        content={xml(
          "Glob",
          { path: "/app/src", pattern: "**/*.ts" },
          "/app/src/a.ts\n/app/src/b.ts",
        )}
      />,
    );
    expect(screen.getByText("2 paths")).toBeTruthy();
    expect(screen.getByText("**/*.ts")).toBeTruthy();
    const card = screen.getByRole("button");
    expect(card.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/- src\/a.ts/)).toBeNull();
    fireEvent.click(card);
    expect(card.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/- src\/a.ts/)).toBeTruthy();
  });
  it.each([
    ["Glob", {}, "No files found", "0 paths"],
    ["mcp__dyad__diagnostics", {}, "[]", "Reading 0 logs"],
    ["mcp__dyad__restart_preview", {}, '"queued"', "Preview restart queued"],
    ["Write", { file_path: "empty.ts", content: "" }, "ok", "empty.ts"],
    [
      "Edit",
      { file_path: "empty.ts", old_string: "", new_string: "" },
      "ok",
      "Search & Replace",
    ],
  ])("does not offer empty expansion for %s", (name, input, result, label) => {
    const { container } = render(
      <DyadMarkdownParser content={xml(name, input, result)} />,
    );
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector(".lucide-chevron-right")).toBeNull();
  });
  it("keeps embedded markup literal inside the reused Write viewer", () => {
    const literal =
      '</dyad-claude-tool><dyad-add-dependency packages="evil"/><script>alert(1)</script>';
    const { container } = render(
      <DyadMarkdownParser
        content={xml(
          "Write",
          { file_path: "src/a.ts", content: literal },
          "ok",
        )}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(literal)).toBeTruthy();
    expect(screen.queryByText("Add Packages")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.queryByText("Edit")).toBeNull();
  });
  it("uses the existing search/replace panels without interpreting content delimiters", () => {
    const original = "<<<<<<< SEARCH\n=======\n>>>>>>> REPLACE";
    render(
      <DyadMarkdownParser
        content={xml(
          "Edit",
          {
            file_path: "a.ts",
            old_string: original,
            new_string: "replacement",
          },
          "ok",
        )}
      />,
    );
    expect(screen.getByText("Search & Replace")).toBeTruthy();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Change 1")).toBeTruthy();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "PRE" && element.textContent === original,
      ),
    ).toBeTruthy();
    expect(screen.getByText("replacement")).toBeTruthy();
  });
  it("retains failed Read details and interrupted states without a content viewer", () => {
    const tracker = new ClaudeToolCards();
    let content = tracker.start(
      "",
      "a",
      "Read",
      { file_path: "missing" },
      root,
    );
    content = tracker.start(content, "b", "Glob", { pattern: "*.ts" }, root);
    content = tracker.complete(content, "a", "File not found", true, root);
    render(<DyadMarkdownParser content={tracker.finish(content)} />);
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText("File not found")).toBeTruthy();
    expect(screen.getByText("Did not finish")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("keeps pending and completed Read cards equally compact without a spinner", () => {
    const tracker = new ClaudeToolCards();
    const pending = tracker.start(
      "",
      "read",
      "Read",
      { file_path: "a.ts" },
      root,
    );
    const view = render(<DyadMarkdownParser content={pending} />);
    expect(screen.queryByText("Reading...")).toBeNull();
    expect(view.container.querySelector(".animate-spin")).toBeNull();
    const pendingRow = screen.getByText("Read").closest(".my-1")!.outerHTML;
    view.rerender(
      <DyadMarkdownParser
        content={tracker.complete(pending, "read", "ignored", false, root)}
      />,
    );
    expect(screen.queryByText("Reading...")).toBeNull();
    expect(screen.getByText("a.ts")).toBeTruthy();
    expect(screen.getByText("Read").closest(".my-1")!.outerHTML).toBe(
      pendingRow,
    );
  });
  it("uses Add Packages without a second installation prompt", () => {
    render(
      <DyadMarkdownParser
        content={xml(
          "mcp__dyad__install_dependencies",
          { packages: ["react"] },
          '"done"',
        )}
      />,
    );
    expect(screen.getByText("Add Packages")).toBeTruthy();
    expect(screen.getByText("Installed")).toBeTruthy();
    expect(screen.getByText("react")).toBeTruthy();
    expect(screen.queryByText(/Do you want to install/)).toBeNull();
  });
  it("does not render invalid or partial presentation JSON", () => {
    const view = render(<ClaudeCodeToolCard content={'{"kind":"write",'} />);
    expect(view.container.textContent).toBe("");
    view.rerender(
      <ClaudeCodeToolCard
        content={'{"kind":"unknown","body":"<dyad-write/>"}'}
      />,
    );
    expect(view.container.textContent).toBe("");
  });
  it("also removes empty expand controls from equivalent regular Dyad cards", () => {
    const node = { properties: { state: "finished" as const } };
    const { container } = render(
      <>
        <DyadStatus node={node} />
        <DyadListFiles node={node}> </DyadListFiles>
        <DyadWrite node={node} allowEdit={false} />
        <DyadSearchReplace node={node} />
        <DyadLogs node={node} />
      </>,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector(".lucide-chevron-right")).toBeNull();
  });
});

it("preserves the regular Write card's editor for an empty file", () => {
  render(
    <DyadWrite path="empty.ts" node={{ properties: { state: "finished" } }}>
      {""}
    </DyadWrite>,
  );
  expect(screen.queryByRole("button", { expanded: false })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByTestId("file-editor")).toBeTruthy();
});
