import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import {
  createDustTarget,
  createImageTarget,
  createScree,
  getEffect,
  primeDom,
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
 * (set state, navigate); it is committed at once with `flushSync`. The element is captured before and after, the pieces
 * travel, and the live page is handed back. Elements marked `data-scree="name"`
 * in both states travel as one block. Quick repeated runs never drop a change:
 * the playing transition hurries, then the next plays. With reduced motion it
 * only applies the change.
 */
export function useSceneTransition<T extends HTMLElement = HTMLDivElement>(defaults: SceneTransitionOptions = {}) {
  const ref = useRef<T>(null);
  const base = useRef(defaults);
  base.current = defaults;
  // Capture the first state once the page is quiet, so the first click is as quick as the rest.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const start = () => primeDom(element, { scale: base.current.scale, background: base.current.background });
    const handle = typeof requestIdleCallback === "function" ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 200);
    return () => {
      if (typeof cancelIdleCallback === "function" && typeof handle === "number") cancelIdleCallback(handle);
      else clearTimeout(handle as ReturnType<typeof setTimeout>);
    };
  }, []);
  const run = async (update: () => void | Promise<void>, options: SceneTransitionOptions = {}) => {
    const element = ref.current;
    if (!element) {
      await update();
      return;
    }
    // React applies state later; commit it now so the "after" picture shows the new screen.
    // A run while another plays hurries the first and then plays, so no change goes unanimated.
    await transitionDom(element, { ...base.current, ...options, update: () => flushSync(update) });
  };
  return { ref, run };
}

export type StageGoOptions = SceneTransitionOptions & {
  /**
   * The route key this navigation leads to (e.g. the href). With it, a request for
   * where the stage already is or is already heading is ignored, and the
   * transition waits for exactly that route. Recommended.
   */
  to?: string;
};

type StageContext = {
  /**
   * Play a navigation as a transition: the page freezes, `navigate` runs, and once
   * the new route has rendered (the stage's `routeKey` changes) its pieces travel in.
   */
  go: (navigate: () => void, options?: StageGoOptions) => Promise<void>;
};

const Stage = createContext<StageContext | null>(null);

export type ScreeStageProps = SceneTransitionOptions & {
  /** Changes when the route has rendered, e.g. `usePathname()` in Next.js. */
  routeKey: string;
  /** How long to wait for a route before showing it without a transition. Default 2000 ms. */
  timeoutMs?: number;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/**
 * Route changes as Scree transitions. Wrap the part of the layout that changes
 * between pages, give it the current route as `routeKey`, and navigate with
 * `useScreeStage().go(() => router.push(href))`. Navigations made any other way
 * (the back button, a plain link) still work; they just are not animated.
 */
export function ScreeStage({ routeKey, timeoutMs = 2000, children, className, style, ...defaults }: ScreeStageProps) {
  const { ref, run } = useSceneTransition<HTMLDivElement>(defaults);
  /** Called when a route renders, with its key. */
  const arrived = useRef<((key: string) => void) | null>(null);
  /** Where the stage is heading: the last route asked for, or the current one. */
  const heading = useRef(routeKey);
  const current = useRef(routeKey);
  current.current = routeKey;

  // A route is in the DOM: let the transition capture it.
  useLayoutEffect(() => {
    if (!arrived.current) heading.current = routeKey; // reached some other way (back, a plain link)
    arrived.current?.(routeKey);
  }, [routeKey]);

  const value = useMemo<StageContext>(
    () => ({
      go: (navigate, { to, ...options } = {}) => {
        if (to !== undefined) {
          if (to === heading.current) return Promise.resolve();
          heading.current = to;
        }
        return run(
          () =>
            new Promise<void>((resolve) => {
              // Changes play one after another, so by now earlier routes have rendered.
              if (to !== undefined && current.current === to) {
                resolve();
                return;
              }
              const done = () => {
                clearTimeout(timer);
                arrived.current = null;
                resolve();
              };
              const timer = setTimeout(done, timeoutMs);
              arrived.current = (key) => {
                if (to === undefined || key === to) done();
              };
              navigate();
            }),
          options,
        );
      },
    }),
    // `run` reads the latest options itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timeoutMs],
  );

  return (
    <Stage.Provider value={value}>
      <div ref={ref} className={className} style={style}>
        {children}
      </div>
    </Stage.Provider>
  );
}

/** `go(navigate)` inside a `ScreeStage`; outside one, `go` simply navigates. */
export function useScreeStage(): StageContext {
  return (
    useContext(Stage) ?? {
      go: async (navigate) => {
        navigate();
      },
    }
  );
}
