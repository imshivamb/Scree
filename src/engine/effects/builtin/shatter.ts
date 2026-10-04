import { defineEffect } from "../registry";

export const effect = defineEffect({
  id: "shatter",
  label: "Shatter",
  description: "Glass-like shards burst from the centre and resettle as the next picture.",
  family: "pieces",
  durationSeconds: 2.2,
  pieces: {
    cut: { kind: "triangles", density: 700, jitter: 0.28 },
    motion: {
      stagger: 0.45,
      staggerBy: "radial",
      lift: 0.5,
      focus: 0.55,
      arc: 0.3,
      tilt: 2.4,
      dip: 0.1,
      swap: [0.4, 0.6],
    },
  },
});
