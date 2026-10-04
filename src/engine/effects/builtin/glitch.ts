import { defineEffect } from "../registry";

export const effect = defineEffect({
  id: "glitch",
  label: "Glitch slice",
  description: "Horizontal bands jump, split their colours, and snap back as the next picture.",
  family: "pieces",
  durationSeconds: 1.2,
  pieces: {
    cut: { kind: "grid", columns: 1, rows: 34 },
    match: "spatial",
    motion: {
      stagger: 0.7,
      staggerBy: "random",
      lift: 0,
      arc: 0,
      tilt: 0,
      jolt: 0.35,
      rgbSplit: 0.012,
      swap: [0.45, 0.55],
    },
  },
});
