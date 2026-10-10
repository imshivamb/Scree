# Scree — Handoff

Everything someone (or a fresh AI session) needs to pick this project up: what it is, where things live, how to run, verify, release and deploy it, the house rules, and what is next.

_Last updated: 2026-10-04 · `scree-core@0.2.0` · `main` at the trusted-publishing commit._

---

## 1. What Scree is

**Every piece finds its place.** An open-source WebGL engine that breaks any picture into pieces and settles every piece where it belongs in the next one — real pixels, exact first and last frames, twenty transitions, frame-exact MP4 export.

Three surfaces, one engine:

| Surface | Where | Notes |
|---|---|---|
| `scree-core` (npm) | `src/engine` | The library. One runtime dependency: `three`. ~39 KB gzipped. |
| The website | `/` → `index.html`, `src/site` | One scroll-driven Scree transition ("The Descent"); all artwork is generated in code (`src/site/art.ts`). |
| The Studio | `/studio/` → `studio/index.html`, `src/studio` | React app: templates, your own images, every effect, export. |
| The lab | `/lab/` → `lab/index.html`, `src/playground` | Old developer playground. Unlinked; for testing renderers/drivers. |

Live: https://scree-tau.vercel.app · Studio: https://scree-tau.vercel.app/studio/ · npm: https://www.npmjs.com/package/scree-core · Repo: https://github.com/imshivamb/Scree

---

## 2. Run it

```bash
npm install
npm run dev            # site at http://localhost:5173, Studio at /studio/, lab at /lab/
npm test               # unit tests (Vitest, Node)
npm run build          # library + types + all three pages into dist/
npm run check:effects  # needs the dev server: verifies every effect rests exactly on the real pictures
```

`check:effects` drives your local Chrome over the DevTools protocol (no extra dependencies). Options: `-- --url http://localhost:5173/studio/ --chrome "path/to/chrome" --tolerance 6`.

---

## 3. Release to npm (trusted publishing — no tokens, no OTP)

Publishing happens on GitHub, not on your machine.

1. Bump `version` in `package.json` (e.g. `0.2.1`), commit, push to `main`.
2. Create a GitHub release whose tag matches: `v0.2.1`
   - website: Releases → Draft a new release, or
   - CLI: `gh release create v0.2.1 --target main --generate-notes`
3. `.github/workflows/publish.yml` runs: checks tag == version → `npm ci` → `npm publish` (whose `prepublishOnly` runs tests and builds the library + types) → publishes with provenance.
4. Watch it: `gh run list --workflow publish.yml --limit 1`, then `gh run watch <id> --exit-status`.
5. Verify: `npm view scree-core@<version> version`. The `latest` tag on `npm view scree-core` can lag a few minutes.

**One-time npm setting (already done):** npmjs.com → `scree-core` → Settings → Trusted Publisher → GitHub Actions · user `imshivamb` · repo `Scree` · workflow `publish.yml` · environment empty. If a run fails with `403 OIDC permission denied`, re-check that setting (exact casing, filename only, saved) and re-run the same run: `gh run rerun <id>`.

If the tag doesn't match the version, the workflow stops before publishing — fix the version or the tag and re-run.

