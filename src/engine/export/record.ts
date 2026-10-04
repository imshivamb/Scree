import type { MatchStrategy } from "../match";
import { Mp4Muxer } from "./mp4";
import {
  exportSize,
  frameCount,
  progressAtFrame,
  type ClipTiming,
  type ExportAspect,
  type ExportQuality,
} from "./timeline";
import { zipStore, type ZipEntry } from "./zip";

/** What the recorder needs from the engine. `Scree` implements it. */
export interface CaptureHost {
  beginCapture(width: number, height: number, fit?: number): void;
  renderCaptureFrame(progress: number, timeSeconds: number): HTMLCanvasElement;
  endCapture(): void;
  prepareTransition(from: string, to: string, match?: MatchStrategy): void;
}

export type ExportFormat = "mp4" | "png-sequence";

export type RecordOptions = {
  from: string;
  to: string;
  match?: MatchStrategy;
  format?: ExportFormat;
  /** Either an aspect + quality preset … */
  aspect?: ExportAspect;
  quality?: ExportQuality;
  /** … or an exact size (even numbers for MP4). */
  width?: number;
  height?: number;
  fps?: number;
  durationSeconds?: number;
  holdStartSeconds?: number;
  holdEndSeconds?: number;
  /** CSS colour or "transparent". MP4 cannot be transparent and falls back to black. */
  background?: string;
  /** Small text in the bottom-right corner. Off by default. */
  watermark?: string | false;
  /** How much of the frame the form fills (0.1–1). Default 0.82. */
  fit?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

export type SnapshotOptions = {
  width?: number;
  height?: number;
  aspect?: ExportAspect;
  quality?: ExportQuality;
  background?: string;
  watermark?: string | false;
  fit?: number;
};

const DEFAULTS = {
  format: "mp4" as ExportFormat,
  aspect: "16:9" as ExportAspect,
  quality: "1080p" as ExportQuality,
  fps: 30,
  durationSeconds: 1.8,
  holdStartSeconds: 0.6,
  holdEndSeconds: 1.2,
  background: "#07080c",
  fit: 0.82,
};

function resolveSize(options: {
  width?: number;
  height?: number;
  aspect?: ExportAspect;
  quality?: ExportQuality;
}): { width: number; height: number } {
  if (options.width && options.height) {
    return {
      width: Math.max(2, Math.round(options.width / 2) * 2),
      height: Math.max(2, Math.round(options.height / 2) * 2),
    };
  }
  return exportSize(options.aspect ?? DEFAULTS.aspect, options.quality ?? DEFAULTS.quality);
}

/** Composites the WebGL frame over a background and an optional watermark. */
function createCompositor(width: number, height: number, background: string, watermark: string | false) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Export needs a 2D canvas");
  return {
    canvas,
    draw(frame: HTMLCanvasElement): HTMLCanvasElement {
      context.clearRect(0, 0, width, height);
      if (background !== "transparent") {
        context.fillStyle = background;
        context.fillRect(0, 0, width, height);
      }
      context.drawImage(frame, 0, 0, width, height);
      if (watermark) {
        const size = Math.round(height * 0.022);
        context.font = `600 ${size}px system-ui, sans-serif`;
        context.textAlign = "right";
        context.textBaseline = "bottom";
        context.fillStyle = "rgba(255, 255, 255, 0.55)";
        context.fillText(watermark, width - size, height - size * 0.8);
      }
      return canvas;
    },
  };
}

function toPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error("PNG encoding failed"));
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png");
  });
}

const H264_LEVELS = [
  { level: "28", frame: 8_192, rate: 245_760 },
  { level: "2a", frame: 8_704, rate: 522_240 },
  { level: "33", frame: 36_864, rate: 983_040 },
  { level: "34", frame: 36_864, rate: 2_073_600 },
];

async function pickH264(width: number, height: number, fps: number): Promise<VideoEncoderConfig> {
  if (typeof VideoEncoder === "undefined") {
    throw new Error("This browser cannot encode MP4. Export a PNG sequence instead.");
  }
  const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
  const level =
    H264_LEVELS.find((entry) => macroblocks <= entry.frame && macroblocks * fps <= entry.rate)
      ?.level ?? "34";
  for (const profile of ["6400", "4d00", "4200"]) {
    const config: VideoEncoderConfig = {
      codec: `avc1.${profile}${level}`,
      width,
      height,
      framerate: fps,
      bitrate: Math.round(width * height * fps * 0.2),
      avc: { format: "avc" },
    };
    const support = await VideoEncoder.isConfigSupported(config);
    if (support.supported) return config;
  }
  throw new Error("This browser cannot encode H.264 at this size. Try 1080p or a PNG sequence.");
}

