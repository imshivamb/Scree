import type { MatchStrategy } from "../match";
import { createScree, type Scree } from "../scene";
import { createElementTarget, placeSnapshot, targetFromSnapshot } from "../sources/from-dom";
import type { ParticleTarget } from "../sources/types";
import type { StyleInput } from "../styles";

export type DomTransitionOptions = {
  /** Applies the change: swap a route, set state, toggle a class. Await it if it is async. */
  update: () => void | Promise<void>;
  /** A registered effect id. Default "pieces". */
  effect?: string;
  match?: MatchStrategy;
  look?: StyleInput;
  /** Default 0.85 s: an interface should feel quick. */
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
/** Interfaces should feel quick: long enough to follow each piece, short enough not to wait for. */
const DURATION = 0.85;
/** After the element changes, wait this long for hover fades and the like to settle before capturing. */
const SETTLE_MS = 260;

/**
 * Moves at once and settles softly: after a click the motion should answer straight
 * away. Each piece eases in its own flight, so the start is never abrupt.
 */
const ease = (t: number) => 1 - (1 - t) * (1 - t);
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

type DomState = Awaited<ReturnType<typeof createElementTarget>>;

function capture(element: HTMLElement, options: DomPrimeOptions, opaque = false): Promise<DomState> {
  return createElementTarget(element, {
    particleCount: PARTICLES,
    opaque,
    scale: options.scale,
    background: options.background ?? backdrop(element),
  });
}

// ——— Captures made ahead of time ———

type Primed = { target: Promise<DomState>; fresh: boolean; width: number; height: number; stop: () => void };
const primed = new WeakMap<HTMLElement, Primed>();

/**
 * Capture how the element looks now, ahead of a transition, so a click only
 * has to capture the new state. The capture is dropped as soon as the element
 * changes (DOM, hover, focus, size) and redone once it is still again.
 * `transitionDom` primes after every transition; call this once to prime the first.
 */
export function primeDom(element: HTMLElement, options: DomPrimeOptions = {}): void {
  remember(element, options);
}

/** Keep a capture of the element as it is now: `known` when we already have one (the state a transition just landed on). */
function remember(element: HTMLElement, options: DomPrimeOptions, known?: DomState): void {
  const existing = primed.get(element);
  if (existing?.fresh && !known) return;
  existing?.stop();

  const box = element.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return;
  const entry: Primed = {
    target: known ? Promise.resolve(known) : capture(element, options),
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
function before(element: HTMLElement, options: DomPrimeOptions): Promise<DomState> {
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

/** The old screen's picture, laid exactly over the element. */
function coverWith(target: DomState, box: DOMRect): HTMLCanvasElement | null {
  const picture = target.image?.element;
  if (!(picture instanceof HTMLCanvasElement)) return null;
  const cover = document.createElement("canvas");
  cover.width = picture.width;
  cover.height = picture.height;
  cover.getContext("2d")?.drawImage(picture, 0, 0);
  cover.setAttribute("aria-hidden", "true");
  Object.assign(cover.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "2147483647",
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  });
  return cover;
}

/** A new request while one plays: finish what is left this fast, then go on. */
const HURRY_MS = 160;

type Request = {
  element: HTMLElement;
  options: DomTransitionOptions;
  resolve: () => void;
  reject: (error: unknown) => void;
};
const queue: Request[] = [];
let draining = false;
/** Set when a request arrives while a transition plays; the playing one speeds up to finish. */
let rush = false;

/**
 * Play a change to the page as a Scree transition. The element is captured
 * before and after `update`, a canvas is laid over it while the pieces travel,
 * then the live DOM is handed back, so focus, scroll and state are untouched.
 * Elements marked `data-scree="name"` in both states travel as one block.
 * With reduced motion, or if anything cannot be captured, the change is just applied.
 *
 * A change requested while another plays is never dropped: the playing one
 * hurries to its end, then the new one plays. Several quick changes to the same
 * element are applied in order and played as one, to the latest state.
 */
export function transitionDom(element: HTMLElement, options: DomTransitionOptions): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    queue.push({ element, options, resolve, reject });
    if (draining) rush = true;
    else void drain();
  });
}

async function drain(): Promise<void> {
  draining = true;
  try {
    while (queue.length > 0) {
      const first = queue[0] as Request;
      const batch: Request[] = [];
      while (queue.length > 0 && queue[0]?.element === first.element) batch.push(queue.shift() as Request);
      const last = batch[batch.length - 1] as Request;
      rush = false;
      try {
        await play(first.element, {
          ...last.options,
          update: async () => {
            for (const request of batch) await request.options.update();
          },
        });
        for (const request of batch) request.resolve();
      } catch (error) {
        for (const request of batch) request.reject(error);
      }
    }
  } finally {
    draining = false;
  }
}

