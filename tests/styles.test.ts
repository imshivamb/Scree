import { describe, expect, it } from "vitest";

import * as publicApi from "../src/engine";
import { styleFragment } from "../src/engine/styles/shaders";
import {
  DEFAULT_STYLE_CONFIGS,
  isStyleId,
  MAX_CELL,
  mergeStyleConfig,
  parseHexColor,
  resolveStyleInput,
  STYLE_IDS,
} from "../src/engine/styles/types";

describe("styles", () => {
  it("lists the styles and has a default config for each", () => {
    expect(STYLE_IDS).toEqual(["none", "dither", "halftone", "ascii", "pixel", "goo"]);
    for (const id of STYLE_IDS) {
      expect(DEFAULT_STYLE_CONFIGS[id].cell).toBeGreaterThanOrEqual(1);
    }
    expect(isStyleId("ascii")).toBe(true);
    expect(isStyleId("crt")).toBe(false);
  });

  it("accepts a bare id or an id with config", () => {
    expect(resolveStyleInput("dither")).toEqual({ id: "dither", config: {} });
    expect(resolveStyleInput({ id: "halftone", cell: 12, palette: "mono" })).toEqual({
      id: "halftone",
      config: { cell: 12, palette: "mono" },
    });
  });

  it("clamps cell size and gain", () => {
    const base = DEFAULT_STYLE_CONFIGS.dither;
    expect(mergeStyleConfig(base, { cell: 500 }).cell).toBe(MAX_CELL);
    expect(mergeStyleConfig(base, { cell: 0 }).cell).toBe(1);
    expect(mergeStyleConfig(base, { cell: 6.6 }).cell).toBe(7);
    expect(mergeStyleConfig(base, { gain: -1 }).gain).toBeGreaterThan(0);
  });

  it("parses hex colours and rejects anything else", () => {
    expect(parseHexColor("#ffffff")).toEqual([1, 1, 1]);
    expect(parseHexColor("#f00")).toEqual([1, 0, 0]);
    expect(() => parseHexColor("red")).toThrow(/hex/);
  });

  it("builds a shader for every drawn style", () => {
    for (const id of STYLE_IDS) {
      if (id === "none") continue;
      expect(styleFragment(id)).toContain("void main()");
    }
  });

  it("is part of the public API without exposing the pass", () => {
    expect(publicApi).toHaveProperty("STYLE_IDS");
    expect(publicApi).toHaveProperty("isStyleId");
    expect(publicApi).not.toHaveProperty("StylePass");
  });
});
