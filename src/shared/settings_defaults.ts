// This module is safe to import in both the main and renderer processes.
// Keep renderer-consumed defaults here free of runtime side effects.
export const DEFAULT_ENABLE_TESTING_FOR_NEW_APPS = false;
// Resolve at use sites, not in persisted defaults, so future rollouts only
// affect users who have not explicitly chosen a preference.
export const DEFAULT_ENABLE_SANDBOX_E2E_TESTS = false;
