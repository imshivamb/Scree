import * as THREE from "three";

import {
  recordClip,
  snapshotFrame,
  type RecordOptions,
  type SnapshotOptions,
} from "./export";
import {
  DEFAULT_MATCH,
  MatchCache,
  type MatchCompute,
  type MatchStrategy,
} from "./match";
import {
  DEFAULT_STYLE_CONFIGS,
  mergeStyleConfig,
  parseHexColor,
  resolveStyleInput,
  StylePass,
  type StyleConfig,
  type StyleId,
  type StyleInput,
} from "./styles";
import {
  dominantBehavior,
  exclusiveBehavior,
  mixAtProgress,
  type BehaviorWeights,
  type MotionSpec,
} from "./motion-field";
import {
  getParticleQualityConfig,
  resolveParticleQuality,
  type ParticleQuality,
} from "./motion";
import { clampProgress, shouldPlayAutoTween } from "./progress";
import { createParticleRenderer } from "./renderers";
import type { ParticleRenderer } from "./renderers/types";
import { assertSameTargetCount, type ParticleTarget } from "./target";
import { blendFraming, DEFAULT_FIT, frameTarget } from "./camera";
import {
  resolveMotion,
  type MotionInput,
  type TransitionPresetId,
} from "./transitions";
import type {
  BehaviorId,
  DriverId,
  MorphLook,
  ParticleFieldState,
  PointerField,
  RendererConfig,
  RendererId,
} from "./types";
import { DEFAULT_POINTER } from "./types";

export type { BehaviorId, DriverId, MorphLook, RendererConfig } from "./types";

export type MorphToOptions = {
  durationSeconds?: number;
  cameraZ?: number;
  scale?: [number, number, number];
  renderer?: RendererId;
  behavior?: MotionInput;
  replay?: boolean;
  /** How points pair up for this morph. Defaults to the engine's match. */
  match?: MatchStrategy;
};

export type TransitionOptions = {
  from?: string;
  to: string;
  durationSeconds?: number;
  motion?: MotionInput;
  match?: MatchStrategy;
  renderer?: RendererId;
  replay?: boolean;
  cameraZ?: number;
  scale?: [number, number, number];
};

export type ScreeOptions = {
  canvas: HTMLCanvasElement;
  quality?: ParticleQuality;
  reducedMotion?: boolean;
  look?: Partial<MorphLook>;
  renderer?: RendererId;
  /** How points pair up between forms. Default "transport". */
  match?: MatchStrategy;
  /** How the field is drawn: "none" (the points), "dither", "halftone", "ascii", "pixel". */
  style?: StyleInput;
  /** How much of the view a form fills (0.1–1). The camera fits every form. Default 0.8. */
  fit?: number;
  onTransitionStateChange?: (isTransitioning: boolean) => void;
  onProgress?: (progress: number) => void;
  onError?: (message: string) => void;
};

const DEFAULT_LOOK: MorphLook = {
  expansionStrength: 0.58,
  turbulenceStrength: 0.52,
  synchronization: 0.72,
  particleSize: 2.9,
  glow: 0.44,
  behaviorMix: exclusiveBehavior("expand"),
  behaviorStrength: 1,
  pointer: { ...DEFAULT_POINTER },
};

const DEFAULT_RENDERER_CONFIG: RendererConfig = {
  size: 1,
  opacity: 0.675,
};

const SPRITE_SHARD_OPACITY = 0.73;

type Tween = {
  startTime: number;
  durationMs: number;
  from: number;
  to: number;
};

