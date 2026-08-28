import { describe, expect, it } from "vitest";

import { normalizeGitContextHashes } from "../../e2e-tests/helpers/utils/normalization";

describe("Git context snapshot normalization", () => {
  it("normalizes final and source hashes recursively and idempotently", () => {
    const dump = {
      body: {
        input: [
          "<system-reminder>Previous assistant message created commit: 0123456789abcdef0123456789abcdef01234567.</system-reminder>",
          "<system-reminder>Previous assistant message created no commit. Repository commit before that message: abcdef0123456789abcdef0123456789abcdef01.</system-reminder>",
          '<dyad-git-context commit="0123456789abcdef0123456789abcdef01234567"></dyad-git-context>',
          {
            text: '<dyad-git-context source_commit="abcdef0123456789abcdef0123456789abcdef01" no_commit="true"></dyad-git-context>',
          },
        ],
      },
    };

    normalizeGitContextHashes(dump);
    const once = structuredClone(dump);
    normalizeGitContextHashes(dump);

    expect(dump).toEqual(once);
    expect(dump.body.input).toEqual([
      "<system-reminder>Previous assistant message created commit: [[GIT_COMMIT]].</system-reminder>",
      "<system-reminder>Previous assistant message created no commit. Repository commit before that message: [[GIT_COMMIT]].</system-reminder>",
      '<dyad-git-context commit="[[GIT_COMMIT]]"></dyad-git-context>',
      {
        text: '<dyad-git-context source_commit="[[GIT_COMMIT]]" no_commit="true"></dyad-git-context>',
      },
    ]);
  });
});
