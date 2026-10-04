import { defineEffect } from "../registry";

export const effect = defineEffect({
  id: "type-shatter",
  label: "Typographic shatter",
  description: "Fine shards rain down line by line — made for words and headlines.",
  family: "pieces",
  durationSeconds: 2.2,
  pieces: {
    cut: { kind: "triangles", density: 1400, jitter: 0.28 },
    motion: {
      stagger: 0.55,
      staggerBy: "y",
      lift: 0.5,
      arc: 0.4,
      tilt: 1.8,
      dip: 0.3,
      gloss: 0.6,
      swap: [0.35, 0.65],
    },
  },
});
