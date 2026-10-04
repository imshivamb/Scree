import {
  createDustTarget,
  createImageTarget,
  createScree,
  listEffects,
  type Scree,
} from "../engine";
import { matchInWorker } from "../studio/worker-match";
import {
  contoursArt,
  crystalArt,
  debrisStone,
  headlineArt,
  loadFonts,
  pileArt,
  strataArt,
  wordmarkArt,
} from "./art";
import { startCursor } from "./cursor";
import { inject } from "@vercel/analytics";

import "./site.css";

inject();

const PARTICLES = 128 * 128;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = () => window.innerWidth <= 860;

type StateId = "dust" | "headline" | "strata" | "pile" | "contours" | "crystal" | "wordmark";

/** Each scroll segment: the chapter it starts in, the next chapter, the pair it morphs, and how. */
type Segment = {
  from: string;
  to: string;
  states: [StateId, StateId];
  effect: string;
  /** Where the visual sits (vw) at the start and end, so it never fights the copy. */
  shift: [number, number];
  /** How much of the view it fills, start and end (defaults to the page fit). */
  fit?: [number, number];
  /** Vertical offset in vh, start and end (negative = up). */
  lift?: [number, number];
  /** Part of the scroll between the two chapters where the morph plays (default 0.16–0.78). */
  window?: [number, number];
};

const SEGMENTS: Segment[] = [
  { from: "hero", to: "break", states: ["headline", "strata"], effect: "type-shatter", shift: [0, 17] },
  { from: "break", to: "fall", states: ["strata", "pile"], effect: "landslide", shift: [17, -20], fit: [0.62, 0.52] },
  { from: "fall", to: "match", states: ["pile", "contours"], effect: "pieces", shift: [-20, 17], fit: [0.52, 0.62] },
  { from: "match", to: "settle", states: ["contours", "crystal"], effect: "liquid", shift: [17, -17] },
  { from: "settle", to: "library", states: ["crystal", "strata"], effect: "shatter", shift: [-17, -18], fit: [0.62, 0.44], lift: [0, 12] },
  {
    from: "builders",
    to: "basecamp",
    states: ["crystal", "wordmark"],
    effect: "landslide",
    shift: [0, 0],
    fit: [0.62, 0.5],
    lift: [0, -15],
    window: [0.58, 0.95],
  },
];

/** The artwork is generated, not downloaded: every visual on the page is drawn for it. */
const ART: Record<Exclude<StateId, "dust">, () => string> = {
  headline: headlineArt,
  strata: strataArt,
  pile: pileArt,
  contours: contoursArt,
  crystal: crystalArt,
  wordmark: wordmarkArt,
};

const canvas = document.querySelector<HTMLCanvasElement>("#stage");
const loaderCount = document.querySelector<HTMLElement>(".loader-count");
const routeNumber = document.querySelector<HTMLElement>(".route-number");
const routeNow = document.querySelector<HTMLElement>(".route-now");
const routeSteps = [...document.querySelectorAll<HTMLElement>(".route-steps li")];
const chapters = [...document.querySelectorAll<HTMLElement>("[data-chapter]")];
const effectsList = document.querySelector<HTMLOListElement>("#effects");
const ticker = document.querySelector<HTMLElement>("#ticker");

document.body.classList.add("is-loading");

function setLoader(fraction: number): void {
  if (loaderCount) loaderCount.textContent = String(Math.round(fraction * 100)).padStart(3, "0");
}

function chapterTop(id: string): number {
  const element = document.getElementById(id);
  return element ? element.getBoundingClientRect().top + window.scrollY : 0;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);

