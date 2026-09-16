import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

const switchTrackClassName =
  "data-checked:bg-primary data-unchecked:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-unchecked:bg-input/80 shrink-0 rounded-full border border-transparent focus-visible:ring-[3px] h-5 w-9 p-0.5 peer group/switch relative inline-flex items-center transition-colors duration-200 ease-out outline-none data-disabled:cursor-not-allowed data-disabled:opacity-50";
const switchThumbClassName =
  "bg-background dark:data-unchecked:bg-foreground dark:data-checked:bg-primary-foreground rounded-full size-4 data-checked:translate-x-full data-unchecked:translate-x-0 pointer-events-none block ring-0 transition-transform duration-200 ease-out";

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(switchTrackClassName, className)}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={switchThumbClassName}
      />
    </SwitchPrimitive.Root>
  );
}

/** Noninteractive switch appearance for controls that own their own semantics. */
function SwitchIndicator({ checked }: { checked: boolean }) {
  const state = {
    "data-checked": checked ? "" : undefined,
    "data-unchecked": checked ? undefined : "",
  };
  return (
    <span
      aria-hidden="true"
      data-slot="switch-indicator"
      className={switchTrackClassName}
      {...state}
    >
      <span
        data-slot="switch-thumb"
        className={switchThumbClassName}
        {...state}
      />
    </span>
  );
}

export { Switch, SwitchIndicator };
