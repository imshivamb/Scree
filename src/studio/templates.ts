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

export type SampleSet = {
  id: string;
  label: string;
  slots: Partial<Record<SlotId, { src: string; name: string }>>;
};

export type Template = {
  id: TemplateId;
  label: string;
  blurb: string;
  /** Slots the person fills. A missing "before" means the clip starts from dust. */
  slots: { id: SlotId; label: string; hint: string }[];
  /** Ready-made pairs to try the template with; the first is shown on load. */
  samples: SampleSet[];
  /** Make a flat background transparent before sampling (logos). */
  removeBackground: boolean;
  /** Relief from luminance: 0 keeps screenshots flat. */
  depth: number;
  look: Look;
};

export const TEMPLATES: Record<TemplateId, Template> = {
  launch: {
    id: "launch",
    label: "Before → After",
    blurb: "Any picture becomes the next one.",
    slots: [
      { id: "before", label: "Before", hint: "Screenshot, photo or logo" },
      { id: "after", label: "After", hint: "What it becomes" },
    ],
    samples: [
      {
        id: "light-app",
        label: "Redesign",
        slots: {
          before: { src: "/presets/app-light-v1.svg", name: "App, before" },
          after: { src: "/presets/app-light-v2.svg", name: "App, redesigned" },
        },
      },
      {
        id: "landscape",
        label: "Dawn → Dusk",
        slots: {
          before: { src: "/presets/landscape-dawn.svg", name: "Dawn" },
          after: { src: "/presets/landscape-dusk.svg", name: "Dusk" },
        },
      },
      {
        id: "rebrand",
        label: "Rebrand",
        slots: {
          before: { src: "/presets/logo-old.svg", name: "Old logo" },
          after: { src: "/presets/logo-new.svg", name: "New logo" },
        },
      },
      {
        id: "dark-app",
        label: "Dark UI",
        slots: {
          before: { src: "/presets/app-v1.svg", name: "Dark app v1" },
          after: { src: "/presets/app-v2.svg", name: "Dark app v2" },
        },
      },
    ],
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
    samples: [
      { id: "northwind", label: "Northwind", slots: { after: { src: "/presets/logo-new.svg", name: "Northwind" } } },
      { id: "mark", label: "Mark", slots: { after: { src: "/presets/mark.svg", name: "Mark" } } },
    ],
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
