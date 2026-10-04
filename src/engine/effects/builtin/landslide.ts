import { defineEffect } from "../registry";

export const effect = defineEffect({
  id: "landslide",
  label: "Landslide",
  description: "The picture breaks, falls, and heaps up as scree — then every stone climbs back into the next picture.",
  family: "pieces",
  durationSeconds: 3.2,
  pieces: {
    cut: { kind: "triangles", density: 900, jitter: 0.28 },
    motion: { stagger: 0.32, staggerBy: "random", lift: 0.35, arc: 0, tilt: 0, gravity: 1, gloss: 0.6 },
  },
});
