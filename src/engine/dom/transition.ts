import { createScree } from "../scene";
import { createElementTarget } from "../sources/from-dom";
import type { MatchStrategy } from "../match";
import type { StyleInput } from "../styles";

export type DomTransitionOptions = {
  /** Applies the change: swap a route, set state, toggle a class. Await it if it is async. */
  update: () => void | Promise<void>;
  /** A registered effect id. Default "pieces". */
  effect?: string;
  match?: MatchStrategy;
  look?: StyleInput;
  durationSeconds?: number;
  /** Paint behind transparent areas. Default: the element's own computed background, else the page's. */
  background?: string;
  /** Pixels per CSS pixel for the snapshots. */
  scale?: number;
};

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function backdrop(element: Element): string {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (color && color !== "transparent" && !/rgba\(.*,\s*0\)$/.test(color)) return color;
  }
  return "#ffffff";
}

/**
 * Play a change to the page as a Scree transition. The element is captured
 * before and after `update`, a canvas is laid over it while the pieces travel,
 * then the live DOM is handed back, so focus, scroll and state are untouched.
 * With reduced motion, or if anything cannot be captured, the change is just applied.
 */
export async function transitionDom(element: HTMLElement, options: DomTransitionOptions): Promise<void> {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    await options.update();
    return;
  }

  const background = options.background ?? backdrop(element);
  const capture = { scale: options.scale, background };
  let before: Awaited<ReturnType<typeof createElementTarget>>;
  try {
    before = await createElementTarget(element, capture);
  } catch {
    await options.update();
    return;
  }

  const box = element.getBoundingClientRect();
  await options.update();
  await frame();

  let after: Awaited<ReturnType<typeof createElementTarget>>;
  try {
    after = await createElementTarget(element, capture);
  } catch {
    return;
  }

  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, {
    position: "fixed",
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    pointerEvents: "none",
    zIndex: "2147483647",
  });
  canvas.setAttribute("aria-hidden", "true");
  const previousOpacity = element.style.opacity;
  const previousTransition = element.style.transition;

  let engine: ReturnType<typeof createScree> | undefined;
  try {
    document.body.appendChild(canvas);
    engine = createScree({ canvas, effect: options.effect ?? "pieces", match: options.match, style: options.look });
    engine.resize(Math.round(box.width), Math.round(box.height));
    engine.setDriver("manual");
    engine.addTarget("from", before);
    engine.addTarget("to", after);
    engine.prepareTransition("from", "to", options.match);
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
        engine?.setProgress(ease(t));
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  } finally {
    element.style.opacity = previousOpacity;
    element.style.transition = previousTransition;
    engine?.dispose();
    canvas.remove();
  }
}
