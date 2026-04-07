import { useState, useCallback, useRef } from "react";

export type RecentWorkspace = {
  path: string;
  lastUsed: number;
  usageCount: number;
  displayName?: string;
};

export type CommonDir = {
  path: string;
  name: string;
  type: string;
};

interface WorkspaceOptionsState {
  recentWorkspaces: RecentWorkspace[];
  commonDirs: CommonDir[];
  loading: boolean;
}

interface UseWorkspaceOptionsReturn extends WorkspaceOptionsState {
  loadOptions: (options?: { force?: boolean }) => Promise<void>;
  refreshOptions: () => Promise<void>;
  selectDirectory: () => Promise<string | null>;
  removeRecent: (path: string) => Promise<void>;
}

/**
 * 共享 hook：加载最近使用的工作目录和常用目录。
 * 供 InlineCwdSelector 和 WorkspaceSelector 复用。
 */
export function useWorkspaceOptions(): UseWorkspaceOptionsReturn {
  const [state, setState] = useState<WorkspaceOptionsState>({
    recentWorkspaces: [],
    commonDirs: [],
    loading: false,
  });
  const loadedRef = useRef(false);

  const fetchData = useCallback(async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const [recentResult, commonResult] = await Promise.all([
        window.electron.workspace.getRecent(8),
        window.electron.workspace.getCommonDirs(),
      ]);

      setState({
        recentWorkspaces:
          recentResult.success && recentResult.data
            ? recentResult.data
            : [],
        commonDirs:
          commonResult.success && commonResult.data
            ? (commonResult.data as CommonDir[])
            : [],
        loading: false,
      });
      return true;
    } catch (error) {
      console.error("[useWorkspaceOptions] Failed to load:", error);
      setState((prev) => ({ ...prev, loading: false }));
      return false;
    }
  }, []);

  const loadOptions = useCallback(
    async (options?: { force?: boolean }) => {
      if (!options?.force && loadedRef.current) return;
      const ok = await fetchData();
      if (ok) {
        loadedRef.current = true;
      }
    },
    [fetchData],
  );

  const refreshOptions = useCallback(async () => {
    const ok = await fetchData();
    if (ok) {
      loadedRef.current = true;
    }
  }, [fetchData]);

  const selectDirectory = useCallback(async (): Promise<string | null> => {
    try {
      const result = await window.electron.selectDirectory();
      return result ?? null;
    } catch (error) {
      console.error("[useWorkspaceOptions] Failed to select directory:", error);
      return null;
    }
  }, []);

  const removeRecent = useCallback(async (path: string) => {
    try {
      await window.electron.workspace.removeRecent(path);
      setState((prev) => ({
        ...prev,
        recentWorkspaces: prev.recentWorkspaces.filter(
          (w) => w.path !== path,
        ),
      }));
    } catch (error) {
      console.error("[useWorkspaceOptions] Failed to remove recent:", error);
    }
  }, []);

  return {
    ...state,
    loadOptions,
    refreshOptions,
    selectDirectory,
    removeRecent,
  };
}
