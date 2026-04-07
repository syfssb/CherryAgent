import { useCallback, useEffect, useState } from "react";

const CHAT_MIN_WIDTH = 640;
const BREAKPOINT_NARROW = 1200;

export interface AppLayout {
  sidebarWidth: number;
  fileExplorerWidth: number;
  autoCollapseFileExplorer: boolean;
}

export interface AppLayoutState {
  layout: AppLayout;
  sidebarCollapsed: boolean;
  fileExplorerCollapsed: boolean;
  effectiveSidebarWidth: number;
  fileExplorerWidth: number;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  setFileExplorerCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  toggleSidebar: () => void;
}

export function useAppLayout(
  activeSessionCwd: string | undefined,
  activeSessionId: string | null
): AppLayoutState {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [fileExplorerPreference, setFileExplorerPreference] = useState<"auto" | "open" | "closed">("auto");
  const [layout, setLayout] = useState<AppLayout>({
    sidebarWidth: 280,
    fileExplorerWidth: 256,
    autoCollapseFileExplorer: false,
  });

  useEffect(() => {
    const handleResize = () => {
      const windowWidth = window.innerWidth;
      const sidebarWidth = windowWidth < BREAKPOINT_NARROW ? 220 : 280;
      const fileWidth = windowWidth < BREAKPOINT_NARROW ? 200 : 256;
      const autoCollapseFileExplorer =
        windowWidth < sidebarWidth + fileWidth + CHAT_MIN_WIDTH;
      setLayout({
        sidebarWidth,
        fileExplorerWidth: fileWidth,
        autoCollapseFileExplorer,
      });
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const hasActiveWorkspace = Boolean(activeSessionId && activeSessionCwd);
  const fileExplorerCollapsed = !hasActiveWorkspace
    ? true
    : layout.autoCollapseFileExplorer
      ? fileExplorerPreference !== "open"
      : fileExplorerPreference === "closed";

  const effectiveSidebarWidth = sidebarCollapsed ? 64 : layout.sidebarWidth;

  const fileExplorerWidth =
    activeSessionCwd && !fileExplorerCollapsed && !layout.autoCollapseFileExplorer
      ? layout.fileExplorerWidth
      : 0;

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const setFileExplorerCollapsed = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (value) => {
      setFileExplorerPreference((previousPreference) => {
        const previousCollapsed = !hasActiveWorkspace
          ? true
          : layout.autoCollapseFileExplorer
            ? previousPreference !== "open"
            : previousPreference === "closed";
        const nextCollapsed = typeof value === "function"
          ? value(previousCollapsed)
          : value;
        return nextCollapsed ? "closed" : "open";
      });
    },
    [hasActiveWorkspace, layout.autoCollapseFileExplorer],
  );

  return {
    layout,
    sidebarCollapsed,
    fileExplorerCollapsed,
    effectiveSidebarWidth,
    fileExplorerWidth,
    setSidebarCollapsed,
    setFileExplorerCollapsed,
    toggleSidebar,
  };
}
