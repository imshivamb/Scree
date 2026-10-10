import type { MatchStrategy } from "../match";
import { createScree, type Scree } from "../scene";
import { createElementTarget } from "../sources/from-dom";
import type { ParticleTarget } from "../sources/types";
import type { StyleInput } from "../styles";

export type DomTransitionOptions = {
  /** Applies the change: swap a route, set state, toggle a class. Await it if it is async. */
  update: () => void | Promise<void>;
  /** A registered effect id. Default "pieces". */
  effect?: string;
  match?: MatchStrategy;
  look?: StyleInput;
  durationSeconds?: number;
  /** Paint behind transparent areas. Default: the nearest background behind the element. */
  background?: string;
  /** Pixels per CSS pixel for the snapshots. Default: the device pixel ratio, capped at 2. */
  scale?: number;
};

export type DomPrimeOptions = Pick<DomTransitionOptions, "background" | "scale">;

/** The overlay reaches this much past the element (as a factor of its size), so lifted pieces are not cut off. */
const SPREAD = 1.3;
/** Interface pieces are big; a light point field keeps capture fast. Shared by every overlay. */
const PARTICLES = 64 * 64;
/** After the element changes, wait this long for hover fades and the like to settle before capturing. */
const SETTLE_MS = 260;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const idle = (callback: () => void) =>
  typeof requestIdleCallback === "function" ? requestIdleCallback(callback, { timeout: 500 }) : setTimeout(callback, 50);

function parseColor(value: string): [number, number, number, number] | null {
  const match = /rgba?\(([^)]+)\)/.exec(value);
  if (!match) return null;
  const parts = (match[1] as string).split(/[\s,/]+/).filter(Boolean).map(Number);
  const [r = 0, g = 0, b = 0, a = 1] = parts;
  return [r, g, b, Number.isFinite(a) ? a : 1];
}

/** Backgrounds from `start` up, composited down to the first opaque one. */
function seenColor(start: Element | null): string {
  const layers: [number, number, number, number][] = [];
  for (let node: Element | null = start; node; node = node.parentElement) {
    const color = parseColor(getComputedStyle(node).backgroundColor);
    if (!color || color[3] <= 0) continue;
    layers.push(color);
    if (color[3] >= 0.999) break;
  }
  let [r, g, b] = [255, 255, 255];
  for (const [lr, lg, lb, la] of layers.reverse()) {
    r = lr * la + r * (1 - la);
    g = lg * la + g * (1 - la);
    b = lb * la + b * (1 - la);
  }
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/** What is seen around the element, so its rounded corners blend with what surrounds them. */
const backdrop = (element: Element) => seenColor(element.parentElement);
/** What is seen on the element itself: the surface its content moves across. */
const surfaceOf = (element: Element) => seenColor(element);

function capture(element: HTMLElement, options: DomPrimeOptions): Promise<ParticleTarget> {
  return createElementTarget(element, {
    particleCount: PARTICLES,
    scale: options.scale,
    background: options.background ?? backdrop(element),
  });
}

// ——— Captures made ahead of time ———

type Primed = { target: Promise<ParticleTarget>; fresh: boolean; width: number; height: number; stop: () => void };
const primed = new WeakMap<HTMLElement, Primed>();

/**
 * Capture how the element looks now, ahead of a transition, so a click only
 * has to capture the new state. The capture is dropped as soon as the element
 * changes (DOM, hover, focus, size) and redone once it is still again.
 * `transitionDom` primes after every transition; call this once to prime the first.
 */
export function primeDom(element: HTMLElement, options: DomPrimeOptions = {}): void {
  const existing = primed.get(element);
  if (existing?.fresh) return;
  existing?.stop();

  const box = element.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return;
  const entry: Primed = {
    target: capture(element, options),
    fresh: true,
    width: Math.round(box.width),
    height: Math.round(box.height),
    stop: () => undefined,
  };
  entry.target.catch(() => {
    entry.fresh = false;
  });

  let timer = 0;
  const stale = () => {
    if (!entry.fresh) return;
    entry.fresh = false;
    stop();
    window.clearTimeout(timer);
    timer = window.setTimeout(() => idle(() => primeDom(element, options)), SETTLE_MS);
  };
  const mutations = new MutationObserver(stale);
  mutations.observe(element, { subtree: true, childList: true, attributes: true, characterData: true });
  const resize = new ResizeObserver(() => {
    const now = element.getBoundingClientRect();
    if (Math.round(now.width) !== entry.width || Math.round(now.height) !== entry.height) stale();
  });
  resize.observe(element);
  const events = ["pointerover", "pointerout", "focusin", "focusout", "input"] as const;
  for (const name of events) element.addEventListener(name, stale, { passive: true });
  const stop = () => {
    mutations.disconnect();
    resize.disconnect();
    for (const name of events) element.removeEventListener(name, stale);
  };
  entry.stop = () => {
    stop();
    window.clearTimeout(timer);
  };
  primed.set(element, entry);
}

/** The primed capture if it still matches the element, else a fresh one. */
function before(element: HTMLElement, options: DomPrimeOptions): Promise<ParticleTarget> {
  const entry = primed.get(element);
  primed.delete(element);
  entry?.stop();
  return entry?.fresh ? entry.target : capture(element, options);
}

// ——— One overlay, reused ———

/** Kept between runs, detached from the page and paused while idle. */
let overlay: {
  canvas: HTMLCanvasElement;
  /** The element's own surface, under the pieces, so gaps show the app rather than a hole. */
  surface: HTMLDivElement;
  engine: Scree;
  ids: string[];
  runs: number;
} | null = null;

function overlayEngine() {
  if (overlay) return overlay;
  const layer = { position: "fixed", pointerEvents: "none", zIndex: "2147483647", left: "0", top: "0" };
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, layer);
  const surface = document.createElement("div");
  surface.setAttribute("aria-hidden", "true");
  Object.assign(surface.style, layer);
  const engine = createScree({ canvas, fit: 1 / SPREAD, framing: "picture", reducedMotion: false });
  engine.setDriver("manual");
  engine.setPaused(true);
  overlay = { canvas, surface, engine, ids: [], runs: 0 };
  return overlay;
}

