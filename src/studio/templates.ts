import type {
  ExportAspect,
  MatchStrategy,
  PaletteId,
  StyleId,
} from "../engine";

export type TemplateId = "launch" | "logo";
export type SlotId = "before" | "after";

export type Look = {
  /** A registered effect id (`listEffects()`). */
  effect: string;
  style: StyleId;
  palette: PaletteId;
  cell: number;
  match: MatchStrategy;
  durationSeconds: number;
  holdStartSeconds: number;
  holdEndSeconds: number;
  aspect: ExportAspect;
};

export type Template = {
  id: TemplateId;
  label: string;
  blurb: string;
  /** Slots the person fills. A missing "before" means the clip starts from dust. */
  slots: { id: SlotId; label: string; hint: string }[];
  samples: Partial<Record<SlotId, { src: string; name: string }>>;
  /** Make a flat background transparent before sampling (logos). */
  removeBackground: boolean;
  /** Relief from luminance: 0 keeps screenshots flat. */
  depth: number;
  look: Look;
};

export const TEMPLATES: Record<TemplateId, Template> = {
  launch: {
    id: "launch",
    label: "Launch clip",
    blurb: "Old screen becomes the new one.",
    slots: [
      { id: "before", label: "Before", hint: "Screenshot of the old version" },
      { id: "after", label: "After", hint: "Screenshot of the new version" },
    ],
    samples: {
      before: { src: "/presets/app-v1.svg", name: "Sample app v1" },
      after: { src: "/presets/app-v2.svg", name: "Sample app v2" },
    },
    removeBackground: false,
    depth: 0.04,
    look: {
      effect: "pieces",
      style: "none",
      palette: "source",
      cell: 6,
      match: "transport",
      durationSeconds: 1.8,
      holdStartSeconds: 0.6,
      holdEndSeconds: 1.2,
      aspect: "16:9",
    },
  },
  logo: {
    id: "logo",
    label: "Logo reveal",
    blurb: "Loose pieces gather into your mark.",
    slots: [{ id: "after", label: "Logo", hint: "PNG or SVG, any background" }],
    samples: { after: { src: "/presets/mark.svg", name: "Sample mark" } },
    removeBackground: true,
    depth: 0.14,
    look: {
      effect: "dust",
      style: "none",
      palette: "source",
      cell: 4,
      match: "transport",
      durationSeconds: 2.2,
      holdStartSeconds: 0.3,
      holdEndSeconds: 1.6,
      aspect: "1:1",
    },
  },
};

export const TEMPLATE_ORDER: TemplateId[] = ["launch", "logo"];
