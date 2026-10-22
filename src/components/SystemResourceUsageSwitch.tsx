import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/hooks/useSettings";
import { DEFAULT_SHOW_SYSTEM_RESOURCE_USAGE } from "@/shared/settings_defaults";
import { useTranslation } from "react-i18next";

export function SystemResourceUsageSwitch() {
  const { t } = useTranslation("common");
  const { settings, updateSettings } = useSettings();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Switch
          id="show-system-resource-usage"
          disabled={!settings}
          checked={
            settings?.showSystemResourceUsage ??
            DEFAULT_SHOW_SYSTEM_RESOURCE_USAGE
          }
          onCheckedChange={(checked) => {
            void updateSettings({ showSystemResourceUsage: checked }).catch(
              () => {},
            );
          }}
        />
        <Label htmlFor="show-system-resource-usage">
          {t("systemResources.settingLabel")}
        </Label>
      </div>
      <p className="text-[13px] text-muted-foreground">
        {t("systemResources.settingDescription")}
      </p>
    </div>
  );
}
