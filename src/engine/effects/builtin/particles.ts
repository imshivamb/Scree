import { defineEffect } from "../registry";

/** The point-field effects. */
export const dust = defineEffect({
  id: "dust",
  label: "Dust",
  description: "The picture turns to dust, drifts, and settles as the next one.",
  family: "particles",
  durationSeconds: 2.4,
  particles: { renderer: "points", motion: { expand: 0.45, turbulence: 0.55, settle: 0.25 } },
});

export const magnetic = defineEffect({
  id: "magnetic",
  label: "Magnetic pull",
  description: "Filings swirl inward and snap into the next shape like iron to a magnet.",
  family: "particles",
  durationSeconds: 2.2,
  particles: { renderer: "shards", motion: { implode: 0.55, orbit: 0.5, settle: 0.3 } },
});

export const gooey = defineEffect({
  id: "gooey",
  label: "Gooey",
  description: "Points melt into soft blobs that pour into the next shape.",
  family: "particles",
  durationSeconds: 2.4,
  particles: {
    renderer: "points",
    motion: { settle: 0.6, turbulence: 0.35 },
    style: { id: "goo", cell: 6 },
  },
});
