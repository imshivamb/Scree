import {
  createImageTarget,
  createMeshTarget,
  createProceduralTarget,
  createTextTarget,
  createTorusKnotTarget,
  isDriverId,
  isMatchStrategy,
  isPaletteId,
  isRendererId,
  isStyleId,
  type ExportAspect,
  type ExportFormat,
  type ExportQuality,
  Scree,
  type BehaviorMix,
  type DriverId,
  type MatchStrategy,
  type ProceduralTargetId,
  type TransitionPresetId,
} from "../engine";
import { fieldPointFromClient } from "../engine/drivers/pointer-from-event";
import { scrollProgress } from "../engine/drivers/scroll-progress";
import { sequenceProgress } from "../engine/drivers/sequence-progress";
import {
  getParticleQualityConfig,
  resolveParticleQuality,
} from "../engine/motion";
import { isTransitionPresetId } from "../engine/transitions";

import "./styles.css";

const IMAGE_PRESETS = [
  { id: "mark", src: "/presets/mark.svg" },
  { id: "nova", src: "/presets/nova.svg" },
  { id: "glyph", src: "/presets/glyph.svg" },
  { id: "app-v1", src: "/presets/app-v1.svg" },
  { id: "app-v2", src: "/presets/app-v2.svg" },
] as const;

const SHAPES: ProceduralTargetId[] = [
  "sphere",
  "torus",
  "cube",
  "cylinder",
  "pyramid",
  "helix",
  "spiral",
  "wave",
];

const stage = document.querySelector<HTMLCanvasElement>("#stage");
const statusNode = document.querySelector<HTMLParagraphElement>("#status");
const playButton = document.querySelector<HTMLButtonElement>("#play-custom");
const applyTextButton = document.querySelector<HTMLButtonElement>("#apply-text");
const useKnotButton = document.querySelector<HTMLButtonElement>("#use-knot");
const sourceInput = document.querySelector<HTMLInputElement>("#file-a");
const targetInput = document.querySelector<HTMLInputElement>("#file-b");
const meshInput = document.querySelector<HTMLInputElement>("#file-mesh");
const textInput = document.querySelector<HTMLInputElement>("#text-value");
const textWeight = document.querySelector<HTMLSelectElement>("#text-weight");
const textSize = document.querySelector<HTMLInputElement>("#text-size");
const sourceName = document.querySelector<HTMLElement>("#name-a");
const targetName = document.querySelector<HTMLElement>("#name-b");
const meshName = document.querySelector<HTMLElement>("#name-mesh");
const dropZone = document.querySelector<HTMLElement>(".drop");
const progressInput = document.querySelector<HTMLInputElement>("#progress");
const strengthInput = document.querySelector<HTMLInputElement>("#behavior-strength");
const expandInput = document.querySelector<HTMLInputElement>("#mix-expand");
const turbulenceInput = document.querySelector<HTMLInputElement>("#mix-turbulence");
const orbitInput = document.querySelector<HTMLInputElement>("#mix-orbit");
const mixSliders = document.querySelector<HTMLElement>("#mix-sliders");
const copyButton = document.querySelector<HTMLButtonElement>("#copy-config");
const showcaseButton = document.querySelector<HTMLButtonElement>("#showcase");
const scrollSpace = document.querySelector<HTMLElement>("#scroll-space");
const sizeInput = document.querySelector<HTMLInputElement>("#renderer-size");
const opacityInput = document.querySelector<HTMLInputElement>("#renderer-opacity");
const styleCellInput = document.querySelector<HTMLInputElement>("#style-cell");
const exportAspectInput = document.querySelector<HTMLSelectElement>("#export-aspect");
const exportQualityInput = document.querySelector<HTMLSelectElement>("#export-quality");
const exportFormatInput = document.querySelector<HTMLSelectElement>("#export-format");
const exportClipButton = document.querySelector<HTMLButtonElement>("#export-clip");
const exportStillButton = document.querySelector<HTMLButtonElement>("#export-still");
const kindButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-kind]")];
const presetButtons = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-preset]"),
];
const shapeButtons = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-shape]"),
];
const rendererButtons = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-renderer]"),
];
const transitionButtons = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-transition]"),
];
const driverButtons = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-driver]"),
];
const styleButtons = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-style]"),
];
const paletteButtons = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-palette]"),
];
const matchButtons = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-match]"),
];
const panels = [...document.querySelectorAll<HTMLElement>("[data-panel]")];