**Local publishing is not the path any more.** The account requires an authenticator code for CLI publishes, and the old token in `~/.npmrc` is expired. If you ever must publish locally: build and test first, then `npm publish --ignore-scripts --otp=<fresh code>` (the code expires in ~30 s, so don't let the build eat it).

---

## 4. Deploy the website

Vercel deploys `main` automatically (build: `npm run build`, output: `dist`). Pushing to `main` updates https://scree-tau.vercel.app.

- **Analytics:** Vercel Web Analytics is wired in (`inject()` in `src/site/main.ts` and `src/playground/main.ts`, `<Analytics />` in `src/studio/main.tsx`). It must also be enabled in the Vercel project's **Analytics** tab. `@vercel/analytics` is a **dev** dependency on purpose, so `scree-core` users never install it.
- Work on a branch (`feat/...`), merge to `main` with a fast-forward when ready.

---

## 5. How the engine is built (where to change what)

Everything new is a **plug**, never an engine rewrite.

| Plug | Contract | Where |
|---|---|---|
| Source | input → `ParticleTarget` (image targets also carry `image`: element, pixels, world rect) | `src/engine/sources` |
| Matcher | pairs points/pieces: `transport` (place + colour, multiscale exact), `spatial`, `random` | `src/engine/match` |
| Effect | one definition registered once; works in Studio, site, React, export | `src/engine/effects` (`builtin/*.ts`, one file per effect) |
| Renderer family | `pieces` (real fragments), `surface` (whole-image shaders), points/sprites/shards | `src/engine/pieces`, `src/engine/surface`, `src/engine/renderers` |
| Style | per-cell redraw over any effect: dither, halftone, ascii, pixel, goo | `src/engine/styles` |
| Exporter | MP4 (WebCodecs + in-house muxer), PNG ZIP, PNG | `src/engine/export` |
| Camera | fit-to-content per picture, glide between, `setTilt` | `src/engine/camera.ts`, `scene.ts` |

**Add an effect:** create `src/engine/effects/builtin/<id>.ts` exporting `effect` (and `shader` for surface effects), add one line to `BUILT_IN` (and the shader list) in `src/engine/effects/index.ts`. The Studio and the site pick it up automatically. Then run `npm test` and `npm run check:effects`.

**Rules that keep it working:**
- Motion is a pure function of progress `t` — that is what makes scrubbing and export exact. No stateful simulation.
- Rest frames must be exact: `t = 0` shows the source, `t = 1` the destination. `check:effects` enforces it.
- GLSL gotchas already hit: `half` and `active` are reserved words.
- `scree-core` keeps a single runtime dependency (`three`).

---

## 6. House rules

- **No AI attribution** in commits or PRs (no `Co-Authored-By: Claude …`).
- **Plans stay local:** `plans/` is gitignored. The product plan is `plans/SCREE_PLAN.md` on the owner's machine — read it for direction and the task list; never commit it.
- `particle-morph-research/` is local reference only (gitignored); don't copy code from it.
- Verify visually before calling UI work done: run the page and screenshot it (headless Chrome over CDP works without extra dependencies).
- Keep secrets out of the repo; `.env*` is ignored.

---

## 7. Where things stand

**Released:** `scree-core` 0.2.0 and `scree-react` 0.1.0 (npm).

**On main, not yet released:** `scree-core` 0.3.0 and `scree-react` 0.2.0. The website already advertises them (the Builders "React" / "Interfaces" tabs and `/interfaces/`), so push and release together.
- Scroll stories: `warm(from, to)`, offscreen pause (pair crossing 84 ms to 4 ms).
- Interfaces: `snapshotElement` / `createElementTarget` (`src/engine/sources/from-dom.ts`), `transitionDom` / `primeDom` (`src/engine/dom/transition.ts`), group pairing and still pieces (`src/engine/pieces/build.ts`), picture framing (`src/engine/camera.ts`).
- React: `useSceneTransition` (in-page changes), `ScreeStage` + `useScreeStage().go(navigate)` (route changes).
- Demos: `/interfaces/` on the site (`src/interfaces`), `examples/next` (App Router; verified with a production build from packed tarballs: three routes animate, no flicks, no console errors). `/lab/dom/` is a developer bench.

**How a DOM transition plays (each step fixed a visible problem):**
1. The current state is captured ahead of time (`primeDom`), dropped on any DOM, hover, focus or size change, and redone once still.
2. On click, a still picture of the old state covers the element at once (no flash of the new state).
3. The change is applied and captured underneath; a reused, paused-when-idle engine draws its first frame under the cover, then the cover goes.
4. The canvas is 1.3x the element (lifted pieces are not clipped) with `framing: "picture"` and `fit: 1/1.3`, so rest frames land pixel for pixel; the element's own surface sits under the pieces (gaps show the app, not a hole).
5. Pieces that look the same in both states are pinned (`still`), so unchanged UI never trembles; marked groups are never pinned and travel whole.
6. 0.85 s, eased out; the live DOM is handed back on an identical last frame.

**Measured (headless, software GL; real GPUs are faster):** click to motion 150–330 ms after the first transition; layers match within one device pixel at 100–200 % scaling.

**To release:** push `main` (redeploys the site), GitHub release `v0.3.0` (scree-core), then `react-v0.2.0` (scree-react; needs the trusted publisher on npmjs.com: GitHub Actions, `imshivamb/Scree`, `publish-react.yml`).

**Known limits:** a state whose box changes size is scaled to the new box; a page that scrolls on navigation can misplace the cover; Liquid leaves a faint dark speck in the corners; capture skips video, iframes and cross-origin images without CORS; group pairing and still pieces apply to the pieces family only; back/forward is not animated.

**Next, in order:**
1. The user checks `/interfaces/` on their laptop and phone; tune from what they feel.
2. Release 0.3.0 / 0.2.0.
3. Live text (real fonts as glyph pieces) and SVG sources; animate back/forward.
4. A write-up and clips for free channels; a docs site.

The authoritative task list with checkboxes is in `plans/SCREE_PLAN.md` (local).