let running: Promise<void> = Promise.resolve();

/**
 * Play a change to the page as a Scree transition. The element is captured
 * before and after `update`, a canvas is laid over it while the pieces travel,
 * then the live DOM is handed back, so focus, scroll and state are untouched.
 * Elements marked `data-scree="name"` in both states travel as one block.
 * With reduced motion, or if anything cannot be captured, the change is just applied.
 * Transitions on the page run one after another.
 */
export function transitionDom(element: HTMLElement, options: DomTransitionOptions): Promise<void> {
  const next = running.then(() => play(element, options));
  running = next.catch(() => undefined);
  return next;
}

async function play(element: HTMLElement, options: DomTransitionOptions): Promise<void> {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    await options.update();
    return;
  }

  const shot = { scale: options.scale, background: options.background };
  let from: ParticleTarget;
  try {
    from = await before(element, shot);
  } catch {
    await options.update();
    return;
  }

  await options.update();
  await frame();
  const box = element.getBoundingClientRect();
  let to: ParticleTarget;
  try {
    to = await capture(element, shot);
  } catch {
    primeDom(element, shot);
    return;
  }

  const shared = overlayEngine();
  const { canvas, surface, engine } = shared;
  shared.runs += 1;
  const ids = [`scree-dom-${shared.runs}-from`, `scree-dom-${shared.runs}-to`] as const;
  const previousOpacity = element.style.opacity;
  const previousTransition = element.style.transition;
  try {
    // The canvas is the element's box grown by SPREAD about its centre; the framing
    // shrinks by the same factor, so the picture still lands on the element exactly.
    const width = box.width * SPREAD;
    const height = box.height * SPREAD;
    Object.assign(canvas.style, {
      left: `${box.left - (width - box.width) / 2}px`,
      top: `${box.top - (height - box.height) / 2}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
    const style = getComputedStyle(element);
    Object.assign(surface.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      borderRadius: style.borderRadius,
      background: surfaceOf(element),
    });
    document.body.append(surface, canvas);
    engine.resize(Math.round(width), Math.round(height));
    engine.setEffect(options.effect ?? "pieces");
    if (options.match) engine.setMatch(options.match);
    engine.setStyle(options.look ?? "none");
    engine.addTarget(ids[0], from);
    engine.addTarget(ids[1], to);
    engine.prepareTransition(ids[0], ids[1], options.match);
    // The last run's pair is no longer on screen; let it go.
    for (const id of shared.ids) engine.removeTarget(id);
    shared.ids = [...ids];
    engine.setPaused(false);
    engine.setProgress(0);
    await frame();

    // Hide the live element (opacity keeps focus and layout) while the overlay plays.
    element.style.transition = "none";
    element.style.opacity = "0";

    const total = (options.durationSeconds ?? 1.4) * 1000;
    const started = performance.now();
    await new Promise<void>((resolve) => {
      const step = () => {
        const t = Math.min(1, (performance.now() - started) / total);
        engine.setProgress(ease(t));
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  } finally {
    element.style.opacity = previousOpacity;
    element.style.transition = previousTransition;
    canvas.remove();
    surface.remove();
    engine.setPaused(true);
    idle(() => primeDom(element, shot));
  }
}
