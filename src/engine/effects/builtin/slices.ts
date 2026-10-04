import { defineEffect } from "../registry";

export const effect = defineEffect({
  id: "slices",
  label: "Slices",
  description: "Vertical strips slide sideways and reorder into the next picture.",
  family: "pieces",
  durationSeconds: 1.8,
  pieces: {
    cut: { kind: "grid", columns: 28, rows: 1 },
    motion: { stagger: 0.5, staggerBy: "x", lift: 0.08, arc: 0, tilt: 0, swap: [0.25, 0.75] },
  },
});
