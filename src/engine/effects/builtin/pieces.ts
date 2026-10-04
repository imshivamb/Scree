import { defineEffect } from "../registry";

export const effect = defineEffect({
  id: "pieces",
  label: "Pieces",
  description: "The picture breaks into tiles; every tile finds its place in the next one.",
  family: "pieces",
  durationSeconds: 2,
  pieces: {
    cut: { kind: "grid", density: 520 },
    motion: {
      stagger: 0.4,
      staggerBy: "travel",
      lift: 0.45,
      arc: 0.18,
      tilt: 0.7,
      focus: 0.9,
      gloss: 0.35,
      swap: [0.3, 0.7],
    },
  },
});
