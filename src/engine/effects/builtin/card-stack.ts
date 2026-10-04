import { defineEffect } from "../registry";

export const effect = defineEffect({
  id: "card-stack",
  label: "Card stack",
  description: "Big panels lift into 3D, shuffle, and lay down as the next picture.",
  family: "pieces",
  durationSeconds: 2.2,
  pieces: {
    cut: { kind: "grid", columns: 3, rows: 2 },
    motion: {
      stagger: 0.45,
      staggerBy: "index",
      lift: 0.55,
      arc: 0.25,
      tilt: 0.5,
      gloss: 0.45,
      overshoot: 0.6,
      swap: [0.3, 0.7],
    },
  },
});
