import { defineEffect } from "../registry";

export const effect = defineEffect({
  id: "mosaic-flip",
  label: "Mosaic flip",
  description: "Tiles flip like cards from the centre out — old picture on the front, new on the back.",
  family: "pieces",
  durationSeconds: 1.8,
  pieces: {
    cut: { kind: "grid", density: 160 },
    match: "spatial",
    motion: { stagger: 0.55, staggerBy: "radial", lift: 0.12, arc: 0, tilt: 0, flip: "y", gloss: 0.4 },
  },
});