function buildLibrary(onPick: (id: string) => void): void {
  const effects = listEffects();
  const stat = document.querySelector("#stat-effects");
  if (stat) stat.textContent = String(effects.length);
  const words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty", "Twenty-one", "Twenty-two"];
  const count = document.querySelector("#effect-count");
  if (count) count.textContent = words[effects.length] ?? String(effects.length);
  if (ticker) {
    const names = effects.map((effect) => `<span>${effect.label}</span>`).join("");
    ticker.innerHTML = names + names;
  }
  if (!effectsList) return;
  effectsList.innerHTML = effects
    .map(
      (effect) =>
        `<li><button type="button" class="effect" data-effect="${effect.id}" title="${effect.description}">${effect.label}<small>${effect.family}</small></button></li>`,
    )
    .join("");
  for (const button of effectsList.querySelectorAll<HTMLButtonElement>(".effect")) {
    const pick = () => onPick(button.dataset.effect ?? "pieces");
    button.addEventListener("mouseenter", pick);
    button.addEventListener("focus", pick);
    button.addEventListener("click", pick);
  }
}

function revealCopy(): void {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) entry.target.classList.toggle("is-in", entry.isIntersecting);
    },
    { threshold: 0, rootMargin: "-26% 0px -22% 0px" },
  );
  for (const copy of document.querySelectorAll(".copy")) observer.observe(copy);
}

function setupInstall(): void {
  const button = document.querySelector<HTMLButtonElement>(".install");
  const state = button?.querySelector(".install-state");
  button?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy ?? "");
      if (state) state.textContent = "Copied";
      setTimeout(() => {
        if (state) state.textContent = "Copy";
      }, 1600);
    } catch {
      if (state) state.textContent = "Select it";
    }
  });
}

async function loadTargets(engine: Scree): Promise<void> {
  await loadFonts();
  // The first target registered is shown first, so dust goes in before anything else.
  engine.addTarget("dust", createDustTarget({ particleCount: PARTICLES, seed: 9, width: 3.2, height: 1.8 }));
  const entries = Object.entries(ART) as [Exclude<StateId, "dust">, () => string][];
  const steps = entries.length + SEGMENTS.length + 1;
  let done = 0;
  const tick = () => setLoader(++done / steps);
  for (const [id, draw] of entries) {
    // Draw one piece of art per frame so the counter keeps moving.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    engine.addTarget(id, await createImageTarget(draw(), { particleCount: PARTICLES, depth: 0.04, seed: 11 + done }));
    tick();
  }
  await engine.preloadMatch("dust", "headline", { compute: matchInWorker });
  tick();
  // Warm every segment (piece cuts, shaders) behind the loader so scrolling never hitches.
  for (const segment of SEGMENTS) {
    engine.setEffect(segment.effect);
    engine.prepareTransition(segment.states[0], segment.states[1]);
    await engine.snapshot({ width: 96, height: 54 });
    tick();
  }
}

