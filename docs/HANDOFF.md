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

**Merged on main, not yet released:** `scree-core` 0.3.0 and `scree-react` 0.2.0.
- `warm(from, to)` and the React scroll-story smoothness pass (pair crossing 84 ms to 4 ms).
- Interfaces (Horizon 1): `snapshotElement` / `createElementTarget` (live DOM as a state, `src/engine/sources/from-dom.ts`), group-aware piece pairing for `data-scree` regions (`src/engine/pieces/build.ts`), `transitionDom(element, { update })` (`src/engine/dom/transition.ts`), and `useSceneTransition` in `scree-react`. Try it at `/lab/dom/`.

**To release:** push `main` (redeploys the site), release `scree-core` with a GitHub release tagged `v0.3.0`, then `scree-react` with `react-v0.2.0` (needs the trusted publisher added on npmjs.com for `scree-react`: GitHub Actions, `imshivamb/Scree`, `publish-react.yml`).

**Known limits:** DOM capture skips video frames, iframes and cross-origin images without CORS; group pairing covers the pieces family only (particle effects ignore groups); a snapshot costs about 180 ms per screen; matching particle effects still runs on the main thread.

**Next, in order:**
1. A Next.js App Router example for route changes, and `<Scree.Transition>`.
2. Live text (real fonts as glyph pieces) and SVG sources.
3. A showcase app (dashboard / settings / detail) on the site and a write-up.
4. Measure on real devices; per-effect tuning and clips; a docs site.
5. Launch through free channels only (no paid award submissions).

The authoritative task list with checkboxes is in `plans/SCREE_PLAN.md` (local).