if (
  !stage ||
  !statusNode ||
  !playButton ||
  !applyTextButton ||
  !useKnotButton ||
  !sourceInput ||
  !targetInput ||
  !meshInput ||
  !textInput ||
  !textWeight ||
  !textSize ||
  !sourceName ||
  !targetName ||
  !meshName ||
  !dropZone ||
  !progressInput ||
  !strengthInput ||
  !expandInput ||
  !turbulenceInput ||
  !orbitInput ||
  !mixSliders ||
  !copyButton ||
  !showcaseButton ||
  !scrollSpace ||
  !sizeInput ||
  !opacityInput ||
  !styleCellInput ||
  !exportAspectInput ||
  !exportQualityInput ||
  !exportFormatInput ||
  !exportClipButton ||
  !exportStillButton
) {
  throw new Error("Playground markup is missing");
}

const canvas = stage;
const statusEl = statusNode;
const playCustom = playButton;
const applyText = applyTextButton;
const useKnot = useKnotButton;
const fileA = sourceInput;
const fileB = targetInput;
const fileMesh = meshInput;
const textValue = textInput;
const weightControl = textWeight;
const sizeTextControl = textSize;
const nameA = sourceName;
const nameB = targetName;
const nameMesh = meshName;
const sizeControl = sizeInput;
const opacityControl = opacityInput;
const styleCellControl = styleCellInput;
const exportAspect = exportAspectInput;
const exportQuality = exportQualityInput;
const exportFormat = exportFormatInput;
const exportClip = exportClipButton;
const exportStill = exportStillButton;
const strengthControl = strengthInput;
const expandControl = expandInput;
const turbulenceControl = turbulenceInput;
const orbitControl = orbitInput;
const mixPanel = mixSliders;
const copyConfig = copyButton;
const showcaseToggle = showcaseButton;
const scrollTrack = scrollSpace;

let customReady = false;
let liveImageId = "mark";
let liveShapeId: ProceduralTargetId = "sphere";
/** Where the last picked morph started, so a Match change can replay it. */
let previousTarget: string | null = null;
let fileARef: File | null = null;
let fileBRef: File | null = null;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const quality = resolveParticleQuality({
  viewportWidth: window.innerWidth,
  hardwareConcurrency: navigator.hardwareConcurrency,
  reducedMotion,
});
const particleCount = getParticleQualityConfig(quality).particleCount;
const shared = { particleCount, seed: 2026 };

const engine = new Scree({
  canvas,
  quality,
  reducedMotion,
  // Leave room for the side panels; exports fill more of the frame.
  fit: window.innerWidth > 720 ? 0.6 : 0.72,
  onTransitionStateChange: (isTransitioning) => {
    if (!customReady) {
      statusEl.textContent = isTransitioning
        ? "Particles opening…"
        : "Settled. Pick another source.";
    }
  },
  onProgress: (progress) => {
    progressInput.value = String(progress);
  },
  onError: (message) => {
    statusEl.textContent = message;
  },
});

function setPressed(
  buttons: HTMLButtonElement[],
  key: string,
  value: string,
): void {
  for (const button of buttons) {
    button.setAttribute(
      "aria-pressed",
      button.dataset[key] === value ? "true" : "false",
    );
  }
}

function showKind(kind: string): void {
  setPressed(kindButtons, "kind", kind);
  for (const panel of panels) {
    panel.hidden = panel.dataset.panel !== kind;
  }
}

function applyRendererConfig(): void {
  engine.setRenderer(engine.getRenderer(), {
    size: Number(sizeControl.value),
    opacity: Number(opacityControl.value),
  });
}

function syncRendererSliders(): void {
  const look = engine.getRendererConfig();
  sizeControl.value = String(look.size);
  opacityControl.value = String(look.opacity);
}

function resize(): void {
  engine.resize(window.innerWidth, window.innerHeight);
}

function refreshCustomButton(): void {
  playCustom.disabled = !(fileARef && fileBRef);
}

function morphSource(id: string, source: "image" | "text" | "mesh" | "shape"): void {
  customReady = false;
  if (source === "image") liveImageId = id;
  if (source === "shape") liveShapeId = id as ProceduralTargetId;
  const current = engine.getActiveTarget();
  if (current !== id) previousTarget = current;
  engine.morphTo(id);
}

