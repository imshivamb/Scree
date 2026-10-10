# Scree

**Every piece finds its place.**

Scree is an open-source WebGL engine that breaks any picture into pieces and settles every piece where it belongs in the next one. A screenshot becomes its redesign, a cliff collapses into scree, a word shatters into a logo — as one continuous movement you can follow, not a cut or a crossfade.

- **Real pixels.** Every transition starts on your exact first frame and lands on your exact last frame.
- **Pieces that know where to go.** Pieces are paired by place and colour, so the button travels to where the button went.
- **Twenty transitions.** Landslide, Shatter, Page peel, Liquid, Ink bleed, Light leak, Pixel sort, Line-art… and you can register your own.
- **Exact export.** Render a frame-perfect MP4 or a transparent PNG sequence straight from the browser.
- **Small.** One runtime dependency (three.js), about 39 KB gzipped.

**Live:** [scree-tau.vercel.app](https://scree-tau.vercel.app) — the site is itself one long Scree transition. The no-code **Studio** is at [/studio](https://scree-tau.vercel.app/studio/).

---

## Install

```bash
npm install scree-core
```

`three` comes with it as a dependency.

## Quick start

```ts
import { createScree, createImageTarget } from "scree-core";

const canvas = document.querySelector("canvas")!;
const scree = createScree({ canvas, effect: "landslide" });

scree.addTarget("before", await createImageTarget("/before.png"));
scree.addTarget("after", await createImageTarget("/after.png"));

scree.transition({ from: "before", to: "after", durationSeconds: 2.4 });

// Keep the canvas sized to its box.
const resize = () => scree.resize(canvas.clientWidth, canvas.clientHeight);
resize();
window.addEventListener("resize", resize);

// When the canvas is removed:
// scree.dispose();
```

Every target in one engine must share a particle count. If you set `particleCount` yourself, pass the same value to every `create*Target` call.

## Scroll it instead of playing it

Motion is a pure function of progress, so any driver can scrub it — scroll, a slider, your own timeline.

```ts
scree.setDriver("manual");
scree.prepareTransition("before", "after");

window.addEventListener("scroll", () => {
  const section = document.querySelector("#story")!;
  const { top, height } = section.getBoundingClientRect();
  scree.setProgress(Math.min(1, Math.max(0, -top / (height - innerHeight))));
});
```

### In React and Next.js

[`scree-react`](packages/react) wraps all of that in a component (and a scroll hook), safe to render on the server:

```tsx
<ScreeSequence images={pictures} progress={scroll * (pictures.length - 1)} effect="shatter" />
```

### Transition a real interface

Scree can play any effect on live DOM: a route change, a tab switch, an empty-to-full state. It captures the element before and after your change, lays a canvas over it while the pieces travel, then hands the live page back, so focus, scroll and state are untouched.

```ts
import { transitionDom } from "scree-core";

await transitionDom(document.querySelector("#panel")!, {
  effect: "pieces",
  update: () => showSettings(), // make your change here (state, navigation, classes)
});
```

Live demo: [/interfaces](https://scree-tau.vercel.app/interfaces/). The overlay lands on the element pixel for pixel, so the hand-off is invisible. Call `primeDom(element)` once the page is quiet to capture the current state ahead of time; after that, a click only captures the new state (`useSceneTransition` does this for you).

Mark elements that should travel as one block with `data-scree="name"` in both states: `<div data-scree="revenue">` on the dashboard flies to the `revenue` card on the next screen. Reduced motion applies the change at once. Not captured: video frames, iframes and cross-origin images without CORS.

```tsx
const { ref, run } = useSceneTransition(); // scree-react
<div ref={ref}>{tab}</div>;
run(() => setTab("settings"), { effect: "shatter" });
```

## Effects

```ts
import { listEffects } from "scree-core";

scree.setEffect("peel");
console.log(listEffects().map((effect) => effect.id));
```

| Family | Effects |
|---|---|
| **Pieces** — the image cut into real fragments that travel | `landslide`, `pieces`, `shatter`, `slices`, `blinds`, `mosaic-flip`, `origami`, `card-stack`, `type-shatter` |
| **Surface** — whole-image shader transitions | `peel`, `liquid`, `ink`, `light-leak`, `pixel-sort`, `depth`, `line-art`, `glitch` |
| **Particles** — a fine point field between two real pictures | `dust`, `magnetic`, `gooey` |

Switch any time with `scree.setEffect(id)`; targets, timing and export keep working. Every effect is guaranteed to rest exactly on the source at `t = 0` and on the destination at `t = 1`.

### Make your own effect

An effect is one definition. Piece effects describe how to cut and how pieces move:

```ts
import { defineEffect, registerEffect } from "scree-core";

registerEffect(
  defineEffect({
    id: "rockfall",
    label: "Rockfall",
    description: "Big stones drop, heap, and climb into place.",
    family: "pieces",
    durationSeconds: 3,
    pieces: {
      cut: { kind: "triangles", density: 240, jitter: 0.25 },
      motion: { stagger: 0.4, staggerBy: "random", lift: 0.3, arc: 0, tilt: 0, gravity: 1.2, gloss: 0.5 },
    },
  }),
);

scree.setEffect("rockfall");
```

Surface effects bring a small GLSL function (`srcAt(p)` and `dstAt(p)` sample the two pictures, `t` runs 0 → 1):

```ts
import { defineEffect, registerEffect, registerSurfaceShader } from "scree-core";

registerSurfaceShader({
  id: "iris",
  fragment: `
    vec4 transition(vec2 p, float t) {
      float r = distance(unionUv(p), vec2(0.5));
      return blend(srcAt(p), dstAt(p), smoothstep(t * 0.8, t * 0.8 + 0.05, 0.8 - r));
    }`,
});

registerEffect(
  defineEffect({
    id: "iris",
    label: "Iris",
    description: "A circle opens onto the next picture.",
    family: "surface",
    durationSeconds: 1.4,
    surface: { shader: "iris" },
  }),
);
```

## Inputs

```ts
import {
  createImageTarget, // PNG, JPEG, WebP, SVG, a File, or a data URL
  createTextTarget, // a word or a short sentence
  createMeshTarget, // a GLB / GLTF surface
  createProceduralTarget, // "sphere", "torus", "cube", "helix", "spiral", "cylinder", "pyramid", "wave"
  createDustTarget, // loose pieces — a starting state for reveals
} from "scree-core";
```

## Matching

How pieces pair up between two pictures:

```ts
createScree({ canvas, match: "transport" }); // default: by place and colour
scree.setMatch("spatial"); // by relative place only
scree.setMatch("random"); // no pairing — a classic dissolve
```

For large point fields, `await scree.preloadMatch("before", "after", { compute })` lets you run the pairing in your own Web Worker.

## Styles

A style redraws the moving pieces per cell, on top of any effect.

```ts
scree.setStyle({ id: "halftone", cell: 8, palette: "source" });
scree.setStyle({ id: "ascii", palette: "mono", ink: "#eef3ff" });
scree.setStyle("none");
```

Styles: `none`, `dither`, `halftone`, `ascii`, `pixel`, `goo`. Palettes: `source`, `mono`, `duotone`.

## Export

Clips render offline, frame by frame, so every frame is exact on any machine.

```ts
const mp4 = await scree.record({
  from: "before",
  to: "after",
  aspect: "9:16", // "16:9" | "1:1" | "9:16" — or width + height
  quality: "1080p", // "720p" | "1080p" | "4k"
  durationSeconds: 2.4,
  holdStartSeconds: 0.6,
  holdEndSeconds: 1.2,
  onProgress: (fraction) => console.log(Math.round(fraction * 100) + "%"),
});

const frames = await scree.record({ from: "before", to: "after", format: "png-sequence" }); // ZIP, transparent
const still = await scree.snapshot({ aspect: "1:1" }); // PNG
```

MP4 uses the browser's own H.264 encoder (WebCodecs) and a small built-in MP4 writer. Where WebCodecs is missing, export a PNG sequence.

## Camera and framing

The camera fits every picture to the canvas and glides between them.

```ts
createScree({ canvas, fit: 0.7 }); // how much of the view a picture fills (0.1–1)
scree.setTilt(0.1, -0.05); // lean the camera: pieces in flight separate in depth (pointer parallax)
```

## API at a glance

| Call | What it does |
|---|---|
| `createScree(options)` | `canvas`, `effect`, `match`, `style`, `fit`, `quality`, `reducedMotion`, `onProgress`, `onTransitionStateChange`, `onError` |
| `addTarget(id, target)` / `removeTarget(id)` | Register or forget a picture |
| `transition({ from, to, durationSeconds })` | Play a transition |
| `prepareTransition(from, to)` + `setProgress(t)` | Scrub it yourself (after `setDriver("manual")`) |
| `warm(from, to)` / `preloadMatch(from, to)` | Get a pair ready ahead of time so scrolling into it never stalls: `warm` for piece and surface effects, `preloadMatch` for point effects |
| `setEffect(id)` / `getEffect()` | Choose the transition |
| `setMatch()` / `setStyle()` / `setFit()` / `setTilt()` | Pairing, finish, framing, parallax |
| `record(options)` / `snapshot(options)` | MP4, PNG sequence, PNG |
| `transitionDom(element, { update })` / `primeDom(element)` | Play a change to live DOM as a transition; capture the current state ahead of time |
| `resize(width, height)` / `dispose()` | Lifecycle |
| `listEffects()` / `defineEffect()` / `registerEffect()` / `registerSurfaceShader()` | The effect library |

Reduced motion is respected by default: transitions jump to the final picture.

---

## This repository

| Path | What it is |
|---|---|
| `src/engine` | The `scree-core` library |
| `interfaces/index.html`, `src/interfaces` | The live-interface demo at `/interfaces/` (built with `scree-react`) |
| `index.html`, `src/site` | The website at `/` — one scroll-driven Scree transition with artwork generated in code |
| `studio/index.html`, `src/studio` | The Studio at `/studio/` — templates, your own images, every effect, export |
| `lab/index.html` | A developer lab for renderers and drivers (unlinked) |
| `scripts/check-effects.mjs` | Verifies every effect starts and ends on the exact pictures |

### Develop

```bash
npm install
npm run dev            # site at http://localhost:5173, Studio at /studio/
npm test               # unit tests
npm run build          # library, types, and the site
npm run check:effects  # with the dev server running: exact first/last frames for every effect
```

### Changelog

- **0.3.0** — Interfaces: `transitionDom(element, { update })` plays any effect on live DOM; `data-scree` groups travel as one block; `snapshotElement` / `createElementTarget` turn DOM into a Scree state.
- **0.2.1** — `warm(from, to)`: cut the pieces and upload the pictures ahead of time, so crossing into the next pair of a scroll story costs about 4 ms instead of about 80 ms.
- **0.2.0** — Twenty effects in three families (pieces, surface, particles) on a pluggable effect registry. Transitions move real pixels and rest exactly on the first and last picture. New: Landslide, place-and-colour matching, styles (dither, halftone, ASCII, pixel, goo), frame-exact MP4 / PNG export, a fit-to-content camera with `setTilt`, the Studio, and the new website.
- **0.1.0** — The first particle morph engine.

### What Scree is not

A timeline editor, a 3D suite, or a physics engine. Scree does one thing: it turns one picture into the next, with every piece accounted for.

## License

MIT
