import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import {
  createDustTarget,
  createImageTarget,
  createScree,
  getEffect,
  transitionDom,
  type DomTransitionOptions,
  type MatchStrategy,
  type Scree,
  type StyleInput,
} from "scree-core";

export type ScreeSequenceProps = {
  /** Two or more picture URLs (or object URLs). Each one is a state of the sequence. */
  images: string[];
  /**
   * Where the sequence is, from 0 (first picture) to `images.length - 1` (last).
   * 1.5 is halfway between the second and third picture. Motion is a pure
   * function of this number, so scrubbing and scrolling are exact.
   */
  progress: number;
  /** A registered effect id, e.g. "pieces", "shatter", "liquid". Default "pieces". */
  effect?: string;
  /** How pieces pair up between pictures. Default "transport". */
  match?: MatchStrategy;
  /** A finish drawn over the effect: dither, halftone, ascii, pixel. */
  look?: StyleInput;
  /** How much of the frame a picture fills (0.1–1). Default 0.9. */
  fit?: number;
  /** Detail of the point field and piece layout. Default 128 × 128. */
  particleCount?: number;
  className?: string;
  style?: CSSProperties;
  /** Text for assistive tech. */
  label?: string;
  onReady?: (engine: Scree) => void;
  onError?: (message: string) => void;
};

const DEFAULT_PARTICLES = 128 * 128;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Wait for a quiet moment, so preparing a pair never lands in the middle of a frame. */
const idle = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(() => resolve(), { timeout: 300 });
    else setTimeout(resolve, 16);
  });

/**
 * A canvas that moves through a list of pictures, each piece travelling to
 * its place in the next. Drive it with `progress` (a number you own, or
 * `useScrollProgress`). Safe to render on the server: the engine starts in
 * the browser only. With reduced motion it jumps between pictures instead.
 */