function selectKind(kind: string): void {
  showKind(kind);
  if (kind === "image") {
    morphSource(liveImageId, "image");
    return;
  }
  if (kind === "text") {
    morphSource("text", "text");
    return;
  }
  if (kind === "mesh") {
    morphSource("mesh", "mesh");
    return;
  }
  if (kind === "shape") {
    setPressed(shapeButtons, "shape", liveShapeId);
    morphSource(liveShapeId, "shape");
  }
}

async function start(): Promise<void> {
  statusEl.textContent = "Sampling forms…";
  const images = await Promise.all(
    IMAGE_PRESETS.map(async (preset) => ({
      id: preset.id,
      target: await createImageTarget(preset.src, {
        ...shared,
        seed: shared.seed + preset.id.length,
        alphaThreshold: 24,
        depth: 0.22,
      }),
    })),
  );
  for (const item of images) {
    engine.registerTarget(item.id, item.target);
  }
  engine.registerTarget("text", createTextTarget("HELLO", { ...shared, seed: 11 }));
  engine.registerTarget("mesh", createTorusKnotTarget({ ...shared, seed: 17 }));
  for (const shape of SHAPES) {
    engine.registerTarget(
      shape,
      createProceduralTarget(shape, { ...shared, seed: 30 + shape.length }),
    );
  }
  resize();
  engine.setBehavior("organic");
  engine.morphTo("mark", { durationSeconds: 0 });
  setPressed(presetButtons, "preset", "mark");
  setPressed(shapeButtons, "shape", "sphere");
  setPressed(transitionButtons, "transition", "organic");
  setPressed(driverButtons, "driver", engine.getDriver());
  strengthControl.value = String(engine.getBehavior().strength);
  syncMixSliders();
  showKind("image");
  syncRendererSliders();
  syncStyleControls();
  statusEl.textContent = reducedMotion
    ? "Reduced motion: forms change without the cloud."
    : "Organic mix is on. Click Nova, then try Explode or Showcase.";
}

for (const button of kindButtons) {
  button.addEventListener("click", () => {
    const kind = button.dataset.kind;
    if (kind) selectKind(kind);
  });
}

for (const button of presetButtons) {
  button.addEventListener("click", () => {
    const id = button.dataset.preset;
    if (!id) return;
    setPressed(presetButtons, "preset", id);
    morphSource(id, "image");
  });
}

for (const button of shapeButtons) {
  button.addEventListener("click", () => {
    const id = button.dataset.shape;
    if (!id) return;
    setPressed(shapeButtons, "shape", id);
    morphSource(id, "shape");
  });
}

const TRANSITION_STATUS: Record<TransitionPresetId | "custom", string> = {
  organic: "Expand + turbulence + orbit. The default mix.",
  flow: "Every piece travels straight to its place. Best with Smart match.",
  dissolve: "The form thins through coherent noise.",
  explode: "Expand and scatter at once.",
  implode: "The field pulls in, then settles.",
  vortex: "Orbit with a little expansion.",
  reveal: "Mostly straight travel, a little lift.",
  disperse: "Scatter with leftover turbulence.",
  reassemble: "Implode into a settled form.",
  custom: "Your mix. Drag Expand, Turbulence, and Orbit.",
};

const DRIVER_STATUS: Record<DriverId, string> = {
  auto: "Auto: click Mark, then Nova. The bar plays itself.",
  manual: "Manual: drag Progress halfway, then click Nova. The shape changes. The bar stays.",
  scroll: "Scroll: roll the page. The bar follows the scrollbar.",
  pointer: "Pointer: move the mouse over the shape. Particles push away. Not a zoom.",
};

const SHOWCASE_STEPS = [
  { from: "mark", to: "text", motion: "organic" as const, kind: "text" },
  { from: "text", to: "mesh", motion: "disperse" as const, kind: "mesh" },
  { from: "mesh", to: "sphere", motion: "vortex" as const, kind: "shape" },
  { from: "sphere", to: "mark", motion: "reassemble" as const, kind: "image" },
] as const;

const SHOWCASE_NAMES: Record<string, string> = {
  mark: "Image",
  text: "Text",
  mesh: "3D",
  sphere: "Shape",
};

let showcaseOn = false;
let showcaseStep = -1;

function sliderMix(): BehaviorMix {
  return {
    expand: Number(expandControl.value),
    turbulence: Number(turbulenceControl.value),
    orbit: Number(orbitControl.value),
  };
}

