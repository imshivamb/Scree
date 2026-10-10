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
    setReady((n) => n + 1);

    return () => {
      observer.disconnect();
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
        for (let index = 0; index < ids.length - 1 && !cancelled; index += 1) {
          await engine.preloadMatch(ids[index] as string, ids[index + 1] as string, {
            match: latest.current.match,
          });
          // Let a frame through between pairs so scrolling never stalls.
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
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
