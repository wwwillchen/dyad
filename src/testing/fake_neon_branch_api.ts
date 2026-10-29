import type { Api } from "@neondatabase/api-client";

/**
 * In-memory stand-in for the Neon branch API, modelling the branch-tree rules
 * verified against the live API for dyad-sh/dyad#4943:
 *
 * - Restoring a child branch from its own history makes the backup the
 *   branch's parent and moves the branch's children under the backup.
 * - Restoring a root branch from its own history makes the backup a separate
 *   root and keeps the children, but the restored branch stays a child of the
 *   backup until Neon detaches it (`detachAfterPolls` reads of the branch).
 * - Restoring from another branch makes that branch the parent.
 * - A branch with children cannot be deleted (422); names are unique (409);
 *   creating a root branch past the plan's root limit fails (422).
 *
 * The live behaviour is covered by neon_revert.live.integration.test.tsx.
 */

export interface FakeBranch {
  id: string;
  name: string;
  parent_id?: string;
  init_source: "parent-data" | "parent-schema";
  neonAuth: boolean;
  created_at: string;
}

export class FakeNeonApiError extends Error {
  response: { status: number; data: { code: string; message: string } };
  constructor(status: number, message: string, code = "") {
    super(`Request failed with status code ${status}`);
    this.response = { status, data: { code, message } };
  }
}

type Call = { method: string; args: unknown[] };

export class FakeNeonBranchApi {
  readonly projectId = "fake-project";
  readonly branches = new Map<string, FakeBranch>();
  readonly calls: Call[] = [];
  rootBranchLimit = 3;
  branchLimit = 10;
  /** Reads of a restored root branch that still report the backup as parent. */
  detachAfterPolls = 1;
  /** Override a method to inject failures, e.g. `failures.createProjectBranch`. */
  readonly failures: Partial<Record<string, (...args: any[]) => unknown>> = {};
  private nextId = 1;
  private pendingDetach = new Map<string, number>();

  addBranch(
    name: string,
    options: {
      parent?: string;
      schemaOnly?: boolean;
      neonAuth?: boolean;
    } = {},
  ): FakeBranch {
    const parentId = options.parent
      ? this.byName(options.parent).id
      : undefined;
    const branch: FakeBranch = {
      id: `br-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${this.nextId++}`,
      name,
      parent_id: options.schemaOnly ? undefined : parentId,
      init_source: options.schemaOnly ? "parent-schema" : "parent-data",
      neonAuth: options.neonAuth ?? false,
      created_at: new Date().toISOString(),
    };
    this.branches.set(branch.id, branch);
    return branch;
  }

  /** Completes every pending detach, as Neon eventually does. */
  finishDetach(): void {
    for (const id of this.pendingDetach.keys()) {
      this.get(id).parent_id = undefined;
    }
    this.pendingDetach.clear();
  }

  byName(name: string): FakeBranch {
    const branch = [...this.branches.values()].find((b) => b.name === name);
    if (!branch) throw new Error(`fake Neon: no branch named ${name}`);
    return branch;
  }