function copyBytes(source: AllowSharedBufferSource): Uint8Array<ArrayBuffer> {
  return ArrayBuffer.isView(source)
    ? new Uint8Array(new Uint8Array(source.buffer, source.byteOffset, source.byteLength))
    : new Uint8Array(new Uint8Array(source));
}

async function encodeMp4(
  frames: AsyncGenerator<HTMLCanvasElement>,
  width: number,
  height: number,
  fps: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const muxer = new Mp4Muxer(width, height, fps);
  let failure: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {
      const description = metadata?.decoderConfig?.description;
      if (description) muxer.setDecoderDescription(copyBytes(description));
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      muxer.addSample(data, chunk.timestamp, chunk.type === "key");
    },
    error: (error) => {
      failure = error instanceof Error ? error : new Error(String(error));
    },
  });
  encoder.configure(await pickH264(width, height, fps));

  let index = 0;
  const frameMicros = 1e6 / fps;
  for await (const canvas of frames) {
    if (failure) throw failure;
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(index * frameMicros),
      duration: Math.round(frameMicros),
    });
    encoder.encode(frame, { keyFrame: index % (fps * 2) === 0 });
    frame.close();
    index += 1;
    while (encoder.encodeQueueSize > 4) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  return muxer.finish();
}

/**
 * Render `from → to` frame by frame at a fixed rate and encode it.
 * Frames are exact: motion is a pure function of progress and time.
 */
export async function recordClip(host: CaptureHost, options: RecordOptions): Promise<Blob> {
  const format = options.format ?? DEFAULTS.format;
  const { width, height } = resolveSize(options);
  const timing: ClipTiming = {
    fps: options.fps ?? DEFAULTS.fps,
    durationSeconds: options.durationSeconds ?? DEFAULTS.durationSeconds,
    holdStartSeconds: options.holdStartSeconds ?? DEFAULTS.holdStartSeconds,
    holdEndSeconds: options.holdEndSeconds ?? DEFAULTS.holdEndSeconds,
  };
  const total = frameCount(timing);
  const background =
    options.background ?? (format === "png-sequence" ? "transparent" : DEFAULTS.background);
  const compositor = createCompositor(
    width,
    height,
    format === "mp4" && background === "transparent" ? "#000000" : background,
    options.watermark ?? false,
  );

  host.prepareTransition(options.from, options.to, options.match);
  host.beginCapture(width, height, options.fit ?? DEFAULTS.fit);
  try {
    async function* frames(): AsyncGenerator<HTMLCanvasElement> {
      for (let index = 0; index < total; index += 1) {
        if (options.signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
        const glCanvas = host.renderCaptureFrame(progressAtFrame(index, timing), index / timing.fps);
        yield compositor.draw(glCanvas);
        options.onProgress?.((index + 1) / total);
      }
    }

    if (format === "mp4") {
      const bytes = await encodeMp4(frames(), width, height, timing.fps);
      return new Blob([bytes], { type: "video/mp4" });
    }

    const entries: ZipEntry[] = [];
    let index = 0;
    for await (const canvas of frames()) {
      index += 1;
      entries.push({ name: `scree-${String(index).padStart(4, "0")}.png`, data: await toPngBytes(canvas) });
    }
    return new Blob([zipStore(entries)], { type: "application/zip" });
  } finally {
    host.endCapture();
  }
}

/** One frame of the current field as a PNG. */
export async function snapshotFrame(
  host: Pick<CaptureHost, "beginCapture" | "renderCaptureFrame" | "endCapture">,
  progress: number,
  options: SnapshotOptions = {},
): Promise<Blob> {
  const { width, height } = resolveSize(options);
  const compositor = createCompositor(width, height, options.background ?? "transparent", options.watermark ?? false);
  host.beginCapture(width, height, options.fit ?? DEFAULTS.fit);
  try {
    const canvas = compositor.draw(host.renderCaptureFrame(progress, 0));
    const bytes = await toPngBytes(canvas);
    return new Blob([bytes], { type: "image/png" });
  } finally {
    host.endCapture();
  }
}