export function ScreeSequence(props: ScreeSequenceProps) {
  const {
    images,
    progress,
    effect = "pieces",
    match,
    look,
    fit = 0.9,
    particleCount = DEFAULT_PARTICLES,
    className,
    style,
    label,
    onReady,
    onError,
  } = props;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Scree | null>(null);
  const idsRef = useRef<string[]>([]);
  const pairRef = useRef(-1);
  const latest = useRef({ progress, match, reduced: false });
  latest.current.progress = progress;
  latest.current.match = match;
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  const [ready, setReady] = useState(0);
  const preparing = useRef(0);

  /**
   * Get every pair ready before the scroll reaches it, one at a time with a
   * breath between, nearest pair first. Piece and surface effects need their
   * pieces cut and pictures uploaded; point effects need their pairing.
   * A newer call cancels an older one.
   */
  const prepare = async () => {
    const engine = engineRef.current;
    const ids = idsRef.current;
    if (!engine || ids.length < 2) return;
    const run = (preparing.current += 1);
    const particles = getEffect(engine.getEffect() ?? "")?.family === "particles";
    const here = Math.max(0, pairRef.current);
    const order = Array.from({ length: ids.length - 1 }, (_, index) => index).sort(
      (a, b) => Math.abs(a - here) - Math.abs(b - here),
    );
    try {
      for (const index of order) {
        if (run !== preparing.current || engineRef.current !== engine) return;
        const from = ids[index] as string;
        const to = ids[index + 1] as string;
        if (particles) await engine.preloadMatch(from, to, { match: latest.current.match });
        else engine.warm(from, to);
        await idle();
      }
    } catch (error) {
      if (run === preparing.current) {
        callbacks.current.onError?.(error instanceof Error ? error.message : "Could not prepare the pictures.");
      }
    }
  };

  const show = () => {
    const engine = engineRef.current;
    const ids = idsRef.current;
    if (!engine || ids.length < 2) return;
    const { progress: raw, reduced } = latest.current;
    const p = clamp(reduced ? Math.round(raw) : raw, 0, ids.length - 1);
    const pair = Math.min(Math.floor(p), ids.length - 2);
    if (pair !== pairRef.current) {
      engine.prepareTransition(ids[pair] as string, ids[pair + 1] as string, latest.current.match);
      pairRef.current = pair;
    }
    engine.setProgress(p - pair);
  };

  // The engine lives as long as the canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    latest.current.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let engine: Scree;
    try {
      engine = createScree({
        canvas,
        fit,
        match,
        effect,
        style: look,
        onError: (message) => callbacks.current.onError?.(message),
      });
    } catch (error) {
      callbacks.current.onError?.(error instanceof Error ? error.message : "WebGL is not available.");
      return;
    }
    engine.setDriver("manual");
    engineRef.current = engine;

    const measure = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (width > 0 && height > 0) engine.resize(Math.round(width), Math.round(height));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);

    // Nothing is drawn while the stage is off screen or the tab is hidden.
    let visible = true;
    const sync = () => engine.setPaused(document.hidden || !visible);
    const watcher = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      sync();
    });
    watcher.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    setReady((n) => n + 1);

    return () => {
      observer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", sync);
      preparing.current += 1;
      engine.dispose();
      engineRef.current = null;
      idsRef.current = [];
      pairRef.current = -1;
    };
    // The engine is created once; effect, look, fit and match are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (match) engine.setMatch(match);
    if (engine.getEffect() !== effect) engine.setEffect(effect);
    if (look) engine.setStyle(look);
    engine.setFit(fit);
    pairRef.current = -1;
    show();
    // A new effect cuts its pieces differently: warm every pair again.
    void prepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effect, match, look, fit, ready]);

  // Pictures → targets. Pairs are matched ahead of time, one after another.
  const key = images.join("\n");
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || images.length < 2) return;
    let cancelled = false;
    const tag = Math.random().toString(36).slice(2, 8);
    const ids = images.map((_, index) => `scree-react-${tag}-${index}`);

    (async () => {
      try {
        const targets = await Promise.all(
          images.map((src, index) =>
            src
              ? createImageTarget(src, { particleCount, seed: 7 + index * 4 })
              : createDustTarget({ particleCount, seed: 7 + index * 4 }),
          ),
        );
        if (cancelled) return;
        const previous = idsRef.current;
        ids.forEach((id, index) => engine.registerTarget(id, targets[index] as never));
        idsRef.current = ids;
        pairRef.current = -1;
        show();
        for (const id of previous) engine.removeTarget(id);
        callbacks.current.onReady?.(engine);
        await prepare();
      } catch (error) {
        if (!cancelled) {
          callbacks.current.onError?.(error instanceof Error ? error.message : "Could not load a picture.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, particleCount, ready]);

  useEffect(() => {
    show();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: "block", width: "100%", height: "100%", ...style }}
      role="img"
      aria-label={label}
    />
  );
}

export type ScreeTransitionProps = Omit<ScreeSequenceProps, "images" | "progress"> & {
  from: string;
  to: string;
  /** 0 shows `from`, 1 shows `to`. */
  progress: number;
};

/** Two pictures and a number: `from` at 0, `to` at 1. */
export function ScreeTransition({ from, to, progress, ...rest }: ScreeTransitionProps) {
  return <ScreeSequence {...rest} images={[from, to]} progress={progress} />;
}

/**
 * 0 → 1 as a tall element scrolls through the viewport: 0 when its top
 * reaches the top of the screen, 1 when its bottom reaches the bottom.
 * Pair it with a `position: sticky` stage inside a tall section.
 */
export function useScrollProgress(ref: RefObject<HTMLElement | null>): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const element = ref.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const next = travel <= 0 ? 0 : clamp(-rect.top / travel, 0, 1);
      setValue((current) => (Math.abs(current - next) < 1e-4 ? current : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);
  return value;
}

export type SceneTransitionOptions = Omit<DomTransitionOptions, "update">;

/**
 * Play a change to part of the page as a Scree transition. Attach `ref` to the
 * element that changes, then call `run(update)` where `update` makes the change
 * (set state, navigate). The element is captured before and after, the pieces
 * travel, and the live page is handed back. Elements marked `data-scree="name"`
 * in both states travel as one block. Without `await`, `run` still plays; with
 * reduced motion it only applies the change.
 */
export function useSceneTransition<T extends HTMLElement = HTMLDivElement>(defaults: SceneTransitionOptions = {}) {
  const ref = useRef<T>(null);
  const running = useRef(false);
  const base = useRef(defaults);
  base.current = defaults;
  const run = async (update: () => void | Promise<void>, options: SceneTransitionOptions = {}) => {
    const element = ref.current;
    if (!element || running.current) {
      await update();
      return;
    }
    running.current = true;
    try {
      await transitionDom(element, { ...base.current, ...options, update });
    } finally {
      running.current = false;
    }
  };
  return { ref, run };
}
