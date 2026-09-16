import { useSettings } from "@/hooks/useSettings";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * Persist only explicit choices so a future default change can distinguish
 * users without a preference from those who opted out.
 */
export function SandboxedE2eTestsSwitch() {
  const { settings, updateSettings } = useSettings();
  const enabled = Boolean(settings?.enableSandboxE2eTests);
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
