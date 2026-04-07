import { describe, expect, it } from "vitest";
import { buildFastSessionTitle, SESSION_TITLE_MAX_LENGTH } from "../lib/session-title";

describe("buildFastSessionTitle", () => {
  it("returns fallback for empty input", () => {
    expect(buildFastSessionTitle("")).toBe("New Session");
    expect(buildFastSessionTitle("   ")).toBe("New Session");
    expect(buildFastSessionTitle(null)).toBe("New Session");
  });

  it("uses first non-empty line as title", () => {
    const input = "\n\n  主办会计岗位职责  \n职责表述一:税务申报";
    expect(buildFastSessionTitle(input)).toBe("主办会计岗位职责");
  });

  it("collapses repeated whitespace", () => {
    const input = "  hello    world   from   cherry ";
    expect(buildFastSessionTitle(input)).toBe("hello world from cherry");
  });

  it("truncates very long title to max length with ellipsis", () => {
    const input = "x".repeat(SESSION_TITLE_MAX_LENGTH + 20);
    const title = buildFastSessionTitle(input);

    expect(title.endsWith("...")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(SESSION_TITLE_MAX_LENGTH + 3);
  });
});
