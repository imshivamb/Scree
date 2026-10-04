# Scree

**Every piece finds its place.**

Drop in two things (a screenshot, a logo, a photo, a word, a 3D model) and Scree turns one into the other as a single transformation you can follow. It is not a cut and not a crossfade. The first form breaks into pieces, and each piece travels to its matching place in the next form: the blue button flows to where the blue button went.

Scree is named after the slope of broken rock under a cliff, where every falling stone settles where it fits.

**Live:** [scree-tau.vercel.app](https://scree-tau.vercel.app)

### What you can make

- **Launch and changelog moments:** old UI → new UI, v1 → v2.
- **Logo reveals:** a mark that forms from loose pieces.
- **Hero and scroll sections:** a page that turns this into that as you scroll.
- **Before → after** for anything you can draw, photograph, or model.

Today Scree is a browser library (`scree-core`) and a playground. Video export, more styles, and a no-code studio are next.

## Playground

```bash
npm install
npm test
npm run dev
```

Open the local Vite URL for the site; the Studio is at `/studio/`. In the Studio, pick an **Effect** (Pieces, Shatter, Page peel, Liquid, Line-art…), drop in your own images, scrub, and export. The older developer playground lives at `/lab/`. The **Target** panel is Image / Text / 3D / Shape. **Points / Sprites / Shards** change the draw. **Smart / Spatial / Random** decide how pieces pair up. **Organic / Flow / Explode / Dissolve / Vortex** mix motions. **Auto / Manual / Scroll / Pointer** write progress. **Showcase** scrolls Image → Text → 3D → Shape on the same field. **Copy code** copies a snippet you can paste next to a Scree canvas. Files stay in the browser.

## Install

```ts
// npm install scree-core
import {
  createScree,
  createImageTarget,
  createTextTarget,
  createMeshTarget,
  createSphereTarget,
} from "scree-core";

const canvas = document.querySelector("canvas");
if (!canvas) throw new Error("Scree canvas not found.");

const engine = createScree({ canvas });
engine.addTarget("logo", await createImageTarget("/logo.png", {
  particleCount: 128 * 128,
}));
engine.addTarget("hello", createTextTarget("HELLO", {
  particleCount: 128 * 128,
}));
engine.addTarget("model", await createMeshTarget("/heart.glb", {
  particleCount: 128 * 128,
}));
engine.addTarget("sphere", createSphereTarget({
  particleCount: 128 * 128,
}));

engine.transition({
  from: "logo",
  to: "hello",
  durationSeconds: 1.6,
  motion: "organic",
});
engine.setRenderer("sprites");

// Call this when the canvas is removed from the page.
// engine.dispose();
```

The same API works with `new Scree({ canvas })`; `createScree` is the recommended entry point. Defaults choose quality and reduced-motion behavior from the browser. `setBehavior("expand")` is still exclusive expand. A mix adds displacements; it does not swap the field. `transition` picks the pair and the mix. Drivers only write `t` and pointer. Changing one of those does not require changing the others.

Every generator returns the same `ParticleTarget`: `{ positions, colors, seeds, normals, groupIds?, count }`. Targets must share a particle count. `setRenderer` only changes how the field is drawn.

### Match

Match decides which point in one form travels to which point in the next.

```ts
createScree({ canvas });                     // match: "transport" (default)
engine.setMatch("spatial");                  // from the next morph on
engine.transition({ to: "after", match: "random" });
```

- `transport`: pairs by place **and colour**, so regions travel to their counterparts (a moved button, a recoloured chart). The pairing is approximate optimal transport, computed once per pair and cached; 16k points take about a quarter of a second.
- `spatial`: pairs by relative place only. Shapes line up; colour is ignored.
- `random`: no pairing. The classic dissolve.

Every target is stored in a canonical order along a Hilbert curve, so `spatial` is free. A GLB with several meshes gets one group per mesh (`groupIds`), and groups stay together. Use the `flow` motion when you want viewers to see what moved; `organic` opens a cloud that hides it.

- `points` — glow dots. Default and cheapest.
- `sprites` — instanced soft quads, a little larger than points.
- `shards` — instanced triangles that rotate in flight.

`size` is a multiplier around the renderer’s own default, not a pixel value.

### Styles

A style redraws the same moving pieces per cell, so every motion and every match works in every style.

```ts
createScree({ canvas, style: "halftone" });
engine.setStyle({ id: "dither", cell: 3, palette: "source" });
engine.setStyle({ id: "ascii", palette: "mono", ink: "#eef3ff" });
engine.setStyle("none"); // back to the points as they are
```

- Styles: `none`, `dither`, `halftone`, `ascii`, `pixel`.
- `cell`: cell size in CSS pixels.
- `palette`: `source` (the form's own colours), `mono` (one `ink`), `duotone` (`shade` → `ink`).
- Each style remembers its own settings when you switch away and back.

### Export

Clips render offline, frame by frame, so every frame is exact no matter how fast the machine is.

```ts
const mp4 = await engine.record({
  from: "before",
  to: "after",
  aspect: "9:16",          // "16:9" | "1:1" | "9:16", or width + height
  quality: "1080p",        // "720p" | "1080p" | "4k"
  durationSeconds: 1.8,
  holdStartSeconds: 0.6,
  holdEndSeconds: 1.2,
  onProgress: (f) => console.log(Math.round(f * 100) + "%"),
});

const frames = await engine.record({ from: "before", to: "after", format: "png-sequence" }); // ZIP, transparent
const still = await engine.snapshot({ aspect: "1:1" });                                       // PNG, transparent
```

MP4 uses the browser's own H.264 encoder (WebCodecs) and a small built-in MP4 writer, with no extra dependency. Where WebCodecs is missing, export a PNG sequence. The camera fits every form to the export's aspect (`fit`, default 0.82 for exports).

Presets: `organic`, `flow`, `dissolve`, `explode`, `implode`, `vortex`, `reveal`, `disperse`, `reassemble`. Weights can also be envelopes: `{ expand: { from: 0, to: 0.8, easing: "organic" } }`.

## Contributor commands

```bash
npm test
npm run build
npm run pack:check
```

The package build emits an ESM bundle and declarations under `dist`. Three.js is installed as Scree's normal runtime dependency. React is not required and React bindings are not included yet.

## What this is not

Audio, webcam, WebGPU, physics, or a React package. Video export and a no-code studio are next.