function syncMixSliders(): void {
  const mix = engine.getBehaviorMix();
  expandControl.value = String(mix.expand);
  turbulenceControl.value = String(mix.turbulence);
  orbitControl.value = String(mix.orbit);
}

function showCustomMix(on: boolean): void {
  mixPanel.hidden = !on;
}

function replayIfAuto(): void {
  const current = engine.getActiveTarget();
  if (current && engine.getDriver() === "auto" && !showcaseOn) {
    engine.morphTo(current, { replay: true });
  }
}

for (const button of rendererButtons) {
  button.addEventListener("click", () => {
    const id = button.dataset.renderer;
    if (!id || !isRendererId(id)) return;
    engine.setRenderer(id);
    setPressed(rendererButtons, "renderer", id);
    syncRendererSliders();
    statusEl.textContent =
      "This is the same particle field. Only the renderer changed.";
  });
}

for (const button of transitionButtons) {
  button.addEventListener("click", () => {
    const id = button.dataset.transition;
    if (!id) return;
    if (id === "custom") {
      engine.setBehavior(sliderMix(), { strength: Number(strengthControl.value) });
      setPressed(transitionButtons, "transition", "custom");
      showCustomMix(true);
      replayIfAuto();
      statusEl.textContent = TRANSITION_STATUS.custom;
      return;
    }
    if (!isTransitionPresetId(id)) return;
    engine.setBehavior(id, { strength: Number(strengthControl.value) });
    setPressed(transitionButtons, "transition", id);
    showCustomMix(false);
    syncMixSliders();
    replayIfAuto();
    statusEl.textContent = TRANSITION_STATUS[id];
  });
}

for (const slider of [expandControl, turbulenceControl, orbitControl]) {
  slider.addEventListener("input", () => {
    engine.setBehavior(sliderMix(), { strength: Number(strengthControl.value) });
    setPressed(transitionButtons, "transition", "custom");
    showCustomMix(true);
  });
}

function pageScrollProgress(): number {
  return scrollProgress({
    scrollTop: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: window.innerHeight,
  });
}

function applyShowcaseScroll(): void {
  const { index, local } = sequenceProgress(pageScrollProgress(), SHOWCASE_STEPS.length);
  const step = SHOWCASE_STEPS[index];
  if (!step) return;
  if (index !== showcaseStep) {
    showcaseStep = index;
    engine.transition({ from: step.from, to: step.to, motion: step.motion });
    setPressed(transitionButtons, "transition", step.motion);
    showKind(step.kind);
    if (step.kind === "shape") setPressed(shapeButtons, "shape", "sphere");
    if (step.kind === "image") setPressed(presetButtons, "preset", "mark");
    showCustomMix(false);
    syncMixSliders();
    statusEl.textContent = `Showcase ${index + 1}/${SHOWCASE_STEPS.length}: ${SHOWCASE_NAMES[step.from]} → ${SHOWCASE_NAMES[step.to]}.`;
  }
  engine.setProgress(local);
}

function applyScrollDriver(on: boolean): void {
  document.documentElement.classList.toggle("scroll-drive", on);
  document.body.classList.toggle("scroll-drive", on);
  document.documentElement.classList.toggle("pointer-drive", false);
  document.body.classList.toggle("pointer-drive", false);
  if (!on) {
    document.documentElement.classList.remove("showcase-drive");
    document.body.classList.remove("showcase-drive");
  }
  scrollTrack.hidden = !on;
  if (!on) return;
  if (showcaseOn) {
    applyShowcaseScroll();
    return;
  }
  engine.setProgress(pageScrollProgress());
}

function setShowcase(on: boolean): void {
  showcaseOn = on;
  showcaseStep = -1;
  showcaseToggle.setAttribute("aria-pressed", on ? "true" : "false");
  document.documentElement.classList.toggle("showcase-drive", on);
  document.body.classList.toggle("showcase-drive", on);
  if (!on) return;
  engine.setDriver("scroll");
  setPressed(driverButtons, "driver", "scroll");
  applyScrollDriver(true);
  statusEl.textContent =
    "Scroll the page. Image → Text → 3D → Shape. Same particles the whole way.";
}

function syncStyleControls(): void {
  const { id, config } = engine.getStyle();
  setPressed(styleButtons, "style", id);
  setPressed(paletteButtons, "palette", config.palette);
  styleCellControl.value = String(config.cell);
  styleCellControl.disabled = id === "none";
}

