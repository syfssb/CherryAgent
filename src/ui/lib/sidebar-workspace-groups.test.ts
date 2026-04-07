import { describe, expect, it } from "vitest";
import {
  UNKNOWN_WORKSPACE_GROUP_KEY,
  getWorkspaceDisplayName,
  groupSessionsByWorkspace,
  normalizeWorkspaceGroupKey,
} from "./sidebar-workspace-groups";

describe("sidebar workspace grouping", () => {
  it("uses the full normalized cwd as the grouping key", () => {
    expect(normalizeWorkspaceGroupKey("/Users/demo/app")).toBe("/Users/demo/app");
    expect(normalizeWorkspaceGroupKey("C:\\Users\\demo\\app\\")).toBe("C:/Users/demo/app");
  });

  it("keeps workspaces with the same basename in separate groups", () => {
    const groups = groupSessionsByWorkspace([
      { id: "one", cwd: "/Users/demo/project/app" },
      { id: "two", cwd: "/tmp/sandbox/app" },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.key)).toEqual([
      "/Users/demo/project/app",
      "/tmp/sandbox/app",
    ]);
    expect(groups.map((group) => group.displayName)).toEqual(["app", "app"]);
  });

  it("groups sessions without cwd into a shared fallback bucket", () => {
    const groups = groupSessionsByWorkspace([
      { id: "one" },
      { id: "two", cwd: "" },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe(UNKNOWN_WORKSPACE_GROUP_KEY);
    expect(groups[0].displayName).toBe("—");
    expect(groups[0].sessions.map((session) => session.id)).toEqual(["one", "two"]);
  });

  it("derives the workspace label from the last path segment", () => {
    expect(getWorkspaceDisplayName("/Users/demo/project/app")).toBe("app");
    expect(getWorkspaceDisplayName(undefined)).toBe("—");
  });
});
