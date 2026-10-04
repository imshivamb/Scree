import { defineEffect } from "../registry";

export const effect = defineEffect({
  id: "origami",
  label: "Origami",
  description: "Large triangles fold over one after another into the next picture.",
  family: "pieces",
  durationSeconds: 2.2,
  pieces: {
    cut: { kind: "triangles", columns: 4, rows: 3, jitter: 0 },
    match: "spatial",
    motion: { stagger: 0.6, staggerBy: "x", lift: 0.2, arc: 0, tilt: 0, flip: "random", gloss: 0.5 },
  },
});
