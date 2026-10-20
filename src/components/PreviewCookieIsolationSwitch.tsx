import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/hooks/useSettings";
import { DEFAULT_ENABLE_PREVIEW_COOKIE_ISOLATION } from "@/shared/settings_defaults";

export function PreviewCookieIsolationSwitch() {
  const { settings, settingsLoading, updateSettings } = useSettings();

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {!settings ? (
          <span role="status" className="text-sm text-muted-foreground">
            {settingsLoading ? "Loading setting…" : "Unable to load setting"}
          </span>
        ) : (
          <Switch
            id="enable-preview-cookie-isolation"
            aria-label="Isolate preview sign-in cookies"
            checked={
              settings.enablePreviewCookieIsolation ??
              DEFAULT_ENABLE_PREVIEW_COOKIE_ISOLATION
            }
            onCheckedChange={(checked) => {
              // The settings mutation displays its own error toast.
              void updateSettings({
                enablePreviewCookieIsolation: checked,
              }).catch(() => {});
            }}
          />
        )}
        <Label htmlFor="enable-preview-cookie-isolation">
          Isolate preview sign-in cookies
        </Label>
      </div>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Keep each app's HttpOnly sign-in cookies separate on shared localhost.
        On by default. Restart Dyad to apply changes to all previews.
      </p>
    </div>
  );
}
