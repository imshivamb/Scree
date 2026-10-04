/** Pure helpers for export: sizes and the progress of every frame. */

export const EXPORT_ASPECTS = ["16:9", "1:1", "9:16"] as const;
export type ExportAspect = (typeof EXPORT_ASPECTS)[number];

export const EXPORT_QUALITIES = ["720p", "1080p", "4k"] as const;
export type ExportQuality = (typeof EXPORT_QUALITIES)[number];

const SHORT_SIDE: Record<ExportQuality, number> = { "720p": 720, "1080p": 1080, "4k": 2160 };

/** Width × height for an aspect at a quality; the short side sets the quality. */
export function exportSize(
  aspect: ExportAspect,
  quality: ExportQuality,
): { width: number; height: number } {
  const short = SHORT_SIDE[quality];
  const long = Math.round((short * 16) / 9 / 2) * 2;
  switch (aspect) {
    case "16:9":
      return { width: long, height: short };
    case "1:1":
      return { width: short, height: short };
    case "9:16":
      return { width: short, height: long };
    default: {
      const exhaustive: never = aspect;
      throw new Error(`Unknown aspect "${String(exhaustive)}"`);
    }
  }
}

export type ClipTiming = {
  fps: number;
  durationSeconds: number;
  holdStartSeconds: number;
  holdEndSeconds: number;
};

export function frameCount(timing: ClipTiming): number {
  const total = timing.holdStartSeconds + timing.durationSeconds + timing.holdEndSeconds;
  return Math.max(1, Math.round(total * timing.fps));
}

export function clipSeconds(timing: Omit<ClipTiming, "fps">): number {
  return timing.holdStartSeconds + timing.durationSeconds + timing.holdEndSeconds;
}

/** Progress at frame `index`: hold at 0, ease 0 → 1 (same curve as playback), hold at 1. */
export function progressAtFrame(index: number, timing: ClipTiming): number {
  return progressAtTime(index / timing.fps, timing);
}

/** Progress at `time` seconds into a clip — what a preview should show. */
export function progressAtTime(time: number, timing: Omit<ClipTiming, "fps">): number {
  const local = (time - timing.holdStartSeconds) / Math.max(timing.durationSeconds, 1e-6);
  const linear = Math.min(1, Math.max(0, local));
  return linear * linear * (3 - 2 * linear);
}