for (const button of styleButtons) {
  button.addEventListener("click", () => {
    const id = button.dataset.style;
    if (!id || !isStyleId(id)) return;
    engine.setStyle(id);
    syncStyleControls();
    statusEl.textContent =
      id === "none" ? "The points as they are." : `${button.textContent ?? id}: same pieces, drawn per cell.`;
  });
}

for (const button of paletteButtons) {
  button.addEventListener("click", () => {
    const palette = button.dataset.palette;
    if (!palette || !isPaletteId(palette)) return;
    const { id } = engine.getStyle();
    if (id === "none") {
      statusEl.textContent = "Pick a style first. Palettes recolour styled cells.";
      return;
    }
    engine.setStyle({ id, palette });
    syncStyleControls();
  });
}

styleCellControl.addEventListener("input", () => {
  const { id } = engine.getStyle();
  if (id !== "none") engine.setStyle({ id, cell: Number(styleCellControl.value) });
});

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function runExport(work: () => Promise<void>): Promise<void> {
  exportClip.disabled = true;
  exportStill.disabled = true;
  try {
    await work();
  } catch (error) {
    statusEl.textContent = error instanceof Error ? error.message : "Export failed.";
  } finally {
    exportClip.disabled = false;
    exportStill.disabled = false;
  }
}

exportClip.addEventListener("click", () => {
  const to = engine.getActiveTarget();
  if (!to) return;
  const from = previousTarget ?? to;
  const format = exportFormat.value as ExportFormat;
  void runExport(async () => {
    const started = performance.now();
    const blob = await engine.record({
      from,
      to,
      format,
      aspect: exportAspect.value as ExportAspect,
      quality: exportQuality.value as ExportQuality,
      onProgress: (fraction) => {
        statusEl.textContent = `Exporting ${from} → ${to}: ${Math.round(fraction * 100)}%`;
      },
    });
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    download(blob, `scree-${from}-to-${to}.${format === "mp4" ? "mp4" : "zip"}`);
    statusEl.textContent = `Exported in ${seconds}s (${(blob.size / 1e6).toFixed(1)} MB).`;
  });
});

exportStill.addEventListener("click", () => {
  void runExport(async () => {
    const blob = await engine.snapshot({
      aspect: exportAspect.value as ExportAspect,
      quality: exportQuality.value as ExportQuality,
    });
    download(blob, `scree-${engine.getActiveTarget() ?? "still"}.png`);
    statusEl.textContent = "Saved a transparent PNG of this frame.";
  });
});

if (import.meta.env.DEV) {
  (window as unknown as { __scree?: Scree }).__scree = engine;
}

const MATCH_STATUS: Record<MatchStrategy, string> = {
  transport: "Smart: every piece finds its place by position and colour. Try App v1 → App v2.",
  spatial: "Spatial: pieces keep their relative place. Colour is ignored.",
  random: "Random: no pairing. The classic dissolve.",
};

for (const button of matchButtons) {
  button.addEventListener("click", () => {
    const id = button.dataset.match;
    if (!id || !isMatchStrategy(id)) return;
    engine.setMatch(id);
    setPressed(matchButtons, "match", id);
    const current = engine.getActiveTarget();
    if (current && previousTarget && previousTarget !== current) {
      engine.transition({ from: previousTarget, to: current, replay: true });
    } else if (current) {
      engine.morphTo(current, { replay: true });
    }
    statusEl.textContent = MATCH_STATUS[id];
  });
}

for (const button of driverButtons) {
  button.addEventListener("click", () => {
    const id = button.dataset.driver;
    if (!id || !isDriverId(id)) return;
    setShowcase(false);
    engine.setDriver(id);
    setPressed(driverButtons, "driver", id);
    applyScrollDriver(id === "scroll");
    document.documentElement.classList.toggle("pointer-drive", id === "pointer");
    document.body.classList.toggle("pointer-drive", id === "pointer");
    statusEl.textContent = DRIVER_STATUS[id];
  });
}

strengthControl.addEventListener("input", () => {
  const current = engine.getBehavior();
  engine.setBehavior(
    current.preset ?? (current.id === "mix" ? current.mix : current.id),
    { strength: Number(strengthControl.value) },
  );
});