/** Loose stones that fall past the page at different depths. */
function startDebris(): (scroll: number, dt: number) => void {
  const layer = document.querySelector<HTMLElement>(".debris");
  if (!layer || reducedMotion) return () => {};
  const random = (() => {
    let seed = 7;
    return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  })();
  const stones = Array.from({ length: narrow() ? 4 : 9 }, (_, index) => {
    const depth = 0.4 + random() * 0.7;
    const size = Math.round(8 + depth * 16);
    const image = document.createElement("img");
    image.src = debrisStone(100 + index, size * 2);
    image.width = size;
    image.height = size;
    image.alt = "";
    image.style.opacity = String(0.22 + depth * 0.32);
    layer.append(image);
    return { image, depth, x: random(), y: random(), spin: (random() - 0.5) * 2, fall: 6 + random() * 18, size };
  });
  let clock = 0;
  return (scroll, dt) => {
    clock += dt;
    const height = window.innerHeight + 200;
    for (const stone of stones) {
      // Each stone falls slowly on its own and is carried up by scroll at its depth: parallax.
      const travel = stone.y * height + clock * stone.fall * stone.depth - scroll * stone.depth * 0.55;
      const y = (((travel % height) + height) % height) - 100;
      const x = stone.x * window.innerWidth + Math.sin(clock * 0.3 + stone.x * 9) * 12 * stone.depth;
      const angle = clock * stone.spin * 20 + scroll * stone.spin * 0.08;
      stone.image.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${angle.toFixed(1)}deg)`;
    }
  };
}

async function main(): Promise<void> {
  revealCopy();
  setupInstall();
  if (window.matchMedia("(hover: hover)").matches) startCursor();

  if (!canvas) return;
  let engine: Scree;
  let introDone = reducedMotion;
  try {
    engine = createScree({
      canvas,
      fit: narrow() ? 0.86 : 0.62,
      match: "transport",
      onTransitionStateChange: (moving) => {
        if (!moving && !introDone) introDone = true;
      },
    });
  } catch {
    document.body.classList.remove("is-loading");
    return;
  }
  document.documentElement.classList.add("has-webgl");
  engine.resize(window.innerWidth, window.innerHeight);
  window.addEventListener("resize", () => engine.resize(window.innerWidth, window.innerHeight));

  let galleryEffect = "pieces";
  let galleryClock = 0;

  type Mode = "intro" | "segment" | "gallery" | "hold";
  let mode: Mode = "intro";
  let segmentIndex = -1;
  let shown = 0;
  let shift = 0;
  let lift = 0;
  let fit = narrow() ? 0.86 : 0.62;

  const enterGallery = () => {
    mode = "gallery";
    segmentIndex = -1;
    engine.setEffect(galleryEffect);
    engine.prepareTransition("strata", "crystal");
  };

  buildLibrary((id) => {
    if (id === galleryEffect) return;
    galleryEffect = id;
    galleryClock = 0;
    for (const button of effectsList?.querySelectorAll<HTMLElement>(".effect") ?? []) {
      button.classList.toggle("is-playing", button.dataset.effect === id);
    }
    if (mode === "gallery") enterGallery();
  });

  await loadTargets(engine);

  // Intro: dust gathers into the headline.
  window.scrollTo(0, 0);
  engine.setEffect("dust");
  engine.setDriver("auto");
  engine.transition({ from: "dust", to: "headline", durationSeconds: reducedMotion ? 0 : 2.6 });
  document.body.classList.remove("is-loading");
  setTimeout(() => document.body.classList.add("is-ready"), reducedMotion ? 0 : 900);

  const highlightRoute = (scroll: number) => {
    const middle = scroll + window.innerHeight * 0.5;
    let active = chapters[0]?.dataset.chapter ?? "hero";
    for (const chapter of chapters) {
      if (chapter.getBoundingClientRect().top + window.scrollY <= middle) active = chapter.dataset.chapter ?? active;
    }
    let past = true;
    for (const step of routeSteps) {
      const isActive = step.dataset.step === active;
      if (isActive) {
        past = false;
        if (routeNow) routeNow.textContent = step.textContent ?? "";
      }
      step.classList.toggle("is-active", isActive);
      step.classList.toggle("is-past", past && !isActive);
    }
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const elevation = Math.round(2846 * (1 - clamp01(scroll / max)));
    if (routeNumber) routeNumber.textContent = elevation.toLocaleString("en-US").replace(",", " ");
  };

  const debris = startDebris();
  const numerals = [...document.querySelectorAll<HTMLElement>(".numeral")];
  const pointer = { x: 0, y: 0 };
  const tilt = { x: 0, y: 0 };
  if (!reducedMotion && window.matchMedia("(hover: hover)").matches) {
    window.addEventListener("pointermove", (event) => {
      pointer.x = event.clientX / window.innerWidth - 0.5;
      pointer.y = event.clientY / window.innerHeight - 0.5;
    });
  }

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const scroll = window.scrollY;
    highlightRoute(scroll);
    debris(scroll, dt);
    document.body.classList.toggle("is-scrolled", scroll > window.innerHeight * 0.05);
    const bottom = document.documentElement.scrollHeight - window.innerHeight;
    document.body.classList.toggle("at-base", scroll > bottom - window.innerHeight * 0.35);
    for (const numeral of numerals) {
      const top = (numeral.parentElement?.getBoundingClientRect().top ?? 0);
      numeral.style.setProperty("--drift", `${(-top * 0.28).toFixed(1)}px`);
    }
    // The stage leans toward the pointer: lifted pieces separate in depth.
    tilt.x += (pointer.x * 0.16 - tilt.x) * Math.min(1, dt * 4);
    tilt.y += (-pointer.y * 0.1 - tilt.y) * Math.min(1, dt * 4);
    engine.setTilt(tilt.x, tilt.y);

    if (mode === "intro") {
      if (introDone || scroll > window.innerHeight * 0.08) {
        engine.setDriver("manual");
        mode = "segment";
      } else {
        requestAnimationFrame(frame);
        return;
      }
    }

    const libraryTop = chapterTop("library");
    const buildersTop = chapterTop("builders");
    const viewport = window.innerHeight;
    const inGallery = scroll >= libraryTop - viewport * 0.25 && scroll < buildersTop - viewport * 0.4;
    const inHold = scroll >= buildersTop - viewport * 0.4 && scroll < buildersTop;

    const pageFit = narrow() ? 0.86 : 0.62;
    let targetShift = 0;
    let targetLift = 0;
    let targetFit = pageFit;
    let stageOpacity = 1;
    if (inGallery) {
      if (mode !== "gallery") enterGallery();
      galleryClock += dt;
      // Hold, morph, hold, morph back: a calm loop that shows the whole effect.
      const cycle = 5.6;
      const phase = (galleryClock % cycle) / cycle;
      const progress =
        phase < 0.15 ? 0 : phase < 0.45 ? ease((phase - 0.15) / 0.3) : phase < 0.65 ? 1 : phase < 0.95 ? 1 - ease((phase - 0.65) / 0.3) : 0;
      engine.setProgress(reducedMotion ? (phase < 0.5 ? 0 : 1) : progress);
      targetShift = narrow() ? 0 : -18;
      targetLift = narrow() ? 0 : 15;
      targetFit = narrow() ? pageFit : 0.44;
      if (narrow()) stageOpacity = 0.35;
    } else if (inHold) {
      if (mode !== "hold") {
        mode = "hold";
        segmentIndex = -1;
        engine.setEffect("shatter");
        engine.prepareTransition("strata", "crystal");
        engine.setProgress(1);
      }
      stageOpacity = 0.12;
    } else {
      let index = 0;
      for (let candidate = 0; candidate < SEGMENTS.length; candidate += 1) {
        const segment = SEGMENTS[candidate];
        if (segment && scroll >= chapterTop(segment.from) - 1) index = candidate;
      }
      const segment = SEGMENTS[index];
      if (segment) {
        const start = chapterTop(segment.from);
        const end = chapterTop(segment.to);
        const fraction = (scroll - start) / Math.max(1, end - start);
        const [open, close] = segment.window ?? [0.16, 0.78];
        let target = clamp01((fraction - open) / (close - open));
        if (reducedMotion) target = target < 0.5 ? 0 : 1;
        if (mode !== "segment" || index !== segmentIndex) {
          mode = "segment";
          segmentIndex = index;
          shown = target;
          engine.setEffect(segment.effect);
          engine.prepareTransition(segment.states[0], segment.states[1]);
        }
        shown += (target - shown) * Math.min(1, dt * 7);
        engine.setProgress(shown);
        const eased = ease(shown);
        targetShift = narrow() ? 0 : mix(segment.shift[0], segment.shift[1], eased);
        if (segment.lift) targetLift = mix(segment.lift[0], segment.lift[1], eased);
        if (segment.fit) targetFit = mix(segment.fit[0], segment.fit[1], eased);
        if (segment.from === "builders") stageOpacity = mix(0.12, 1, eased);
      }
    }

    const follow = Math.min(1, dt * 5);
    shift += (targetShift - shift) * follow;
    lift += (targetLift - lift) * follow;
    const nextFit = fit + (targetFit - fit) * follow;
    if (Math.abs(nextFit - fit) > 0.0005) engine.setFit(nextFit);
    fit = nextFit;
    canvas.style.setProperty("--shift", `${shift.toFixed(2)}vw`);
    canvas.style.setProperty("--lift", `${lift.toFixed(2)}vh`);
    canvas.style.opacity = String(stageOpacity);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void main();
