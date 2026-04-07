import { describe, expect, it } from "vitest";

import {
  buildChatViewportInsetStyle,
  buildFixedBottomInsetStyle,
} from "./layout-insets";

describe("layout insets", () => {
  it("returns no chat viewport style when right inset is missing", () => {
    expect(buildChatViewportInsetStyle()).toBeUndefined();
    expect(buildChatViewportInsetStyle(0)).toBeUndefined();
  });

  it("extends chat viewport right padding by the file explorer width", () => {
    expect(buildChatViewportInsetStyle(256)).toEqual({
      paddingRight: "calc(1.5rem + 256px)",
    });
  });

  it("builds fixed shell insets from both left and right overlays", () => {
    expect(buildFixedBottomInsetStyle({ leftInset: 64, rightInset: 256 })).toEqual({
      left: "64px",
      right: "256px",
    });
  });

  it("drops invalid inset values", () => {
    expect(buildFixedBottomInsetStyle({ leftInset: -1, rightInset: Number.NaN })).toBeUndefined();
  });
});