function targetSnippet(): { imports: string[]; setup: string; id: string } {
  const active = engine.getActiveTarget() ?? "sphere";
  const particleCount = getParticleQualityConfig(quality).particleCount;
  const options = `{ particleCount: ${particleCount} }`;

  if (active === "text") {
    return {
      imports: ["createTextTarget"],
      setup: `const target = createTextTarget(${JSON.stringify(textValue.value)}, ${options});`,
      id: "text",
    };
  }

  if (active === "sphere") {
    return {
      imports: ["createSphereTarget"],
      setup: `const target = createSphereTarget(${options});`,
      id: "sphere",
    };
  }

  if (SHAPES.includes(active as ProceduralTargetId)) {
    return {
      imports: ["createProceduralTarget"],
      setup: `const target = createProceduralTarget(${JSON.stringify(active)}, ${options});`,
      id: active,
    };
  }

  if (active === "mesh") {
    return {
      imports: ["createMeshTarget"],
      setup: `// Replace this URL with your GLB or GLTF asset.\nconst target = await createMeshTarget("/assets/your-model.glb", ${options});`,
      id: "mesh",
    };
  }

  return {
    imports: ["createImageTarget"],
    setup: `// Replace this URL with your image or SVG asset.\nconst target = await createImageTarget("/assets/your-image.png", ${options});`,
    id: active,
  };
}

function copySnippet(): string {
  const mix = engine.getBehaviorMix();
  const compact = Object.fromEntries(
    Object.entries(mix).filter(([, value]) => value > 0),
  );
  const target = targetSnippet();
  const imports = ["createScree", ...target.imports].join(", ");
  const driver = engine.getDriver();
  const progress =
    driver === "auto"
      ? ""
      : `\nengine.setDriver(${JSON.stringify(driver)});\nengine.setProgress(${engine.getProgress().toFixed(3)});`;
  const match = engine.getMatch();
  const style = engine.getStyle();
  const extras = [
    match === "transport" ? "" : `match: ${JSON.stringify(match)}`,
    style.id === "none" ? "" : `style: ${JSON.stringify({ id: style.id, ...style.config })}`,
  ].filter(Boolean);
  const createOptions = extras.length ? `{ canvas, ${extras.join(", ")} }` : "{ canvas }";
  return `import { ${imports} } from "scree-core";

const canvas = document.querySelector("canvas");
if (!canvas) throw new Error("Scree canvas not found.");

const engine = createScree(${createOptions});
${target.setup}
engine.addTarget(${JSON.stringify(target.id)}, target);
engine.setRenderer(${JSON.stringify(engine.getRenderer())});
engine.transition({
  to: ${JSON.stringify(target.id)},
  motion: ${JSON.stringify(compact)},
});${progress}

// Call engine.dispose() when this canvas is removed.
`;
}

copyConfig.addEventListener("click", async () => {
  const snippet = copySnippet();
  try {
    await navigator.clipboard.writeText(snippet);
    statusEl.textContent =
      "Copied a snippet for this look. Paste it next to a Scree canvas in your own page.";
  } catch {
    statusEl.textContent = `Paste this next to a Scree canvas: ${snippet}`;
  }
});

showcaseToggle.addEventListener("click", () => {
  setShowcase(!showcaseOn);
  if (!showcaseOn) {
    engine.setDriver("auto");
    setPressed(driverButtons, "driver", "auto");
    applyScrollDriver(false);
    statusEl.textContent = "Showcase off. Auto is back.";
  }
});

sizeControl.addEventListener("input", () => {
  applyRendererConfig();
  statusEl.textContent = "Renderer size is a multiplier around the auto default.";
});

opacityControl.addEventListener("input", () => {
  applyRendererConfig();
});

applyText.addEventListener("click", () => {
  applyText.disabled = true;
  statusEl.textContent = "Setting text…";
  try {
    engine.registerTarget(
      "text",
      createTextTarget(textValue.value, {
        ...shared,
        seed: 11,
        weight: weightControl.value,
        size: Number(sizeTextControl.value),
      }),
    );
    morphSource("text", "text");
    statusEl.textContent = "Text is now a particle target.";
  } catch (error) {
    statusEl.textContent =
      error instanceof Error ? error.message : "That text could not be sampled.";
  } finally {
    applyText.disabled = false;
  }
});

useKnot.addEventListener("click", () => {
  engine.registerTarget("mesh", createTorusKnotTarget({ ...shared, seed: 17 }));
  nameMesh.textContent = "Knot";
  morphSource("mesh", "mesh");
  statusEl.textContent = "Built-in knot. Same field.";
});

