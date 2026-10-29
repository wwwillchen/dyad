import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { NeonMigrationBanner } from "./NeonMigrationBanner";

const h = vi.hoisted(() => ({
  app: { id: 1, neonProjectId: "p", neonDevelopmentBranchId: "dev" } as {
    id: number;
    neonProjectId: string | null;
    neonDevelopmentBranchId: string | null;
  },
  getDevelopmentBranchStatus: vi.fn(),
  migrateDevelopmentBranch: vi.fn(),
  stopApp: vi.fn(),
  restartApp: vi.fn(),
  showWarning: vi.fn(),
  calls: [] as string[],
}));

vi.mock("@/lib/toast", () => ({ showWarning: h.showWarning }));

vi.mock("@/ipc/types", () => ({
  ipc: {
    neon: {
      getDevelopmentBranchStatus: h.getDevelopmentBranchStatus,
      migrateDevelopmentBranch: h.migrateDevelopmentBranch,
    },
  },
}));

vi.mock("@/hooks/useLoadApp", () => ({
  useLoadApp: () => ({ app: h.app }),
}));

vi.mock("@/hooks/useRunApp", () => ({
  useRunApp: () => ({
    loading: false,
    stopApp: h.stopApp,
    restartApp: h.restartApp,
  }),
}));

const LEGACY_STATUS = {
  needsMigration: true,
  otherApps: [],
  appsDeployingWithDevelopment: [],
  leakedBackups: 4,
  branchCount: 7,
};