  /** `{ name: parentName | null }`, sorted by name, for readable assertions. */
  tree(): Record<string, string | null> {
    const entries = [...this.branches.values()]
      .map(
        (b) =>
          [
            b.name,
            b.parent_id ? (this.branches.get(b.parent_id)?.name ?? "?") : null,
          ] as const,
      )
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries);
  }

  connectionUri(branchId: string): string {
    return `postgresql://owner:secret@${branchId}.fake-neon.test/neondb`;
  }

  authBaseUrl(branchId: string): string {
    return `https://${branchId}.neonauth.fake-neon.test/neondb/auth`;
  }

  client(): Api<unknown> {
    const call = <T>(method: string, args: unknown[], run: () => T) => {
      this.calls.push({ method, args });
      const failure = this.failures[method];
      if (failure) {
        const result = failure(...args);
        if (result !== undefined) return result as T;
      }
      return run();
    };
    const api = {
      createProject: async (body: any) =>
        call("createProject", [body], () => {
          const main = this.addBranch("main");
          return {
            data: {
              project: { id: this.projectId, name: body.project?.name },
              branch: publicBranch(main),
              connection_uris: [
                { connection_uri: this.connectionUri(main.id) },
              ],
            },
          };
        }),
      deleteProject: async (projectId: string) =>
        call("deleteProject", [projectId], () => {
          this.branches.clear();
          return { data: { project: { id: projectId } } };
        }),
      listProjectBranches: async ({ projectId }: { projectId: string }) =>
        call("listProjectBranches", [projectId], () => ({
          data: { branches: [...this.branches.values()].map(publicBranch) },
        })),
      getProjectBranch: async (projectId: string, branchId: string) =>
        call("getProjectBranch", [projectId, branchId], () => {
          const branch = this.get(branchId);
          const remaining = this.pendingDetach.get(branchId);
          if (remaining !== undefined) {
            if (remaining <= 0) {
              branch.parent_id = undefined;
              this.pendingDetach.delete(branchId);
            } else {
              this.pendingDetach.set(branchId, remaining - 1);
            }
          }
          return { data: { branch: publicBranch(branch) } };
        }),
      createProjectBranch: async (projectId: string, body: any) =>
        call("createProjectBranch", [projectId, body], () => {
          const { name, parent_id, init_source } = body.branch ?? {};
          this.assertNameFree(name);
          if (this.branches.size >= this.branchLimit) {
            throw new FakeNeonApiError(422, "branches limit exceeded");
          }
          const schemaOnly = init_source === "schema-only";
          if (schemaOnly && this.rootCount() >= this.rootBranchLimit) {
            throw new FakeNeonApiError(
              422,
              "root branches limit exceeded",
              "ROOT_BRANCHES_LIMIT_EXCEEDED",
            );
          }
          const parent = this.get(parent_id);
          const branch = this.addBranch(name, {
            parent: parent.name,
            schemaOnly,
          });
          return {
            data: {
              branch: publicBranch(branch),
              connection_uris: [
                { connection_uri: this.connectionUri(branch.id) },
              ],
            },
          };
        }),
      updateProjectBranch: async (
        projectId: string,
        branchId: string,
        body: any,
      ) =>
        call("updateProjectBranch", [projectId, branchId, body], () => {
          const branch = this.get(branchId);
          if (body.branch?.name && body.branch.name !== branch.name) {
            this.assertNameFree(body.branch.name);
            branch.name = body.branch.name;
          }
          return { data: { branch: publicBranch(branch) } };
        }),
      deleteProjectBranch: async (projectId: string, branchId: string) =>
        call("deleteProjectBranch", [projectId, branchId], () => {
          this.get(branchId);
          const children = this.children(branchId);
          if (children.length > 0) {
            throw new FakeNeonApiError(
              422,
              `cannot delete branch that has children: ${children.map((c) => c.id).join(", ")}`,
            );
          }
          this.branches.delete(branchId);
          return { data: { branch: { id: branchId } } };
        }),
      restoreProjectBranch: async (
        projectId: string,
        branchId: string,
        body: any,
      ) =>
        call("restoreProjectBranch", [projectId, branchId, body], () => {
          const target = this.get(branchId);
          const source = this.get(body.source_branch_id);
          const children = this.children(target.id);
          const selfRestore = source.id === target.id;
          if (
            (selfRestore || children.length > 0) &&
            !body.preserve_under_name
          ) {
            throw new FakeNeonApiError(400, "preserve_under_name is required");
          }
          let backup: FakeBranch | undefined;
          if (body.preserve_under_name) {
            this.assertNameFree(body.preserve_under_name);
            backup = this.addBranch(body.preserve_under_name);
            backup.parent_id = target.parent_id;
            backup.init_source = target.init_source;
            backup.neonAuth = target.neonAuth;
          }
          if (selfRestore && !target.parent_id) {
            // Root: independent backup, children stay, detached later.
            target.parent_id = backup!.id;
            this.pendingDetach.set(target.id, this.detachAfterPolls);
          } else {
            for (const child of children) child.parent_id = backup!.id;
            target.parent_id = selfRestore ? backup!.id : source.id;
          }
          return { data: { branch: publicBranch(target) } };
        }),
      getNeonAuth: async (projectId: string, branchId: string) =>
        call("getNeonAuth", [projectId, branchId], () => {
          if (!this.get(branchId).neonAuth) {
            throw new FakeNeonApiError(404, "Neon Auth is not enabled");
          }
          return { data: { base_url: this.authBaseUrl(branchId) } };
        }),
      createNeonAuth: async (projectId: string, branchId: string) =>
        call("createNeonAuth", [projectId, branchId], () => {
          const branch = this.get(branchId);
          if (branch.neonAuth) {
            throw new FakeNeonApiError(409, "neon_auth schema already exists");
          }
          branch.neonAuth = true;
          return { data: { base_url: this.authBaseUrl(branchId) } };
        }),
      listProjectBranchRoles: async () => ({
        data: { roles: [{ name: "neondb_owner", protected: false }] },
      }),
      listProjectBranchDatabases: async () => ({
        data: { databases: [{ name: "neondb" }] },
      }),
      getConnectionUri: async ({ branch_id }: { branch_id: string }) => ({
        data: { uri: this.connectionUri(this.get(branch_id).id) },
      }),
      listBranchNeonAuthTrustedDomains: async () => ({
        data: { domains: [] },
      }),
      addBranchNeonAuthTrustedDomain: async () => ({ data: undefined }),
    };
    return api as unknown as Api<unknown>;
  }

  methodCalls(method: string): unknown[][] {
    return this.calls.filter((c) => c.method === method).map((c) => c.args);
  }

  private get(branchId: string): FakeBranch {
    const branch = this.branches.get(branchId);
    if (!branch)
      throw new FakeNeonApiError(404, `branch ${branchId} not found`);
    return branch;
  }

  private children(branchId: string): FakeBranch[] {
    return [...this.branches.values()].filter((b) => b.parent_id === branchId);
  }

  private rootCount(): number {
    return [...this.branches.values()].filter((b) => !b.parent_id).length;
  }

  private assertNameFree(name: string) {
    if ([...this.branches.values()].some((b) => b.name === name)) {
      throw new FakeNeonApiError(
        409,
        `branch already exists; branch_name:"${name}"`,
        "BRANCH_ALREADY_EXISTS",
      );
    }
  }
}

function publicBranch(branch: FakeBranch) {
  const { neonAuth: _neonAuth, ...rest } = branch;
  return { ...rest, project_id: "fake-project" };
}
