import { defineEffect } from "../registry";

export const effect = defineEffect({
  id: "blinds",
  label: "Blinds",
  description: "Horizontal slats turn over, top to bottom, to show the next picture.",
  family: "pieces",
  durationSeconds: 1.6,
  pieces: {
    cut: { kind: "grid", columns: 1, rows: 16 },
    match: "spatial",
    motion: { stagger: 0.4, staggerBy: "y", lift: 0.04, arc: 0, tilt: 0, flip: "x" },
  },
});
