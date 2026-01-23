# Plan: Persist Device Mode Setting

## Issue Summary

**GitHub Issue:** [#2318](https://github.com/dyad-sh/dyad/issues/2318)

When working in Dyad, the selected device mode (Desktop / Tablet / Mobile) resets to desktop after restart, rebuild, or clear cache actions. The device mode should persist between sessions.

## Root Cause

The device mode is currently stored as local React component state in `PreviewIframe.tsx`:

```typescript
const [deviceMode, setDeviceMode] = useState<DeviceMode>("desktop");
```

This state is lost when the component remounts or the app restarts.

## Proposed Solution

Follow the existing pattern used for other UI preferences (like `zoomLevel`) to persist device mode through the UserSettings system.

## Files to Modify

1. **`src/lib/schemas.ts`** - Add `DeviceModeSchema` and `previewDeviceMode` field to `UserSettingsSchema`
2. **`src/components/preview_panel/PreviewIframe.tsx`** - Replace local state with useSettings integration

## Implementation Steps

### Step 1: Update schemas.ts

Add a new Zod schema for device mode and add a field to UserSettings:

```typescript
// After ZoomLevelSchema
export const DeviceModeSchema = z.enum(["desktop", "tablet", "mobile"]);
export type DeviceMode = z.infer<typeof DeviceModeSchema>;
```

Add to `UserSettingsSchema`:

```typescript
previewDeviceMode: DeviceModeSchema.optional(),
```

### Step 2: Update PreviewIframe.tsx

1. Import `useSettings` hook and `DeviceMode` type from schemas
2. Replace the local `useState` for `deviceMode` with the persisted setting
3. Update `setDeviceMode` calls to use `updateSettings({ previewDeviceMode: ... })`
4. Remove the local `type DeviceMode` definition (use the one from schemas)

The component will:

- Read `deviceMode` from `settings?.previewDeviceMode ?? "desktop"`
- Persist changes via `updateSettings({ previewDeviceMode: value })`
- Keep the popover open/close state as local state (no need to persist)

## Testing Approach

**E2E Test Addition:** Add a test case to the existing `toggle_screen_sizes.spec.ts` to verify persistence:

1. Switch to mobile mode
2. Trigger a rebuild/restart action
3. Verify the device mode remains mobile after the app reloads

This extends the existing test file rather than creating a new one, per project guidelines.

## Potential Risks

- **Performance:** Each device mode change triggers a settings write to disk. This is acceptable since users change device mode infrequently, and the pattern is already used for other settings like zoom level.
- **Backwards compatibility:** Using `.optional()` ensures existing users without the setting default to "desktop" (matching current behavior).