export class Scree {
  private readonly webgl: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.08, 24);
  private readonly targets = new Map<string, ParticleTarget>();
  private readonly targetScales = new Map<string, THREE.Vector3>();
  private readonly quality: ParticleQuality;
  private readonly reducedMotion: boolean;
  private readonly onTransitionStateChange?: (isTransitioning: boolean) => void;
  private readonly onProgress?: (progress: number) => void;
  private readonly onError?: (message: string) => void;
  private look: MorphLook;
  private motionSpec: MotionSpec = { expand: 1 };
  private activePreset: TransitionPresetId | undefined;
  private driver: DriverId = "auto";
  private readonly rendererLooks: Record<RendererId, RendererConfig> = {
    points: { ...DEFAULT_RENDERER_CONFIG },
    sprites: { ...DEFAULT_RENDERER_CONFIG, opacity: SPRITE_SHARD_OPACITY },
    shards: { ...DEFAULT_RENDERER_CONFIG, opacity: SPRITE_SHARD_OPACITY },
  };
  private skin: ParticleRenderer;
  private field: { source: ParticleTarget; destination: ParticleTarget } | null =
    null;
  /** Target id whose (matched) arrangement is `field.destination`. */
  private fieldDestinationId: string | null = null;
  private match: MatchStrategy;
  private readonly matches = new MatchCache();
  private styleId: StyleId = "none";
  private readonly styleConfigs: Record<StyleId, StyleConfig> = structuredClone(
    DEFAULT_STYLE_CONFIGS,
  );
  private stylePass: StylePass | null = null;
  private fit: number;
  /** The two forms the camera frames; it glides between them with progress. */
  private cameraShot: {
    source: ParticleTarget;
    destination: ParticleTarget;
    distance?: number;
  } | null = null;
  private sourceScale = new THREE.Vector3(1, 1, 1);
  private targetScale = new THREE.Vector3(1, 1, 1);
  private progress = 1;
  private viewport = { width: 1, height: 1 };
  private activeTarget: string | null = null;
  private frameId: number | null = null;
  private paused = false;
  private disposed = false;
  /** Set while frames are rendered for export; the live loop stops drawing. */
  private capture: { width: number; height: number; dpr: number; fit: number } | null = null;
  private tween: Tween | null = null;
  private readonly replacedFrom = new Map<string, ParticleTarget>();
  private visibilityHandler = (): void => {
    this.setPaused(document.hidden);
  };

  constructor(options: ScreeOptions) {
    const reducedMotion =
      options.reducedMotion ??
      (typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const quality =
      options.quality ??
      resolveParticleQuality({
        viewportWidth:
          typeof window !== "undefined" ? window.innerWidth : 1024,
        hardwareConcurrency:
          typeof navigator !== "undefined" ? navigator.hardwareConcurrency : 4,
        reducedMotion,
      });
    const qualityConfig = getParticleQualityConfig(quality);
    this.quality = quality;
    this.reducedMotion = reducedMotion;
    this.onTransitionStateChange = options.onTransitionStateChange;
    this.onProgress = options.onProgress;
    this.onError = options.onError;
    this.look = { ...DEFAULT_LOOK, ...options.look };
    this.match = options.match ?? DEFAULT_MATCH;
    this.fit = options.fit ?? DEFAULT_FIT;
    this.camera.position.set(0, 0, 3.1);
    this.camera.lookAt(0, 0, 0);

    this.webgl = new THREE.WebGLRenderer({
      canvas: options.canvas,
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.webgl.setClearColor(0x000000, 0);
    this.webgl.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, qualityConfig.maxDpr),
    );

    const initialRenderer = options.renderer ?? "points";
    this.skin = createParticleRenderer(
      initialRenderer,
      this.look,
      this.rendererLooks[initialRenderer],
      this.webgl.getPixelRatio(),
    );
    this.scene.add(this.skin.object);
    if (options.style) this.setStyle(options.style);
    options.canvas.addEventListener("webglcontextlost", this.handleContextLost);
    document.addEventListener("visibilitychange", this.visibilityHandler);
    this.startLoop();
  }

  addTarget(
    id: string,
    target: ParticleTarget,
    scale: [number, number, number] = [1, 1, 1],
  ): void {
    this.registerTarget(id, target, scale);
  }

  registerTarget(
    id: string,
    target: ParticleTarget,
    scale: [number, number, number] = [1, 1, 1],
  ): void {
    const existing = this.targets.values().next().value;
    if (existing) {
      assertSameTargetCount(existing, target);
    }
    const previous = this.targets.get(id);
    this.targets.set(id, target);
    this.targetScales.set(id, new THREE.Vector3(...scale));
    if (previous && this.activeTarget === id) {
      this.replacedFrom.set(id, previous);
    }

    if (!this.activeTarget) {
      this.activeTarget = id;
      this.writeField(target, target, id);
      this.sourceScale.copy(this.targetScales.get(id) ?? new THREE.Vector3(1, 1, 1));
      this.targetScale.copy(this.sourceScale);
      this.cameraShot = { source: target, destination: target };
      this.syncSkin();
      this.applyProgress(1);
    }
  }

  morphTo(id: string, options: MorphToOptions = {}): void {
    if (options.renderer) {
      this.setRenderer(options.renderer);
    }
    if (options.behavior) {
      this.setBehavior(options.behavior);
    }

    const destination = this.targets.get(id);
    if (!destination) {
      this.onError?.(`Unknown morph target "${id}"`);
      return;
    }
    if (options.scale) {
      this.targetScales.set(id, new THREE.Vector3(...options.scale));
    }

    const sourceId = this.activeTarget;
    const replaced = this.replacedFrom.get(id);
    this.replacedFrom.delete(id);
    if (sourceId === id && !this.tween && !replaced && !options.replay) {
      this.onTransitionStateChange?.(false);
      return;
    }

    const source = replaced ?? this.displayedArrangement(sourceId) ?? destination;
    this.writeField(
      source,
      this.matches.get(source, destination, options.match ?? this.match),
      id,
    );
    this.sourceScale.copy(
      this.targetScales.get(sourceId ?? id) ?? new THREE.Vector3(1, 1, 1),
    );
    this.targetScale.copy(
      this.targetScales.get(id) ?? new THREE.Vector3(1, 1, 1),
    );
    this.activeTarget = id;
    this.syncSkin();

    const durationSeconds = options.durationSeconds ?? 2.6;
    this.cameraShot = { source, destination, distance: options.cameraZ };

    if (this.reducedMotion && this.driver === "auto") {
      this.tween = null;
      this.applyProgress(1);
      this.onTransitionStateChange?.(false);
      return;
    }

    if (
      !shouldPlayAutoTween({
        driver: this.driver,
        durationSeconds,
        reducedMotion: this.reducedMotion,
      })
    ) {
      this.tween = null;
      this.applyProgress(this.progress);
      this.onTransitionStateChange?.(false);
      return;
    }

    this.applyProgress(0);
    this.tween = {
      startTime: performance.now(),
      durationMs: durationSeconds * 1000,
      from: 0,
      to: 1,
    };
    this.onTransitionStateChange?.(true);
  }

  transition(options: TransitionOptions): void {
    if (options.motion) {
      this.setBehavior(options.motion);
    }
    if (options.from && this.targets.has(options.from)) {
      this.activeTarget = options.from;
    }
    this.morphTo(options.to, {
      durationSeconds: options.durationSeconds,
      renderer: options.renderer,
      replay: options.replay,
      cameraZ: options.cameraZ,
      scale: options.scale,
      match: options.match,
    });
  }

  /** Change how points pair up; applies from the next morph. */
  setMatch(match: MatchStrategy): void {
    this.match = match;
  }

  getMatch(): MatchStrategy {
    return this.match;
  }

  /**
   * Change how the field is drawn. Each style remembers its own config, so
   * switching away and back keeps your cell size and colours.
   */
  setStyle(input: StyleInput): void {
    const { id, config } = resolveStyleInput(input);
    const next = mergeStyleConfig(this.styleConfigs[id], config);
    parseHexColor(next.ink);
    parseHexColor(next.shade);
    this.styleConfigs[id] = next;
    this.styleId = id;
    this.skin.setFlatOutput(id !== "none");
    if (id !== "none" && !this.stylePass) {
      this.stylePass = new StylePass();
      this.syncStyleSize();
    }
  }

  getStyle(): { id: StyleId; config: StyleConfig } {
    return { id: this.styleId, config: { ...this.styleConfigs[this.styleId] } };
  }

  /**
   * The points as they sit on screen for `id`: after a morph they keep the
   * order they were matched in, so the next morph starts without a jump.
   */
  private displayedArrangement(id: string | null): ParticleTarget | undefined {
    if (!id) return undefined;
    if (id === this.fieldDestinationId && this.field) return this.field.destination;
    return this.targets.get(id);
  }

  /** Fit both forms to the current aspect and place the camera between them. */
  private updateCamera(): void {
    if (!this.cameraShot) return;
    const { source, destination, distance } = this.cameraShot;
    const aspect = this.camera.aspect;
    const from = frameTarget(source, {
      aspect,
      fit: this.fit,
      scale: this.sourceScale.toArray(),
      distance,
    });
    const to = frameTarget(destination, {
      aspect,
      fit: this.fit,
      scale: this.targetScale.toArray(),
      distance,
    });
    const { direction, distance: at } = blendFraming(from, to, this.progress);
    this.camera.position.set(direction[0] * at, direction[1] * at, direction[2] * at);
    this.camera.lookAt(0, 0, 0);
  }

  /** How much of the view a form fills (0.1–1). */
  setFit(fit: number): void {
    this.fit = Math.min(1, Math.max(0.1, fit));
    this.updateCamera();
  }

  getFit(): number {
    return this.fit;
  }

  getActiveTarget(): string | null {
    return this.activeTarget;
  }

  getProgress(): number {
    return this.progress;
  }

  getFieldState(): ParticleFieldState {
    return {
      activeTarget: this.activeTarget,
      progress: this.progress,
      quality: this.quality,
      renderer: this.skin.id,
      driver: this.driver,
      behaviorMix: { ...this.look.behaviorMix },
    };
  }

  getRenderer(): RendererId {
    return this.skin.id;
  }

  getRendererConfig(id: RendererId = this.skin.id): RendererConfig {
    return { ...this.rendererLooks[id] };
  }

  setRenderer(id: RendererId, config: Partial<RendererConfig> = {}): void {
    this.rendererLooks[id] = { ...this.rendererLooks[id], ...config };
    const look = this.rendererLooks[id];
    if (id === this.skin.id) {
      this.skin.setConfig(look);
      return;
    }

    this.scene.remove(this.skin.object);
    this.skin.dispose();
    this.skin = createParticleRenderer(
      id,
      this.look,
      look,
      this.webgl.getPixelRatio(),
    );
    this.scene.add(this.skin.object);
    this.syncSkin();
    this.skin.setProgress(this.progress);
  }

  setProgress(progress: number): void {
    this.tween = null;
    this.applyProgress(progress);
  }

  setLook(look: Partial<MorphLook>): void {
    this.look = {
      ...this.look,
      ...look,
      behaviorMix: look.behaviorMix
        ? { ...this.look.behaviorMix, ...look.behaviorMix }
        : this.look.behaviorMix,
      pointer: look.pointer
        ? { ...this.look.pointer, ...look.pointer }
        : this.look.pointer,
    };
    this.skin.setLook(this.look);
  }

  setBehavior(
    input: MotionInput,
    options: { strength?: number } = {},
  ): void {
    const resolved = resolveMotion(input);
    this.motionSpec = resolved.spec;
    this.activePreset = resolved.preset;
    this.look.behaviorStrength =
      options.strength ?? this.look.behaviorStrength;
    this.applyMotionAtProgress();
  }

  getBehavior(): {
    id: BehaviorId | "mix";
    mix: BehaviorWeights;
    strength: number;
    preset?: TransitionPresetId;
  } {
    const mix = { ...this.look.behaviorMix };
    return {
      id: dominantBehavior(mix),
      mix,
      strength: this.look.behaviorStrength,
      preset: this.activePreset,
    };
  }

  getBehaviorMix(): BehaviorWeights {
    return { ...this.look.behaviorMix };
  }

  getMotionSpec(): MotionSpec {
    return { ...this.motionSpec };
  }

  setDriver(id: DriverId): void {
    this.driver = id;
    if (id !== "auto") this.tween = null;
    if (id === "pointer") {
      this.setPointer({ mode: "repel" });
      return;
    }
    this.setPointer({ mode: "off" });
  }

  getDriver(): DriverId {
    return this.driver;
  }

  setPointer(pointer: Partial<PointerField>): void {
    this.setLook({ pointer: { ...this.look.pointer, ...pointer } });
  }

  getPointer(): PointerField {
    return { ...this.look.pointer };
  }

  resize(width: number, height: number): void {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    this.viewport = { width: safeWidth, height: safeHeight };
    this.camera.aspect = safeWidth / safeHeight;
    this.camera.updateProjectionMatrix();
    this.updateCamera();
    this.webgl.setSize(safeWidth, safeHeight, false);
    this.skin.setViewport(safeWidth, safeHeight);
    this.skin.setDpr(this.webgl.getPixelRatio());
    this.syncStyleSize();
  }

  private syncStyleSize(): void {
    if (!this.stylePass) return;
    const size = this.webgl.getDrawingBufferSize(new THREE.Vector2());
    this.stylePass.setSize(size.x, size.y, this.webgl.getPixelRatio());
  }

  /**
   * Low-level export hooks (used by `record` / `snapshot`). While capturing,
   * the drawing buffer is resized to the export size and the live loop pauses.
   */
  beginCapture(width: number, height: number, fit?: number): void {
    if (this.capture) throw new Error("A capture is already running");
    this.capture = { ...this.viewport, dpr: this.webgl.getPixelRatio(), fit: this.fit };
    this.tween = null;
    if (fit !== undefined) this.fit = Math.min(1, Math.max(0.1, fit));
    this.webgl.setPixelRatio(1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.updateCamera();
    this.webgl.setSize(width, height, false);
    this.skin.setViewport(width, height);
    this.skin.setDpr(1);
    this.syncStyleSize();
  }

  /** Draw one exact frame. Returns the canvas holding it (read it right away). */
  renderCaptureFrame(progress: number, timeSeconds: number): HTMLCanvasElement {
    if (!this.capture) throw new Error("Call beginCapture first");
    this.applyProgress(progress);
    this.skin.setTime(timeSeconds);
    this.draw();
    return this.webgl.domElement;
  }

  endCapture(): void {
    const saved = this.capture;
    if (!saved) return;
    this.capture = null;
    this.fit = saved.fit;
    this.webgl.setPixelRatio(saved.dpr);
    this.resize(saved.width, saved.height);
  }

  /** Point the field at `from → to` without starting a tween. */
  prepareTransition(from: string, to: string, match?: MatchStrategy): void {
    if (!this.targets.has(from) || !this.targets.has(to)) {
      throw new Error(`Unknown morph target "${this.targets.has(from) ? to : from}"`);
    }
    const driver = this.driver;
    this.driver = "manual";
    this.transition({ from, to, match, replay: true });
    this.driver = driver;
  }

  /**
   * Export `from → to` as an MP4 (or a ZIP of PNG frames), rendered offline
   * frame by frame. Resolves with the file; the page keeps working meanwhile.
   */
  record(options: RecordOptions): Promise<Blob> {
    return recordClip(this, options);
  }

  /** The current frame as a PNG, at any size. */
  snapshot(options: SnapshotOptions = {}): Promise<Blob> {
    return snapshotFrame(this, this.progress, options);
  }

  /**
   * Work out the pairing for `from → to` ahead of time so the morph starts
   * instantly. Pass `compute` to run it off the main thread (e.g. in a Worker).
   */
  async preloadMatch(
    from: string,
    to: string,
    options: { match?: MatchStrategy; compute?: MatchCompute } = {},
  ): Promise<void> {
    const source = this.displayedArrangement(from);
    const destination = this.targets.get(to);
    if (!source || !destination) {
      throw new Error(`Unknown morph target "${source ? to : from}"`);
    }
    const strategy = options.match ?? this.match;
    if (this.matches.has(source, destination, strategy)) return;
    if (!options.compute) {
      this.matches.get(source, destination, strategy);
      return;
    }
    const matched = await options.compute(source, destination, strategy);
    if (matched.count !== destination.count) {
      throw new Error("A preloaded match must keep the particle count");
    }
    this.matches.set(source, destination, strategy, matched);
  }

  /** Forget a target. The one on screen cannot be removed. */
  removeTarget(id: string): void {
    if (id === this.activeTarget || id === this.fieldDestinationId) return;
    this.targets.delete(id);
    this.targetScales.delete(id);
    this.replacedFrom.delete(id);
  }

  hasTarget(id: string): boolean {
    return this.targets.has(id);
  }

  setPaused(paused: boolean): void {
    if (this.disposed || this.paused === paused) return;
    this.paused = paused;
    if (paused && this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
      return;
    }
    if (!paused) this.startLoop();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.tween = null;
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.webgl.domElement.removeEventListener(
      "webglcontextlost",
      this.handleContextLost,
    );
    document.removeEventListener("visibilitychange", this.visibilityHandler);
    this.scene.remove(this.skin.object);
    this.skin.dispose();
    this.stylePass?.dispose();
    this.webgl.dispose();
  }

  private writeField(
    source: ParticleTarget,
    destination: ParticleTarget,
    destinationId: string,
  ): void {
    this.field = { source, destination };
    this.fieldDestinationId = destinationId;
  }

  private syncSkin(): void {
    if (!this.field) return;
    this.skin.setField(this.field);
    this.skin.setSourceScale(this.sourceScale);
    this.skin.setTargetScale(this.targetScale);
    this.skin.setViewport(this.viewport.width, this.viewport.height);
    this.skin.setDpr(this.webgl.getPixelRatio());
    this.skin.setLook(this.look);
    this.skin.setConfig(this.rendererLooks[this.skin.id]);
    this.skin.setFlatOutput(this.styleId !== "none");
    this.skin.setProgress(this.progress);
  }

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.setPaused(true);
    this.onError?.("WebGL context was lost");
  };

  private startLoop(): void {
    if (this.disposed || this.paused || this.frameId !== null) return;

    const render = (time: number) => {
      this.frameId = null;
      if (this.disposed || this.paused) return;
      if (!this.capture) {
        this.stepTween(time);
        this.skin.setTime(time / 1000);
        this.draw();
      }
      this.frameId = requestAnimationFrame(render);
    };

    this.frameId = requestAnimationFrame(render);
  }

  private draw(): void {
    if (this.styleId === "none" || !this.stylePass) {
      this.webgl.render(this.scene, this.camera);
      return;
    }
    this.stylePass.render(
      this.webgl,
      this.scene,
      this.camera,
      this.styleId,
      this.styleConfigs[this.styleId],
    );
  }

  private stepTween(time: number): void {
    if (!this.tween) return;
    const elapsed = time - this.tween.startTime;
    const linear = Math.min(1, elapsed / this.tween.durationMs);
    const eased = linear * linear * (3 - 2 * linear);
    this.applyProgress(this.tween.from + (this.tween.to - this.tween.from) * eased);
    if (linear >= 1) {
      this.tween = null;
      this.onTransitionStateChange?.(false);
    }
  }

  private applyMotionAtProgress(): void {
    this.look.behaviorMix = mixAtProgress(this.motionSpec, this.progress);
    this.skin.setLook(this.look);
  }

  private applyProgress(progress: number): void {
    this.progress = clampProgress(progress);
    this.applyMotionAtProgress();
    this.updateCamera();
    this.skin.setProgress(this.progress);
    this.onProgress?.(this.progress);
  }
}

export function createScree(options: ScreeOptions): Scree {
  return new Scree(options);
}
