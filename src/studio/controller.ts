import {
  clipSeconds,
  createDustTarget,
  createImageTarget,
  createScree,
  getEffect,
  progressAtTime,
  type ExportFormat,
  type ExportQuality,
  type Scree,
} from "../engine";
import { prepareImage } from "./images";
import type { Look, SlotId, Template } from "./templates";
import { matchInWorker } from "./worker-match";

const PARTICLES = 128 * 128;
export const STUDIO_FIT = 0.82;

export type Sources = Partial<Record<SlotId, string>>;

/**
 * Drives one Scree engine for the Studio: turns inputs into targets, pairs
 * them off the main thread, plays the clip on a loop, and exports it.
 */
export class StudioController {
  readonly engine: Scree;
  private ids: Record<SlotId, string> = { before: "", after: "" };
  private version = 0;
  private look: Look;
  private time = 0;
  private playing = false;
  private loop = true;
  private frame: number | null = null;
  private lastTick = 0;
  private ready = false;
  private exporting = false;
  private pendingSize: { width: number; height: number } | null = null;
  onTime?: (time: number, total: number, playing: boolean) => void;

  constructor(canvas: HTMLCanvasElement, look: Look) {
    this.look = look;
    this.engine = createScree({ canvas, fit: STUDIO_FIT, match: look.match });
    this.engine.setDriver("manual");
    this.applyLook(look);
    if (import.meta.env.DEV) {
      (window as unknown as { __studio?: StudioController }).__studio = this;
    }
  }

  get total(): number {
    return clipSeconds(this.look);
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** Sample the inputs, pair them in a worker, and show the clip at the current time. */
  async setInputs(template: Template, sources: Sources): Promise<void> {
    const version = (this.version += 1);
    const previous = { ...this.ids };
    const options = { particleCount: PARTICLES, depth: template.depth };

    const afterSrc = sources.after;
    if (!afterSrc) throw new Error("Add an image to start.");
    const [before, after] = await Promise.all([
      sources.before
        ? prepareImage(sources.before, { removeBackground: template.removeBackground }).then((src) =>
            createImageTarget(src, { ...options, seed: 7 }),
          )
        : Promise.resolve(createDustTarget({ particleCount: PARTICLES, seed: 7 })),
      prepareImage(afterSrc, { removeBackground: template.removeBackground }).then((src) =>
        createImageTarget(src, { ...options, seed: 11 }),
      ),
    ]);
    if (version !== this.version) return;

    const ids = { before: `before-${version}`, after: `after-${version}` };
    this.engine.registerTarget(ids.before, before);
    this.engine.registerTarget(ids.after, after);
    await this.engine.preloadMatch(ids.before, ids.after, {
      match: this.look.match,
      compute: matchInWorker,
    });
    if (version !== this.version) return;

    this.ids = ids;
    this.engine.prepareTransition(ids.before, ids.after, this.look.match);
    for (const id of [previous.before, previous.after]) {
      if (id) this.engine.removeTarget(id);
    }
    this.ready = true;
    this.seek(this.time);
  }

  async setLook(look: Look): Promise<void> {
    const matchChanged = look.match !== this.look.match;
    this.look = look;
    this.applyLook(look);
    if (matchChanged && this.ready) {
      const version = this.version;
      await this.engine.preloadMatch(this.ids.before, this.ids.after, {
        match: look.match,
        compute: matchInWorker,
      });
      if (version !== this.version) return;
      this.engine.prepareTransition(this.ids.before, this.ids.after, look.match);
    }
    this.seek(Math.min(this.time, this.total));
  }

  private applyLook(look: Look): void {
    this.engine.setMatch(look.match);
    if (this.engine.getEffect() !== look.effect) this.engine.setEffect(look.effect);
    // Effects that bring their own finish (e.g. Gooey) keep it.
    if (!getEffect(look.effect)?.particles?.style) {
      this.engine.setStyle({ id: look.style, palette: look.palette, cell: look.cell });
    }
  }

  resize(width: number, height: number): void {
    if (this.exporting) {
      this.pendingSize = { width, height };
      return;
    }
    this.engine.resize(width, height);
  }

  seek(time: number): void {
    this.time = Math.max(0, Math.min(time, this.total));
    if (this.ready) this.engine.setProgress(progressAtTime(this.time, this.look));
    this.onTime?.(this.time, this.total, this.playing);
  }

  play(): void {
    if (this.playing) return;
    if (this.time >= this.total - 1e-3) this.time = 0;
    this.playing = true;
    this.lastTick = performance.now();
    const tick = (now: number) => {
      if (!this.playing) return;
      const next = this.time + (now - this.lastTick) / 1000;
      this.lastTick = now;
      if (next >= this.total) {
        if (this.loop) {
          this.seek(next % this.total);
        } else {
          this.seek(this.total);
          this.pause();
          return;
        }
      } else {
        this.seek(next);
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
    this.onTime?.(this.time, this.total, true);
  }

  pause(): void {
    this.playing = false;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.onTime?.(this.time, this.total, false);
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  async export(options: {
    format: ExportFormat;
    quality: ExportQuality;
    background: string;
    onProgress: (fraction: number) => void;
  }): Promise<Blob> {
    const wasPlaying = this.playing;
    this.pause();
    this.exporting = true;
    try {
      return await this.engine.record({
        from: this.ids.before,
        to: this.ids.after,
        match: this.look.match,
        format: options.format,
        aspect: this.look.aspect,
        quality: options.quality,
        durationSeconds: this.look.durationSeconds,
        holdStartSeconds: this.look.holdStartSeconds,
        holdEndSeconds: this.look.holdEndSeconds,
        background: options.background,
        fit: STUDIO_FIT,
        onProgress: options.onProgress,
      });
    } finally {
      this.exporting = false;
      if (this.pendingSize) this.engine.resize(this.pendingSize.width, this.pendingSize.height);
      this.pendingSize = null;
      this.seek(this.time);
      if (wasPlaying) this.play();
    }
  }

  dispose(): void {
    this.pause();
    this.engine.dispose();
  }
}