async function loadMeshFile(file: File): Promise<void> {
  nameMesh.textContent = "Sampling…";
  statusEl.textContent = "Reading this model…";
  useKnot.disabled = true;
  applyText.disabled = true;
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  try {
    const target = await createMeshTarget(file, { ...shared, seed: 19 });
    engine.registerTarget("mesh", target);
    nameMesh.textContent = file.name;
    morphSource("mesh", "mesh");
    statusEl.textContent = "Mesh surface sampled. Files stayed in this tab.";
  } catch {
    nameMesh.textContent = "Drop a model";
    statusEl.textContent = "That model could not be sampled. Use a GLB or GLTF.";
  } finally {
    useKnot.disabled = false;
    applyText.disabled = false;
  }
}

fileMesh.addEventListener("change", () => {
  const file = fileMesh.files?.[0];
  if (!file) return;
  void loadMeshFile(file);
});

fileA.addEventListener("change", () => {
  fileARef = fileA.files?.[0] ?? null;
  nameA.textContent = fileARef?.name ?? "Source";
  refreshCustomButton();
});

fileB.addEventListener("change", () => {
  fileBRef = fileB.files?.[0] ?? null;
  nameB.textContent = fileBRef?.name ?? "Target";
  refreshCustomButton();
});

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || file.name.endsWith(".svg");
}

function assignDroppedFiles(files: File[]): void {
  const mesh = files.find(
    (file) =>
      file.name.endsWith(".glb") ||
      file.name.endsWith(".gltf") ||
      file.type.includes("gltf"),
  );
  if (mesh) {
    showKind("mesh");
    void loadMeshFile(mesh);
    return;
  }

  const images = files.filter(isImageFile).slice(0, 2);
  if (images[0] && (images[1] || !fileARef)) {
    fileARef = images[0];
    nameA.textContent = images[0].name;
  } else if (images[0]) {
    fileBRef = images[0];
    nameB.textContent = images[0].name;
  }
  if (images[1]) {
    fileBRef = images[1];
    nameB.textContent = images[1].name;
  }
  if (images.length > 0) showKind("image");
  refreshCustomButton();
}

progressInput.addEventListener("input", () => {
  if (engine.getDriver() === "auto") {
    setShowcase(false);
    engine.setDriver("manual");
    setPressed(driverButtons, "driver", "manual");
    applyScrollDriver(false);
  }
  engine.setProgress(Number(progressInput.value));
  statusEl.textContent = "Progress is driven by the slider.";
});

window.addEventListener(
  "scroll",
  () => {
    if (engine.getDriver() !== "scroll") return;
    if (showcaseOn) {
      applyShowcaseScroll();
      return;
    }
    engine.setProgress(pageScrollProgress());
  },
  { passive: true },
);

window.addEventListener("pointermove", (event) => {
  if (engine.getDriver() !== "pointer") return;
  engine.setPointer(
    fieldPointFromClient({
      clientX: event.clientX,
      clientY: event.clientY,
      width: window.innerWidth,
      height: window.innerHeight,
    }),
  );
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  assignDroppedFiles([...(event.dataTransfer?.files ?? [])]);
});

playCustom.addEventListener("click", async () => {
  if (!fileARef || !fileBRef) return;
  playCustom.disabled = true;
  statusEl.textContent = "Sampling your images in this browser…";
  try {
    const [source, destination] = await Promise.all([
      createImageTarget(fileARef, { ...shared, seed: 11 }),
      createImageTarget(fileBRef, { ...shared, seed: 17 }),
    ]);
    engine.registerTarget("custom-a", source);
    engine.registerTarget("custom-b", destination);
    customReady = true;
    setPressed(presetButtons, "preset", "");
    liveImageId = "custom-b";
    engine.morphTo("custom-a", { durationSeconds: 0 });
    engine.morphTo("custom-b");
    showKind("image");
    statusEl.textContent = "Your images never left this tab.";
  } catch {
    statusEl.textContent =
      "Those files could not be sampled. Use a PNG, WebP, JPEG, or SVG with a clear silhouette.";
  } finally {
    refreshCustomButton();
  }
});

window.addEventListener("resize", resize);
window.addEventListener("pagehide", () => engine.dispose());

void start().catch(() => {
  statusEl.textContent = "The particle stage could not start in this browser.";
});
