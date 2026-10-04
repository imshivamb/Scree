import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ExportAspect,
  ExportFormat,
  ExportQuality,
  MatchStrategy,
  PaletteId,
  StyleId,
  TransitionPresetId,
} from "../engine";
import { StudioController, type Sources } from "./controller";
import { DropSlot } from "./DropSlot";
import { imageFromTransfer } from "./images";
import { Stage } from "./Stage";
import { TEMPLATE_ORDER, TEMPLATES, type Look, type SlotId, type TemplateId } from "./templates";
import { Transport } from "./Transport";
import { Section, Segmented, Slider, Swatches } from "./ui";

type Slot = { src: string; name: string; isSample: boolean };
type Slots = Partial<Record<SlotId, Slot>>;

const STYLES: { value: StyleId; label: string }[] = [
  { value: "none", label: "Points" },
  { value: "halftone", label: "Halftone" },
  { value: "dither", label: "Dither" },
  { value: "pixel", label: "Pixel" },
  { value: "ascii", label: "ASCII" },
];
const PALETTES: { value: PaletteId; label: string }[] = [
  { value: "source", label: "Original" },
  { value: "mono", label: "Mono" },
  { value: "duotone", label: "Duotone" },
];
const MOTIONS: { value: TransitionPresetId; label: string; title: string }[] = [
  { value: "flow", label: "Flow", title: "Pieces travel straight to their place" },
  { value: "organic", label: "Organic", title: "A soft cloud between the forms" },
  { value: "reassemble", label: "Gather", title: "Pull in, then settle" },
  { value: "vortex", label: "Vortex", title: "Orbit while travelling" },
  { value: "explode", label: "Burst", title: "Blow apart, then land" },
];
const MATCHES: { value: MatchStrategy; label: string; title: string }[] = [
  { value: "transport", label: "Smart", title: "Pieces find their match by place and colour" },
  { value: "spatial", label: "Shape", title: "By relative place only" },
  { value: "random", label: "Scatter", title: "No pairing — a dissolve" },
];
const ASPECTS: { value: ExportAspect; label: string }[] = [
  { value: "16:9", label: "16:9" },
  { value: "1:1", label: "1:1" },
  { value: "9:16", label: "9:16" },
];
const QUALITIES: { value: ExportQuality; label: string }[] = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
  { value: "4k", label: "4K" },
];
const FORMATS: { value: ExportFormat; label: string; title: string }[] = [
  { value: "mp4", label: "MP4", title: "Video for posts, slides and sites" },
  { value: "png-sequence", label: "PNG frames", title: "Transparent frames (ZIP) for editors" },
];
const BACKGROUNDS = [
  { value: "#07080c", label: "Ink" },
  { value: "#0f1526", label: "Night" },
  { value: "#1b1916", label: "Umber" },
  { value: "transparent", label: "Transparent (PNG frames)" },
] as const;

const reducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function sampleSlots(templateId: TemplateId): Slots {
  const template = TEMPLATES[templateId];
  const slots: Slots = {};
  for (const [id, sample] of Object.entries(template.samples) as [SlotId, { src: string; name: string }][]) {
    slots[id] = { src: sample.src, name: sample.name, isSample: true };
  }
  return slots;
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function codeFor(templateId: TemplateId, look: Look): string {
  const before =
    templateId === "logo"
      ? `createDustTarget({ particleCount })`
      : `await createImageTarget("/before.png", { particleCount })`;
  const after = `await createImageTarget("${templateId === "logo" ? "/logo.png" : "/after.png"}", { particleCount })`;
  return `import { createScree, createImageTarget${templateId === "logo" ? ", createDustTarget" : ""} } from "scree-core";

const particleCount = 128 * 128;
const engine = createScree({
  canvas: document.querySelector("canvas"),
  match: "${look.match}",
  style: { id: "${look.style}", palette: "${look.palette}", cell: ${look.cell} },
});
engine.addTarget("before", ${before});
engine.addTarget("after", ${after});
engine.transition({ from: "before", to: "after", motion: "${look.motion}", durationSeconds: ${look.durationSeconds} });
`;
}

export function App() {
  const [templateId, setTemplateId] = useState<TemplateId>("launch");
  const [slots, setSlots] = useState<Slots>(() => sampleSlots("launch"));
  const [look, setLook] = useState<Look>(TEMPLATES.launch.look);
  const [quality, setQuality] = useState<ExportQuality>("1080p");
  const [format, setFormat] = useState<ExportFormat>("mp4");
  const [background, setBackground] = useState<string>(BACKGROUNDS[0].value);
  const [busy, setBusy] = useState<string | null>("Breaking the first form into pieces…");
  const [error, setError] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [controller, setController] = useState<StudioController | null>(null);
  const started = useRef(false);
  const template = TEMPLATES[templateId];

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const created = new StudioController(canvas, TEMPLATES.launch.look);
    setController(created);
    return () => created.dispose();
  }, []);

  const sources = useMemo<Sources>(
    () => Object.fromEntries(Object.entries(slots).map(([id, slot]) => [id, slot?.src])),
    [slots],
  );

  useEffect(() => {
    if (!controller) return;
    let cancelled = false;
    setBusy("Breaking the forms into pieces…");
    setError(null);
    controller
      .setInputs(template, sources)
      .then(() => {
        if (cancelled) return;
        setBusy(null);
        if (!started.current) {
          started.current = true;
          if (reducedMotion) controller.seek(controller.total);
          else controller.play();
        }
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setBusy(null);
        setError(reason instanceof Error ? reason.message : "Those images could not be used.");
      });
    return () => {
      cancelled = true;
    };
  }, [controller, template, sources]);

  useEffect(() => {
    void controller?.setLook(look);
  }, [controller, look]);

  const chooseTemplate = (id: TemplateId) => {
    if (id === templateId) return;
    setTemplateId(id);
    setSlots(sampleSlots(id));
    setLook(TEMPLATES[id].look);
  };

  const setSlotFile = useCallback((slot: SlotId, file: File) => {
    setSlots((current) => {
      const previous = current[slot];
      if (previous && !previous.isSample) URL.revokeObjectURL(previous.src);
      return { ...current, [slot]: { src: URL.createObjectURL(file), name: file.name, isSample: false } };
    });
  }, []);

  // Paste anywhere: fill the first slot still showing a sample, else the last one.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = imageFromTransfer(event.clipboardData);
      if (!file) return;
      const target =
        template.slots.find((slot) => slots[slot.id]?.isSample !== false)?.id ??
        template.slots[template.slots.length - 1]?.id;
      if (target) setSlotFile(target, file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [template, slots, setSlotFile]);

  const update = (patch: Partial<Look>) => setLook((current) => ({ ...current, ...patch }));

  const runExport = async () => {
    if (!controller) return;
    setError(null);
    setExportProgress(0);
    try {
      const blob = await controller.export({
        format,
        quality,
        background: format === "mp4" && background === "transparent" ? "#000000" : background,
        onProgress: setExportProgress,
      });
      const base = `scree-${template.id}-${look.aspect.replace(":", "x")}`;
      download(blob, `${base}.${format === "mp4" ? "mp4" : "zip"}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Export failed.");
    } finally {
      setExportProgress(null);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(codeFor(templateId, look));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Copy failed. Your browser blocked the clipboard.");
    }
  };

  const usingSamples = template.slots.every((slot) => slots[slot.id]?.isSample);

  return (
    <div className="studio">
      <header className="masthead">
        <a className="brand" href="/">
          Scree
        </a>
        <nav>
          <a href="/playground/">Playground</a>
          <a href="https://github.com/imshivamb/Scree" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </header>

      <section className="hero">
        <h1>Every piece finds its place.</h1>
        <p>
          Drop in two screenshots, or a logo. Scree breaks the first into pieces, settles every piece into its
          place in the next, and exports the clip.
        </p>
      </section>

      <main className="workspace">
        <aside className="rail rail-left" aria-label="Template and inputs">
          <Section title="Template">
            <div className="templates">
              {TEMPLATE_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="template"
                  aria-pressed={id === templateId}
                  onClick={() => chooseTemplate(id)}
                >
                  <strong>{TEMPLATES[id].label}</strong>
                  <span>{TEMPLATES[id].blurb}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section
            title="Your images"
            aside={
              usingSamples ? (
                <span className="tag">Sample</span>
              ) : (
                <button type="button" className="link" onClick={() => setSlots(sampleSlots(templateId))}>
                  Use sample
                </button>
              )
            }
          >
            <div className="slots">
              {template.slots.map((slot) => {
                const value = slots[slot.id];
                return (
                  <DropSlot
                    key={slot.id}
                    label={slot.label}
                    hint={slot.hint}
                    preview={value?.src ?? null}
                    name={value?.name ?? ""}
                    isSample={value?.isSample ?? true}
                    onFile={(file) => setSlotFile(slot.id, file)}
                  />
                );
              })}
            </div>
            {template.removeBackground ? (
              <p className="note">Flat backgrounds are removed automatically.</p>
            ) : (
              <p className="note">Tip: paste a screenshot with Ctrl/⌘ + V.</p>
            )}
          </Section>
        </aside>

        <div className="stage-column">
          <Stage
            aspect={look.aspect}
            background={background}
            canvasRef={canvasRef}
            controller={controller}
            overlay={
              exportProgress !== null
                ? `Exporting ${Math.round(exportProgress * 100)}%`
                : busy
            }
          />
          {controller ? <Transport controller={controller} /> : null}
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <aside className="rail rail-right" aria-label="Look, motion and export">
          <Section title="Look">
            <Segmented label="Style" value={look.style} options={STYLES} onChange={(style) => update({ style })} wrap />
            {look.style !== "none" ? (
              <>
                <Segmented
                  label="Colour"
                  value={look.palette}
                  options={PALETTES}
                  onChange={(palette) => update({ palette })}
                />
                <Slider label="Grain" value={look.cell} min={2} max={18} step={1} unit="px" onChange={(cell) => update({ cell })} />
              </>
            ) : null}
          </Section>

          <Section title="Motion">
            <Segmented label="Motion" value={look.motion} options={MOTIONS} onChange={(motion) => update({ motion })} wrap />
            <Segmented label="Match" value={look.match} options={MATCHES} onChange={(match) => update({ match })} />
            <Slider
              label="Morph"
              value={look.durationSeconds}
              min={0.6}
              max={4}
              step={0.1}
              unit="s"
              onChange={(durationSeconds) => update({ durationSeconds })}
            />
            <Slider
              label="Hold before"
              value={look.holdStartSeconds}
              min={0}
              max={2}
              step={0.1}
              unit="s"
              onChange={(holdStartSeconds) => update({ holdStartSeconds })}
            />
            <Slider
              label="Hold after"
              value={look.holdEndSeconds}
              min={0}
              max={3}
              step={0.1}
              unit="s"
              onChange={(holdEndSeconds) => update({ holdEndSeconds })}
            />
          </Section>

          <Section title="Export">
            <Segmented label="Size" value={look.aspect} options={ASPECTS} onChange={(aspect) => update({ aspect })} />
            <Segmented label="Quality" value={quality} options={QUALITIES} onChange={setQuality} />
            <Segmented label="Format" value={format} options={FORMATS} onChange={setFormat} />
            <div className="row">
              <span className="row-label">Background</span>
              <Swatches label="Background" value={background} options={BACKGROUNDS} onChange={setBackground} />
            </div>
            {format === "mp4" && background === "transparent" ? (
              <p className="note">MP4 cannot be transparent; it will use black. Pick PNG frames for transparency.</p>
            ) : null}
            <button
              type="button"
              className="primary"
              disabled={!controller || Boolean(busy) || exportProgress !== null}
              onClick={() => void runExport()}
            >
              {exportProgress !== null ? `Exporting ${Math.round(exportProgress * 100)}%` : "Export clip"}
            </button>
            <button type="button" className="secondary" onClick={() => void copyCode()}>
              {copied ? "Copied" : "Copy code"}
            </button>
          </Section>
        </aside>
      </main>
    </div>
  );
}
