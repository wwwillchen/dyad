import { useSettings } from "@/hooks/useSettings";
import { DEFAULT_SHOW_SYSTEM_RESOURCE_USAGE } from "@/shared/settings_defaults";
import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Cpu, MemoryStick } from "lucide-react";
import { ipc } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { useReducedMotionPref } from "@/hooks/useReducedMotion";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

function formatBytes(bytes: number | null | undefined, unavailable: string) {
  return bytes == null ? unavailable : `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}

/* ANIMATION STORYBOARD
 *    0ms  show the latest measured values immediately
 * 2000ms  move recorded history left at a constant speed, then await a sample
 *         reduced motion: show static samples instead
 */
const TIMING = {
  sampleInterval: 2000, // also the duration of each linear scroll
  historyWindow: 60_000, // visible history in milliseconds
};
const CHART = {
  left: 1,
  width: 98,
  bottom: 23,
  height: 22,
};
const MEMORY_USAGE_THRESHOLDS = { warning: 80, critical: 90 };
type ResourceSample = {
  at: number;
  cpu: number | null;
  ram: number | null;
  committed: number | null;
};

type ResourceMetric = "cpu" | "ram" | "committed";

function resourcePath(history: ResourceSample[], metric: ResourceMetric) {
  const latest = history.at(-1);
  let path = "";
  let previousAt: number | undefined;
  let endpoint: { x: number; y: number } | undefined;
  for (const sample of history) {
    const value = sample[metric];
    if (value == null) {
      previousAt = undefined;
      endpoint = undefined;
      continue;
    }
    const x =
      CHART.left +
      (1 - (latest!.at - sample.at) / TIMING.historyWindow) * CHART.width;
    const y =
      CHART.bottom - (Math.max(0, Math.min(100, value)) / 100) * CHART.height;
    // A missed poll leaves a visible gap rather than inventing intervening usage.
    const connected =
      previousAt != null &&
      sample.at - previousAt <= TIMING.sampleInterval * 1.5;
    path += `${connected ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)} `;
    previousAt = sample.at;
    endpoint = { x, y };
  }
  return { path, endpoint };
}

function memorySeverity(value: number | null | undefined) {
  return value == null
    ? null
    : value >= MEMORY_USAGE_THRESHOLDS.critical
      ? "critical"
      : value >= MEMORY_USAGE_THRESHOLDS.warning
        ? "high"
        : null;
}

function resourceColor(
  metric: ResourceMetric,
  value: number | null | undefined,
  warnCommitted = true,
) {
  const severity =
    metric === "cpu" || (metric === "committed" && !warnCommitted)
      ? null
      : memorySeverity(value);
  return severity === "critical"
    ? "text-red-600 dark:text-red-400"
    : severity === "high"
      ? "text-yellow-600 dark:text-yellow-400"
      : metric === "cpu" && value != null && value >= 90
        ? "text-amber-500"
        : metric === "committed"
          ? "text-muted-foreground"
          : "text-emerald-600 dark:text-emerald-400";
}

function ResourceChart({
  history,
  metric,
  label,
  compact = false,
  includeCommitted = false,
  warnCommitted = true,
}: {
  history: ResourceSample[];
  metric: ResourceMetric;
  label: string;
  compact?: boolean;
  includeCommitted?: boolean;
  warnCommitted?: boolean;
}) {
  const { t } = useTranslation("common");
  const reducedMotion = useReducedMotionPref();
  const latest = history.at(-1);
  const scrollRef = useRef<SVGAnimateTransformElement>(null);
  useEffect(() => {
    // Begin relative to this sample's arrival, not the SVG's original mount.
    if (!reducedMotion) scrollRef.current?.beginElement?.();
  }, [latest?.at, reducedMotion]);
  const value = latest?.[metric];
  const severity = metric === "cpu" ? null : memorySeverity(value);
  const metrics: ResourceMetric[] = includeCommitted
    ? [metric, "committed"]
    : [metric];
  const severityText = (status: ReturnType<typeof memorySeverity>) =>
    status
      ? t(
          status === "high"
            ? "systemResources.high"
            : "systemResources.critical",
        )
      : "";
  const description = includeCommitted
    ? [
        t("systemResources.history"),
        ...metrics.map((series) => {
          const reading = latest?.[series];
          const status =
            series === "committed" && !warnCommitted
              ? null
              : memorySeverity(reading);
          return [
            t(
              series === "ram"
                ? "systemResources.ramReading"
                : "systemResources.commitReading",
              {
                value:
                  reading == null
                    ? t("systemResources.unavailable")
                    : Math.round(reading) + "%",
              },
            ),
            severityText(status),
          ]
            .filter(Boolean)
            .join(" ");
        }),
      ].join(" ")
    : value == null
      ? t("systemResources.unavailable")
      : [
          t("systemResources.current", { value: Math.round(value) }),
          severityText(severity),
        ]
          .filter(Boolean)
          .join(" ");
  return (
    <svg
      role="img"
      aria-label={label}
      aria-description={description}
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className={cn(
        "w-full overflow-hidden border",
        compact
          ? "h-3 rounded-[2px] border-foreground/35 bg-background"
          : "h-14 rounded-sm border-border bg-muted/40",
        resourceColor(metric, value, warnCommitted),
      )}
    >
      {!compact && (
        <path
          d="M0,12 H100"
          fill="none"
          className="stroke-border/60"
          vectorEffect="non-scaling-stroke"
          strokeWidth="0.5"
        />
      )}
      <g key={latest?.at}>
        {!reducedMotion && latest && (
          <animateTransform
            ref={scrollRef}
            begin="indefinite"
            attributeName="transform"
            type="translate"
            from="0 0"
            to={`${(-CHART.width * TIMING.sampleInterval) / TIMING.historyWindow} 0`}
            dur={`${TIMING.sampleInterval}ms`}
            calcMode="linear"
            fill="freeze"
          />
        )}
        {metrics.map((series) => {
          const { path, endpoint } = resourcePath(history, series);
          return (
            <g
              key={series}
              data-metric={series}
              className={resourceColor(series, latest?.[series], warnCommitted)}
            >
              {path && (
                <path
                  d={path.trim()}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeDasharray={series === "committed" ? "1 3" : undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {endpoint && (
                <circle
                  cx={endpoint.x}
                  cy={endpoint.y}
                  r="0.8"
                  fill="currentColor"
                />
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export function SystemResourceIndicator() {
  const { settings } = useSettings();
  if (!settings) return null;
  return (settings.showSystemResourceUsage ??
    DEFAULT_SHOW_SYSTEM_RESOURCE_USAGE) ? (
    <SystemResourceMonitor />
  ) : null;
}

function SystemResourceMonitor() {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<ResourceSample[]>([]);
  const { data, isError } = useQuery({
    queryKey: queryKeys.system.resourceUsage,
    queryFn: () => ipc.system.getSystemResourceUsage(),
    refetchInterval: TIMING.sampleInterval,
    // TanStack Query tracks document visibility, including minimized windows.
    refetchIntervalInBackground: false,
    staleTime: TIMING.sampleInterval,
    retry: false,
    networkMode: "always",
  });
  useEffect(() => {
    if (!data || isError) return;
    const { memory, cpu, sampledAt } = data;
    setHistory((previous) => {
      if (previous.at(-1)?.at === sampledAt) return previous;
      return [
        ...previous.filter(
          (sample) => sample.at >= sampledAt - TIMING.historyWindow,
        ),
        {
          at: sampledAt,
          cpu: cpu.usedPercent,
          ram:
            memory.totalBytes > 0
              ? (memory.usedBytes / memory.totalBytes) * 100
              : null,
          committed:
            memory.committedBytes != null &&
            memory.commitLimitBytes != null &&
            memory.commitLimitBytes > 0
              ? (memory.committedBytes / memory.commitLimitBytes) * 100
              : null,
        },
      ].slice(-61);
    });
  }, [data, isError]);
  const visibleHistory = isError ? [] : history;
  // Never present a previous successful sample as live after a failed poll.
  const current = isError ? undefined : data;
  const memory = current?.memory;
  const cpu = current?.cpu;
  const hasCommitted =
    memory?.committedBytes != null &&
    memory.commitLimitBytes != null &&
    memory.commitLimitBytes > 0;
  const cpuPercent =
    cpu?.usedPercent == null
      ? t("systemResources.sampling")
      : `${Math.round(cpu.usedPercent)}%`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={t("systemResources.trigger")}
        title={t("systemResources.trigger")}
        className="no-app-region-drag mx-2 flex shrink-0 items-center gap-2 rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="grid w-20 grid-cols-[auto_1fr] items-center gap-x-2 gap-y-0.5">
          <span>{t("systemResources.cpu")}</span>
          <ResourceChart
            label={t("systemResources.cpuChart")}
            history={visibleHistory}
            metric="cpu"
            compact
          />
          <span>{t("systemResources.ram")}</span>
          <ResourceChart
            label={t("systemResources.ramChart")}
            history={visibleHistory}
            metric="ram"
            includeCommitted={hasCommitted}
            warnCommitted={current?.platform === "win32"}
            compact
          />
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn("size-3", open && "rotate-180")}
        />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        aria-label={t("systemResources.title")}
        className="w-80 max-w-[calc(100vw-1rem)] max-h-(--available-height) overflow-y-auto scrollbar-on-hover space-y-4 rounded-xl p-4"
      >
        <div>
          <h2 className="text-sm font-semibold">
            {t("systemResources.title")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("systemResources.scope")}
          </p>
        </div>
        {!current ? (
          <p className="text-xs text-muted-foreground">
            {isError
              ? t("systemResources.error")
              : t("systemResources.loading")}
          </p>
        ) : (
          <>
            <section
              className="space-y-2"
              aria-label={t("systemResources.cpuDetails")}
            >
              <div className="flex items-center gap-2 text-xs font-medium">
                <Cpu className="size-4 text-muted-foreground" />
                {t("systemResources.cpu")}
                <span className="ml-auto tabular-nums">
                  {t("systemResources.used", { value: cpuPercent })}
                </span>
              </div>
              <ResourceChart
                label={t("systemResources.cpuTotalChart")}
                history={visibleHistory}
                metric="cpu"
              />
              <p className="text-xs text-muted-foreground">
                {t("systemResources.cpuTotal", { count: cpu?.logicalCores })}
              </p>
            </section>
            <section
              className="space-y-2 border-t pt-3"
              aria-label={t("systemResources.memoryDetails")}
            >
              <div className="flex items-center gap-2 text-xs font-medium">
                <MemoryStick className="size-4 text-muted-foreground" />
                {t("systemResources.memory")}
                <span className="ml-auto tabular-nums">
                  {t("systemResources.used", {
                    value: formatBytes(
                      memory?.usedBytes,
                      t("systemResources.unavailable"),
                    ),
                  })}
                </span>
              </div>
              <ResourceChart
                label={t("systemResources.memoryChart")}
                history={visibleHistory}
                metric="ram"
                includeCommitted={hasCommitted}
                warnCommitted={current?.platform === "win32"}
              />
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "w-4 border-t-2",
                      resourceColor("ram", visibleHistory.at(-1)?.ram),
                    )}
                  />
                  {t("systemResources.ramLegend")}
                </span>
                {hasCommitted && (
                  <span className="inline-flex items-center gap-1">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "w-4 border-t-2 border-dotted",
                        resourceColor(
                          "committed",
                          visibleHistory.at(-1)?.committed,
                          current?.platform === "win32",
                        ),
                      )}
                    />
                    {t("systemResources.commitLegend")}
                  </span>
                )}
              </div>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-xs [&_dd]:text-right [&_dd]:tabular-nums [&_dt]:text-muted-foreground">
                <dt>{t("systemResources.totalRam")}</dt>
                <dd>
                  {formatBytes(
                    memory?.totalBytes,
                    t("systemResources.unavailable"),
                  )}
                </dd>
                <dt>{t("systemResources.usedRam")}</dt>
                <dd>
                  {formatBytes(
                    memory?.usedBytes,
                    t("systemResources.unavailable"),
                  )}
                </dd>
                <dt>{t("systemResources.committed")}</dt>
                <dd>
                  {formatBytes(
                    memory?.committedBytes,
                    t("systemResources.unavailable"),
                  )}
                </dd>
                {memory?.commitLimitBytes != null && (
                  <>
                    <dt>{t("systemResources.commitLimit")}</dt>
                    <dd>
                      {formatBytes(
                        memory.commitLimitBytes,
                        t("systemResources.unavailable"),
                      )}
                    </dd>
                  </>
                )}
                {memory?.compressedBytes != null && (
                  <>
                    <dt>{t("systemResources.compressed")}</dt>
                    <dd>
                      {formatBytes(
                        memory.compressedBytes,
                        t("systemResources.unavailable"),
                      )}
                    </dd>
                  </>
                )}
                {memory?.swapUsedBytes != null && (
                  <>
                    <dt>{t("systemResources.swap")}</dt>
                    <dd>
                      {formatBytes(
                        memory.swapUsedBytes,
                        t("systemResources.unavailable"),
                      )}
                    </dd>
                  </>
                )}
              </dl>
            </section>
            <p className="border-t pt-3 text-[10px] text-muted-foreground">
              {t("systemResources.footer", {
                seconds: TIMING.sampleInterval / 1000,
                time: new Date(current.sampledAt).toLocaleTimeString(),
              })}
            </p>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
