# User-app test isolation (Tests panel)

Applies to `src/ipc/services/isolated_test_db.ts`, `test_case_lifecycle_server.ts`, `src/ipc/utils/supabase_test_user.ts`, `neon_test_data.ts`, and the generated Playwright fixture shim in `playwright_bootstrap.ts`.

- **Discover cleanup targets from `pg_class`, not `information_schema.columns`.** The latter also lists views, and `DELETE` on a non-updatable view fails with `55000 cannot delete from view` (seen in user logs as `Best-effort cleanup of public.<view>... failed`). Filter `c.relkind IN ('r', 'p') AND NOT c.relispartition`, as `neon_test_data.ts` and `supabase_test_user.ts` do.
- **Per-test lifecycle work runs before every test case, so each Management API round trip multiplies.** Batch per-table SQL into one `DO` block, giving each statement its own `BEGIN … EXCEPTION WHEN others … END` so one failing table does not roll back the others.
- **The per-test timeouts are nested and must move together:** server hook (`TEST_CASE_HOOK_TIMEOUT_MS`) < fixture `fetch` (`TEST_CASE_REQUEST_TIMEOUT_MS`) < Playwright fixture timeout (`TEST_CASE_FIXTURE_TIMEOUT_MS`), all derived in `test_case_lifecycle_server.ts`. Raising only the server value just turns a clear timeout error into a bare client abort. The fixture shim is regenerated on every run (while it carries the Dyad sentinel), so shim-side changes need no config migration.