async function play(element: HTMLElement, options: DomTransitionOptions): Promise<void> {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    await options.update();
    return;
  }

  const shot = { scale: options.scale, background: options.background };
  let from: DomState;
  try {
    from = await before(element, shot);
  } catch {
    await options.update();
    return;
  }

  // Freeze the old screen at once: its picture covers the element while the change
  // is made and captured underneath, so the new screen never shows early.
  const previousOpacity = element.style.opacity;
  const previousTransition = element.style.transition;
  const start = element.getBoundingClientRect();
  const cover = coverWith(from, start);
  if (cover) document.body.appendChild(cover);
  element.style.transition = "none";
  element.style.opacity = "0";
  const reveal = () => {
    element.style.opacity = previousOpacity;
    element.style.transition = previousTransition;
    cover?.remove();
  };

  try {
    await options.update();
  } catch (error) {
    reveal();
    throw error;
  }
  await frame();
  const end = element.getBoundingClientRect();
  let to: DomState;
  let pair: [ParticleTarget, ParticleTarget];
  let box: { left: number; top: number; width: number; height: number };
  try {
    to = await capture(element, shot, true);
    // The element may have changed size or moved (a longer page, a scroll): put both
    // states in the frame they share, each where it really sat, so nothing stretches.
    const same =
      Math.abs(start.left - end.left) < 0.5 &&
      Math.abs(start.top - end.top) < 0.5 &&
      Math.abs(start.width - end.width) < 0.5 &&
      Math.abs(start.height - end.height) < 0.5;
    if (same) {
      pair = [from, to];
      box = end;
    } else {
      const left = Math.min(start.left, end.left);
      const top = Math.min(start.top, end.top);
      box = {
        left,
        top,
        width: Math.max(start.right, end.right) - left,
        height: Math.max(start.bottom, end.bottom) - top,
      };
      // Outside each state's own box the frame stays empty: the live page shows there.
      const place = (state: DomState, at: DOMRect) =>
        targetFromSnapshot(
          placeSnapshot(state.snapshot, { left: at.left - left, top: at.top - top, width: box.width, height: box.height }),
          { particleCount: PARTICLES },
        );
      pair = [place(from, start), place(to, end)];
    }
  } catch {
    // The change is made; without a picture of it, just show it.
    reveal();
    primeDom(element, shot);
    return;
  }

  const shared = overlayEngine();
  const { canvas, surface, engine } = shared;
  shared.runs += 1;
  const ids = [`scree-dom-${shared.runs}-from`, `scree-dom-${shared.runs}-to`] as const;
  let landed = false;
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
    // The element's own surface, where it is in both states.
    const style = getComputedStyle(element);
    const inLeft = Math.max(start.left, end.left);
    const inTop = Math.max(start.top, end.top);
    Object.assign(surface.style, {
      left: `${inLeft}px`,
      top: `${inTop}px`,
      width: `${Math.max(0, Math.min(start.right, end.right) - inLeft)}px`,
      height: `${Math.max(0, Math.min(start.bottom, end.bottom) - inTop)}px`,
      borderRadius: style.borderRadius,
      background: surfaceOf(element),
    });
    engine.resize(Math.round(width), Math.round(height));
    engine.setEffect(options.effect ?? "pieces");
    if (options.match) engine.setMatch(options.match);
    engine.setStyle(options.look ?? "none");
    engine.addTarget(ids[0], pair[0]);
    engine.addTarget(ids[1], pair[1]);
    engine.prepareTransition(ids[0], ids[1], options.match);
    // The last run's pair is no longer on screen; let it go.
    for (const id of shared.ids) engine.removeTarget(id);
    shared.ids = [...ids];
    engine.setPaused(false);
    engine.setProgress(0);
    // Draw the first frame (the old screen, exactly) under the cover, then swap.
    document.body.append(surface, canvas);
    if (cover) document.body.appendChild(cover);
    await frame();
    await frame();
    cover?.remove();

    // Time runs at 1 / duration; when another change is waiting it speeds up so
    // what is left takes HURRY_MS. The motion never jumps, it just finishes sooner.
    let rate = 1 / ((options.durationSeconds ?? DURATION) * 1000);
    let t = 0;
    let last = performance.now();
    await new Promise<void>((resolve) => {
      const step = () => {
        const now = performance.now();
        if (rush) rate = Math.max(rate, (1 - t) / HURRY_MS);
        t = Math.min(1, t + (now - last) * rate);
        last = now;
        engine.setProgress(ease(t));
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    landed = true;
  } finally {
    reveal();
    canvas.remove();
    surface.remove();
    engine.setPaused(true);
    // The page now shows exactly the picture we landed on: keep it for the next change.
    if (landed) remember(element, shot, to);
    else idle(() => primeDom(element, shot));
  }
}
