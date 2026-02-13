# Architecture Migration Baseline

Created: February 12, 2026

This document captures the baseline used for the organization/maintainability
migration (Phase 0 and Phase 1).

## Repository size

- Tracked files in repository: `1473`
- Tracked files under `src/`: `574`
- Tracked files under `e2e-tests/`: `554`
- TypeScript/TSX lines under `src/`: `99922`

## Concentration risk

- `16` files in `src/` are `>= 800` lines (from the boundary check script).
- Largest files:
  - `src/ipc/handlers/app_handlers.ts` (`2031`)
  - `src/ipc/handlers/chat_stream_handlers.ts` (`1954`)
  - `src/components/preview_panel/PreviewIframe.tsx` (`1430`)
  - `src/ipc/handlers/github_handlers.ts` (`1419`)
  - `src/ipc/utils/git_utils.ts` (`1415`)
  - `src/components/GitHubConnector.tsx` (`1258`)
  - `src/components/chat/ChatInput.tsx` (`1204`)
  - `src/pro/main/ipc/handlers/local_agent/local_agent_handler.ts` (`1122`)

## Boundary baseline

- Renderer imports from `pro/main`: `0`
- Renderer imports from restricted runtime paths
  (`main`, `db`, `ipc/handlers`, `ipc/utils`, `supabase_admin`,
  `neon_admin`, `paths`, `pro/main`): `0`

Boundary enforcement is now automated by:

- `scripts/check-boundaries.js`
- `npm run check:boundaries`

## Tooling baseline (local run)

- `npm run ts`: `real 5.31s`
- `npm run lint`: `real 0.26s`

These timings are machine-dependent; use trends, not absolute values.
