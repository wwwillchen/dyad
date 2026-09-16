import { useSettings } from "@/hooks/useSettings";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_ENABLE_SANDBOX_E2E_TESTS } from "@/shared/settings_defaults";

/**
 * Persist only explicit choices so users without a preference follow the
 * shared default when it changes.
 */
export function SandboxedE2eTestsSwitch() {
  const { settings, updateSettings } = useSettings();
  const enabled =
    settings?.enableSandboxE2eTests ?? DEFAULT_ENABLE_SANDBOX_E2E_TESTS;
  return (
    <div className="flex items-center space-x-2">
      <Switch
        id="enable-sandboxed-e2e-tests"
        aria-label="Run E2E Tests in an Isolated Sandbox"
        checked={enabled}
        // Wait for the saved preference before allowing changes.
        disabled={!settings}
        onCheckedChange={(checked) => {
          updateSettings({ enableSandboxE2eTests: checked });
        }}
      />
      <Label htmlFor="enable-sandboxed-e2e-tests">
        Run E2E Tests in an Isolated Sandbox
      </Label>
    </div>
  );
}
