/**
 * A style is how the field is drawn on screen after the points are placed.
 * `none` draws the points as they are; the others redraw the field per cell.
 */
export const STYLE_IDS = ["none", "dither", "halftone", "ascii", "pixel", "goo"] as const;
export type StyleId = (typeof STYLE_IDS)[number];

/** Colour source for a style: the form's own colours, one ink, or two tones. */
export const PALETTE_IDS = ["source", "mono", "duotone"] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];

export type StyleConfig = {
  /** Cell size in CSS pixels. */
  cell: number;
  palette: PaletteId;
  /** Main colour for `mono` and the light end of `duotone` (CSS hex). */
  ink: string;
  /** Dark end of `duotone` (CSS hex). */
  shade: string;
  /** How strongly sparse points read as filled. */
  gain: number;
};

export type StyleInput = StyleId | ({ id: StyleId } & Partial<StyleConfig>);

const BASE: Omit<StyleConfig, "cell"> = {
  palette: "source",
  ink: "#eef3ff",
  shade: "#24304a",
  gain: 2.4,
};

export const DEFAULT_STYLE_CONFIGS: Record<StyleId, StyleConfig> = {
  none: { ...BASE, cell: 1 },
  dither: { ...BASE, cell: 3 },
  halftone: { ...BASE, cell: 9 },
  ascii: { ...BASE, cell: 12, palette: "mono" },
  pixel: { ...BASE, cell: 8 },
  goo: { ...BASE, cell: 6 },
};

export const MIN_CELL = 1;
export const MAX_CELL = 48;

export function isStyleId(value: string): value is StyleId {
  return (STYLE_IDS as readonly string[]).includes(value);
}

export function isPaletteId(value: string): value is PaletteId {
  return (PALETTE_IDS as readonly string[]).includes(value);
}

export function resolveStyleInput(input: StyleInput): {
  id: StyleId;
  config: Partial<StyleConfig>;
} {
  if (typeof input === "string") return { id: input, config: {} };
  const { id, ...config } = input;
  return { id, config };
}

/** Merge a partial config over a base and clamp it to safe values. */
export function mergeStyleConfig(
  base: StyleConfig,
  patch: Partial<StyleConfig>,
): StyleConfig {
  const merged = { ...base, ...patch };
  return {
    ...merged,
    cell: Math.min(MAX_CELL, Math.max(MIN_CELL, Math.round(merged.cell))),
    gain: Math.min(8, Math.max(0.1, merged.gain)),
  };
}

/** `#rgb` or `#rrggbb` → linear-ish 0..1 triple (no colour management). */
export function parseHexColor(hex: string): [number, number, number] {
  const value = hex.trim().replace(/^#/, "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) {
    throw new Error(`Style colours must be hex like #eef3ff, got "${hex}"`);
  }
  return [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

export function paletteIndex(palette: PaletteId): number {
  return PALETTE_IDS.indexOf(palette);
}