describe("NeonMigrationBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.calls = [];
    h.app = { id: 1, neonProjectId: "p", neonDevelopmentBranchId: "dev" };
    h.getDevelopmentBranchStatus.mockResolvedValue(LEGACY_STATUS);
    h.migrateDevelopmentBranch.mockImplementation(async () => {
      h.calls.push("migrate");
      return { success: true };
    });
    h.stopApp.mockImplementation(async () => {
      h.calls.push("stop");
    });
    h.restartApp.mockImplementation(async () => {
      h.calls.push("restart");
    });
  });

  /** A fresh Jotai store and query cache stand in for a fresh Dyad launch. */
  function launch(store = createStore()) {
    store.set(selectedAppIdAtom, 1);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const Wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>
        <Provider store={store}>{children}</Provider>
      </QueryClientProvider>
    );
    const view = render(<NeonMigrationBanner />, { wrapper: Wrapper });
    return { store, view };
  }

  it("offers migrating an app on the old Neon branch layout", async () => {
    launch();

    const banner = await screen.findByTestId("neon-migration-banner");
    expect(banner.textContent).toContain(
      "Update your Neon development database",
    );
    expect(banner.textContent).toContain(
      "4 old backups (of 7 branches) will be deleted",
    );
    expect(h.getDevelopmentBranchStatus).toHaveBeenCalledWith({ appId: 1 });
  });

  it("leaves out the backup count when nothing has leaked yet", async () => {
    h.getDevelopmentBranchStatus.mockResolvedValue({
      needsMigration: true,
      otherApps: [],
      appsDeployingWithDevelopment: [],
      leakedBackups: 0,
      branchCount: 3,
    });
    launch();

    const banner = await screen.findByTestId("neon-migration-banner");
    expect(banner.textContent).not.toContain("old backup");
  });

  it("recommends a production database instead of migrating when the app deploys with development", async () => {
    h.getDevelopmentBranchStatus.mockResolvedValue({
      ...LEGACY_STATUS,
      appsDeployingWithDevelopment: [{ id: 1, name: "My App" }],
    });
    launch();

    const banner = await screen.findByTestId("neon-migration-banner");
    expect(banner.textContent).toContain(
      "Your app deploys with your development database",
    );
    expect(banner.textContent).toContain(
      "We strongly recommend deploying with your production database instead",
    );
    expect(screen.queryByTestId("neon-migration-banner-migrate")).toBeNull();
    // It can still be closed.
    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss Neon migration banner" }),
    );
    expect(screen.queryByTestId("neon-migration-banner")).toBeNull();
  });

  it("names another app that deploys with the shared development database", async () => {
    h.getDevelopmentBranchStatus.mockResolvedValue({
      ...LEGACY_STATUS,
      otherApps: [{ id: 2, name: "Todo App" }],
      appsDeployingWithDevelopment: [{ id: 2, name: "Todo App" }],
    });
    launch();

    const banner = await screen.findByTestId("neon-migration-banner");
    expect(banner.textContent).toContain(
      "Todo App deploys with your development database",
    );
    expect(screen.queryByTestId("neon-migration-banner-migrate")).toBeNull();
  });

  it("names the other apps a shared migration moves, and stops them first", async () => {
    h.getDevelopmentBranchStatus.mockResolvedValue({
      ...LEGACY_STATUS,
      otherApps: [
        { id: 2, name: "Todo App" },
        { id: 3, name: "Notes" },
      ],
    });
    launch();

    const banner = await screen.findByTestId("neon-migration-banner");
    expect(banner.textContent).toContain(
      "Also used by Todo App and Notes; migrating moves them too.",
    );
    fireEvent.click(screen.getByTestId("neon-migration-banner-migrate"));
    await waitFor(() => expect(h.restartApp).toHaveBeenCalled());
    expect(h.stopApp.mock.calls.map(([id]) => id)).toEqual([1, 2, 3]);
    // Only the app on screen restarts; the others start when next opened.
    expect(h.restartApp).toHaveBeenCalledTimes(1);
    expect(h.restartApp).toHaveBeenCalledWith({ appId: 1 });
  });

  it("warns about Neon Auth settings that were not carried over", async () => {
    h.migrateDevelopmentBranch.mockResolvedValue({
      success: true,
      warning: "These Neon Auth settings could not be copied: github sign-in.",
    });
    launch();

    fireEvent.click(await screen.findByTestId("neon-migration-banner-migrate"));

    await waitFor(() =>
      expect(h.showWarning).toHaveBeenCalledWith(
        "These Neon Auth settings could not be copied: github sign-in.",
      ),
    );
  });

  it("stays hidden when the app needs no migration", async () => {
    h.getDevelopmentBranchStatus.mockResolvedValue({
      needsMigration: false,
      otherApps: [],
      appsDeployingWithDevelopment: [],
      leakedBackups: 0,
      branchCount: 0,
    });
    launch();

    await waitFor(() =>
      expect(h.getDevelopmentBranchStatus).toHaveBeenCalled(),
    );
    expect(screen.queryByTestId("neon-migration-banner")).toBeNull();
  });

  it("does not check apps without a Neon development branch", () => {
    h.app = { id: 1, neonProjectId: null, neonDevelopmentBranchId: null };
    launch();

    expect(h.getDevelopmentBranchStatus).not.toHaveBeenCalled();
    expect(screen.queryByTestId("neon-migration-banner")).toBeNull();
  });

  it("stays closed for the session and comes back on the next launch", async () => {
    const { store, view } = launch();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Dismiss Neon migration banner",
      }),
    );
    expect(screen.queryByTestId("neon-migration-banner")).toBeNull();

    // Navigating away and back in the same session keeps it closed.
    view.unmount();
    launch(store);
    await waitFor(() =>
      expect(h.getDevelopmentBranchStatus).toHaveBeenCalledTimes(2),
    );
    expect(screen.queryByTestId("neon-migration-banner")).toBeNull();
    cleanup();

    // A new launch starts with nothing dismissed.
    launch();
    expect(await screen.findByTestId("neon-migration-banner")).toBeTruthy();
  });

  it("stops the app, migrates, and restarts it", async () => {
    launch();
    const migrate = await screen.findByTestId("neon-migration-banner-migrate");
    h.getDevelopmentBranchStatus.mockResolvedValue({
      needsMigration: false,
      otherApps: [],
      appsDeployingWithDevelopment: [],
      leakedBackups: 0,
      branchCount: 0,
    });

    fireEvent.click(migrate);

    await waitFor(() =>
      expect(screen.queryByTestId("neon-migration-banner")).toBeNull(),
    );
    expect(h.calls).toEqual(["stop", "migrate", "restart"]);
    expect(h.migrateDevelopmentBranch).toHaveBeenCalledWith({ appId: 1 });
    expect(h.restartApp).toHaveBeenCalledWith({ appId: 1 });
  });

  it("shows why a migration failed and restarts the app anyway", async () => {
    h.migrateDevelopmentBranch.mockRejectedValue(
      new Error(
        "Could not migrate the development database: your Neon project is at its plan's branch limit.",
      ),
    );
    launch();

    fireEvent.click(await screen.findByTestId("neon-migration-banner-migrate"));

    const banner = await screen.findByTestId("neon-migration-banner");
    await waitFor(() => expect(banner.textContent).toContain("branch limit"));
    expect(h.restartApp).toHaveBeenCalledWith({ appId: 1 });
    expect(
      screen
        .getByTestId("neon-migration-banner-migrate")
        .hasAttribute("disabled"),
    ).toBe(false);
  });
});
