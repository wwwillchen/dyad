import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/hooks/useSettings";
import { DEFAULT_ENABLE_PREVIEW_COOKIE_ISOLATION } from "@/shared/settings_defaults";

export function PreviewCookieIsolationSwitch() {
  const { settings, updateSettings } = useSettings();

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Switch
          id="enable-preview-cookie-isolation"
          aria-label="Isolate preview sign-in cookies"
          checked={
            settings?.enablePreviewCookieIsolation ??
            DEFAULT_ENABLE_PREVIEW_COOKIE_ISOLATION
          }
          disabled={!settings}
          onCheckedChange={(checked) => {
            // The settings mutation displays its own error toast.
            void updateSettings({
              enablePreviewCookieIsolation: checked,
            }).catch(() => {});
          }}
        />
        <Label htmlFor="enable-preview-cookie-isolation">
          Isolate preview sign-in cookies
        </Label>
      </div>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Keep each app's HttpOnly sign-in cookies separate on shared localhost.
        On by default. Restart running apps to apply changes.
      </p>
    </div>
  );
}
