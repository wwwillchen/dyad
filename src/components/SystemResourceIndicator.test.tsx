import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { queryKeys } from "@/lib/queryKeys";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SystemResourceIndicator } from "./SystemResourceIndicator";
import type { SystemResourceUsage } from "@/ipc/types";

const { getUsage, motion } = vi.hoisted(() => ({
  getUsage: vi.fn(),
  motion: { reduced: false },
}));
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotionPref: () => motion.reduced,
}));
vi.mock("@/ipc/types", () => ({
  ipc: { system: { getSystemResourceUsage: getUsage } },
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
  motion.reduced = false;
});
const gib = 1024 ** 3;
const sample: SystemResourceUsage = {
  sampledAt: Date.now(),
  platform: "linux",
  cpu: { logicalCores: 8, usedPercent: 25 },
  memory: {
    totalBytes: 16 * gib,
    usedBytes: 8 * gib,
    committedBytes: 20 * gib,
    commitLimitBytes: 32 * gib,
    compressedBytes: null,
    swapUsedBytes: gib,
    source: "linux",
  },
};
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <SystemResourceIndicator />
    </QueryClientProvider>,
  );
  return client;
}

describe("SystemResourceIndicator", () => {
  it.each([
    [79.9, "text-emerald-600", null],
    [80, "text-yellow-600", "high"],
    [89.9, "text-yellow-600", "high"],
    [90, "text-red-600", "critical"],
    [100, "text-red-600", "critical"],
  ] as const)(
    "colors RAM and committed memory at %s%%",
    async (percent, color, severity) => {
      getUsage.mockResolvedValue({
        ...sample,
        memory: {
          ...sample.memory,
          usedBytes: (sample.memory.totalBytes * percent) / 100,
          committedBytes: (sample.memory.commitLimitBytes! * percent) / 100,
        },
      });
      mount();
      await userEvent.click(
        screen.getByRole("button", { name: "System CPU and memory usage" }),
      );
      for (const name of ["System RAM usage", "Memory usage"]) {
        const chart = await screen.findByRole("img", { name });
        await waitFor(() => expect(chart.classList.contains(color)).toBe(true));
        if (severity)
          expect(chart.getAttribute("aria-description")).toContain(
            `Memory usage ${severity}.`,
          );
      }
      expect(
        screen
          .getByRole("img", { name: "Memory usage" })
          .querySelector('[data-metric="committed"]')
          ?.classList.contains(severity ? color : "text-muted-foreground"),
      ).toBe(true);
      expect(
        screen
          .getByRole("img", { name: "System CPU usage" })
          .classList.contains("text-emerald-600"),
      ).toBe(true);
    },
  );

  it("returns RAM to green when usage falls", async () => {
    getUsage.mockResolvedValue({
      ...sample,
      memory: { ...sample.memory, usedBytes: sample.memory.totalBytes * 0.95 },
    });
    const client = mount();
    const chart = screen.getByRole("img", { name: "System RAM usage" });
    await waitFor(() =>
      expect(chart.classList.contains("text-red-600")).toBe(true),
    );
    act(() => {
      client.setQueryData(queryKeys.system.resourceUsage, {
        ...sample,
        sampledAt: sample.sampledAt + 5000,
      });
    });
    await waitFor(() =>
      expect(chart.classList.contains("text-emerald-600")).toBe(true),
    );
    expect(chart.getAttribute("aria-description")).not.toContain("critical");
  });
  it("shows dotted committed memory in the mini chart before opening details", async () => {
    getUsage.mockResolvedValue(sample);
    mount();
    const chart = screen.getByRole("img", { name: "System RAM usage" });
    await waitFor(() =>
      expect(
        chart.querySelector('[data-metric="committed"] path'),
      ).toBeTruthy(),
    );
    expect(
      chart
        .querySelector('[data-metric="ram"] path')!
        .getAttribute("stroke-dasharray"),
    ).toBeNull();
    expect(
      chart
        .querySelector('[data-metric="committed"] path')!
        .getAttribute("stroke-dasharray"),
    ).toBe("1 3");
    expect(chart.getAttribute("aria-description")).toBe(
      "Last 60 seconds. RAM: 50% of physical RAM. Committed: 63% of commit limit.",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("polls every two seconds", async () => {
    vi.useFakeTimers();
    getUsage.mockResolvedValue(sample);
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(getUsage).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(getUsage).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(getUsage).toHaveBeenCalledTimes(3);
  });

  it("pauses polling while hidden and resumes when visible", async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("visible");
    getUsage.mockResolvedValue(sample);
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(getUsage).toHaveBeenCalledTimes(1);
    await act(async () => {
      visibility.mockReturnValue("hidden");
      window.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(getUsage).toHaveBeenCalledTimes(1);
    await act(async () => {
      visibility.mockReturnValue("visible");
      window.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(getUsage).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(getUsage).toHaveBeenCalledTimes(3);
  });

  it("scrolls history linearly between samples", async () => {
    getUsage.mockResolvedValue(sample);
    mount();
    const chart = screen.getByRole("img", { name: "System CPU usage" });
    await waitFor(() =>
      expect(chart.querySelector("animateTransform")).toBeTruthy(),
    );
    const animation = chart.querySelector("animateTransform")!;
    expect(animation.getAttribute("dur")).toBe("2000ms");
    expect(animation.getAttribute("calcMode")).toBe("linear");
    expect(Number(animation.getAttribute("to")!.split(" ")[0])).toBeCloseTo(
      (-98 * 2000) / 60000,
    );
  });

  it("keeps charts static with reduced motion", async () => {
    motion.reduced = true;
    getUsage.mockResolvedValue(sample);
    mount();
    const chart = screen.getByRole("img", { name: "System CPU usage" });
    await waitFor(() => expect(chart.querySelector("circle")).toBeTruthy());
    expect(chart.querySelector("animateTransform")).toBeNull();
  });
  it("plots real samples over time, leaves gaps, and expires old history", async () => {
    getUsage.mockResolvedValue(sample);
    const client = mount();
    const chart = screen.getByRole("img", { name: "System CPU usage" });
    await waitFor(() => expect(chart.querySelector("circle")).toBeTruthy());
    expect(chart.querySelector("path")?.getAttribute("d")).toBe("M99.00,17.50");
    const update = async (elapsed: number, percent: number) => {
      await act(async () => {
        client.setQueryData(queryKeys.system.resourceUsage, {
          ...sample,
          sampledAt: sample.sampledAt + elapsed,
          cpu: { ...sample.cpu, usedPercent: percent },
        });
      });
    };
    await update(2000, 75);
    await waitFor(() =>
      expect(chart.querySelector("path")?.getAttribute("d")).toBe(
        "M95.73,17.50 L99.00,6.50",
      ),
    );
    await update(25000, 50);
    await waitFor(() =>
      expect(chart.querySelector("path")?.getAttribute("d")).toContain(
        "M99.00,12.00",
      ),
    );
    await update(90000, 10);
    await waitFor(() =>
      expect(chart.querySelector("path")?.getAttribute("d")).toBe(
        "M99.00,20.80",
      ),
    );
  });

  it("clears stale readings after a failed poll and recovers on the next success", async () => {
    getUsage.mockResolvedValue(sample);
    const client = mount();
    await userEvent.click(
      screen.getByRole("button", { name: "System CPU and memory usage" }),
    );
    await screen.findByText("20.0 GiB");
    getUsage.mockRejectedValue(new Error("unavailable"));
    await act(async () => {
      await client.invalidateQueries({
        queryKey: queryKeys.system.resourceUsage,
      });
    });
    expect(
      await screen.findByText(
        "System metrics are unavailable. Retrying automatically.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("20.0 GiB")).toBeNull();
    getUsage.mockResolvedValue(sample);
    await act(async () => {
      await client.invalidateQueries({
        queryKey: queryKeys.system.resourceUsage,
      });
    });
    expect(await screen.findByText("20.0 GiB")).toBeTruthy();
  });
  it("opens whole-system details and closes with Escape", async () => {
    getUsage.mockResolvedValue(sample);
    const user = userEvent.setup();
    mount();
    await user.click(
      screen.getByRole("button", { name: "System CPU and memory usage" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "System resources",
    });
    expect(dialog.textContent).toContain("Your whole computer");
    expect(dialog.textContent).toContain("8 logical cores (100%)");
    expect(dialog.textContent).toContain("20.0 GiB");
    expect(
      screen
        .getByRole("img", { name: "Memory usage" })
        .getAttribute("aria-description"),
    ).toBe(
      "Last 60 seconds. RAM: 50% of physical RAM. Committed: 63% of commit limit.",
    );
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("shows macOS memory figures without technical explanations", async () => {
    getUsage.mockResolvedValue({
      ...sample,
      platform: "darwin",
      memory: {
        ...sample.memory,
        source: "macos",
        committedBytes: null,
        commitLimitBytes: null,
        compressedBytes: gib,
      },
    });
    mount();
    await userEvent.click(
      screen.getByRole("button", { name: "System CPU and memory usage" }),
    );
    expect((await screen.findByRole("dialog")).textContent).not.toContain(
      "macOS does not expose a system commit counter",
    );
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByText("Compressed (included in used)")).toBeTruthy();
    expect(
      screen
        .getByRole("img", { name: "Memory usage" })
        .querySelector('[data-metric="committed"]'),
    ).toBeNull();
    expect(screen.queryByText("Committed (% of commit limit)")).toBeNull();
  });

  it("overlays dotted commit usage with independent limits and pressure colors", async () => {
    getUsage.mockResolvedValue({
      ...sample,
      memory: {
        ...sample.memory,
        committedBytes: sample.memory.commitLimitBytes! * 0.95,
      },
    });
    const client = mount();
    await userEvent.click(
      screen.getByRole("button", { name: "System CPU and memory usage" }),
    );
    const chart = await screen.findByRole("img", { name: "Memory usage" });
    await waitFor(() =>
      expect(
        chart.querySelector('[data-metric="committed"] path'),
      ).toBeTruthy(),
    );
    const ram = chart.querySelector('[data-metric="ram"]')!;
    const committed = chart.querySelector('[data-metric="committed"]')!;
    expect(ram.classList.contains("text-emerald-600")).toBe(true);
    expect(committed.classList.contains("text-red-600")).toBe(true);
    expect(
      ram.querySelector("path")!.getAttribute("stroke-dasharray"),
    ).toBeNull();
    expect(
      committed.querySelector("path")!.getAttribute("stroke-dasharray"),
    ).toBe("1 3");
    expect(ram.querySelector("path")!.getAttribute("d")).toBe("M99.00,12.00");
    expect(committed.querySelector("path")!.getAttribute("d")).toBe(
      "M99.00,2.10",
    );
    expect(screen.getByText("RAM (% of physical RAM)")).toBeTruthy();
    expect(screen.getByText("Committed (% of commit limit)")).toBeTruthy();
    expect(screen.getAllByRole("img")).toHaveLength(4);
    await act(async () => {
      client.setQueryData(queryKeys.system.resourceUsage, {
        ...sample,
        sampledAt: sample.sampledAt + 2000,
      });
    });
    await waitFor(() =>
      expect(
        chart
          .querySelector('[data-metric="committed"]')!
          .classList.contains("text-muted-foreground"),
      ).toBe(true),
    );
    expect(
      chart.querySelector('[data-metric="committed"] path')!.getAttribute("d"),
    ).toBe("M95.73,2.10 L99.00,9.25");
  });
  it("shows a recoverable error instead of zero usage", async () => {
    getUsage.mockRejectedValue(new Error("offline"));
    mount();
    await userEvent.click(
      screen.getByRole("button", { name: "System CPU and memory usage" }),
    );
    expect(
      await screen.findByText(
        "System metrics are unavailable. Retrying automatically.",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("img", { name: "System CPU usage" })
        .getAttribute("aria-description"),
    ).toBe("Unavailable");
  });
});
