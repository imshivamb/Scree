import { createImageTargetFromCanvas } from "./from-image";
import type { ImageTargetOptions, ParticleTarget } from "./types";

/** An element marked `data-scree="name"`, in CSS pixels relative to the snapshot's top-left. */
export type DomGroup = { id: string; left: number; top: number; width: number; height: number };

export type DomSnapshot = {
  canvas: HTMLCanvasElement;
  /** CSS size of the snapshotted element. */
  width: number;
  height: number;
  groups: DomGroup[];
};

export type DomSnapshotOptions = {
  /** Pixels per CSS pixel. Default: the device pixel ratio, capped at 2. */
  scale?: number;
  /** Paint behind transparent areas, e.g. the page background. Default transparent. */
  background?: string;
  /** Draw the element fully opaque even if it is hidden with `opacity` right now (as during a hand-off). */
  opaque?: boolean;
  /**
   * Draw only this part of the element (CSS pixels from its top-left), e.g. what is
   * on screen. A long page then costs what the viewport costs and stays sharp.
   */
  clip?: { left: number; top: number; width: number; height: number };
};

const MAX_SIDE = 4096;

const dataUrls = new Map<string, Promise<string>>();
const sheetTexts = new Map<string, Promise<string>>();

/** Fetch a URL and return it as a data URL, or the original when it cannot be read. Cached per URL. */
function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return Promise.resolve(url);
  let pending = dataUrls.get(url);
  if (!pending) {
    pending = (async () => {
      try {
        const response = await fetch(url, { mode: "cors" });
        if (!response.ok) return url;
        const blob = await response.blob();
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      } catch {
        return url;
      }
    })();
    dataUrls.set(url, pending);
  }
  return pending;
}

/** The text of a stylesheet we may not read through the CSSOM (e.g. Google Fonts), fetched over CORS. */
function sheetText(href: string): Promise<string> {
  let pending = sheetTexts.get(href);
  if (!pending) {
    pending = fetch(href, { mode: "cors" })
      .then((response) => (response.ok ? response.text() : ""))
      .catch(() => "");
    sheetTexts.set(href, pending);
  }
  return pending;
}

/** Only faces that cover basic Latin: font services split a family into many subsets. */
function coversLatin(rule: string): boolean {
  const range = /unicode-range:\s*([^;}]+)/i.exec(rule)?.[1];
  if (!range) return true;
  return range.split(",").some((part) => {
    const [start] = part.trim().replace(/^U\+/i, "").split("-");
    const value = parseInt((start ?? "").replace(/\?/g, "0"), 16);
    return value <= 0x41;
  });
}

async function embedUrls(rule: string, base: string): Promise<string> {
  let text = rule;
  for (const match of Array.from(rule.matchAll(/url\(["']?([^"')]+)["']?\)/g))) {
    const absolute = new URL(match[1] as string, base).href;
    text = text.replace(match[0], `url(${await toDataUrl(absolute)})`);
  }
  return text;
}

/** `@font-face` rules the page declares, with font files embedded so the snapshot keeps its type. */
async function embeddedFontCss(families: Set<string>): Promise<string> {
  const faces: { rule: string; base: string }[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    const base = sheet.href ?? document.baseURI;
    let cssRules: CSSRuleList | undefined;
    try {
      cssRules = sheet.cssRules;
    } catch {
      cssRules = undefined;
    }
    if (cssRules) {
      for (const rule of Array.from(cssRules)) {
        if (rule instanceof CSSFontFaceRule) faces.push({ rule: rule.cssText, base });
      }
    } else if (sheet.href) {
      const text = await sheetText(sheet.href);
      for (const match of text.matchAll(/@font-face\s*{[^}]*}/g)) faces.push({ rule: match[0], base });
    }
  }

  const rules: string[] = [];
  for (const { rule, base } of faces) {
    const family = /font-family:\s*([^;]+);/i.exec(rule)?.[1]?.replace(/["']/g, "").trim();
    if (!family || !families.has(family) || !coversLatin(rule)) continue;
    rules.push(await embedUrls(rule, base));
  }
  return rules.join("\n");
}

/** Properties a child takes from its parent unless it says otherwise. */
const INHERITED = new Set([
  "color", "cursor", "direction", "visibility", "quotes", "tab-size", "hyphens", "orphans", "widows",
  "font", "font-family", "font-feature-settings", "font-kerning", "font-optical-sizing", "font-size",
  "font-size-adjust", "font-stretch", "font-style", "font-synthesis", "font-variant", "font-variant-caps",
  "font-variant-east-asian", "font-variant-ligatures", "font-variant-numeric", "font-variant-position",
  "font-variation-settings", "font-weight", "letter-spacing", "line-height", "word-spacing", "word-break",
  "overflow-wrap", "white-space", "white-space-collapse", "text-wrap", "text-align", "text-align-last",
  "text-indent", "text-transform", "text-shadow", "text-rendering", "text-justify", "text-underline-position",
  "text-decoration-skip-ink", "text-emphasis-color", "text-emphasis-position", "text-emphasis-style",
  "-webkit-text-fill-color", "-webkit-text-stroke-color", "-webkit-text-stroke-width", "-webkit-font-smoothing",
  "-webkit-locale", "-webkit-text-security", "list-style", "list-style-image", "list-style-position",
  "list-style-type", "border-collapse", "border-spacing", "caption-side", "empty-cells", "caret-color",
  "color-scheme", "writing-mode", "paint-order", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width",
  "stroke-opacity", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "image-rendering", "pointer-events",
  "accent-color", "line-break", "ruby-position", "speak", "user-select", "-webkit-user-select",
]);

/** The browser's own computed style per tag, measured once in a blank frame with no author CSS. */
const defaults = new Map<string, Map<string, string>>();
let sandbox: HTMLIFrameElement | null = null;

function defaultStyle(tag: string): Map<string, string> {
  const known = defaults.get(tag);
  if (known) return known;
  if (!sandbox || !sandbox.isConnected) {
    sandbox = document.createElement("iframe");
    sandbox.setAttribute("aria-hidden", "true");
    sandbox.tabIndex = -1;
    Object.assign(sandbox.style, {
      position: "fixed",
      left: "-9999px",
      top: "0",
      width: "1px",
      height: "1px",
      visibility: "hidden",
      border: "0",
    });
    document.body.appendChild(sandbox);
    // Standards mode, like the snapshot itself: a bare frame would be in quirks mode,
    // whose defaults differ.
    const blank = sandbox.contentDocument;
    blank?.open();
    blank?.write("<!DOCTYPE html><html><head></head><body></body></html>");
    blank?.close();
  }
  const frameDocument = sandbox.contentDocument;
  const style = new Map<string, string>();
  if (frameDocument?.body) {
    const probe = frameDocument.createElement(tag);
    frameDocument.body.appendChild(probe);
    const computed = sandbox.contentWindow?.getComputedStyle(probe);
    if (computed) {
      for (let index = 0; index < computed.length; index += 1) {
        const name = computed.item(index);
        style.set(name, computed.getPropertyValue(name));
      }
    }
    probe.remove();
  }
  defaults.set(tag, style);
  return style;
}

/**
 * Values a blank probe cannot stand in for: ones that depend on the layout around
 * the element (a flex or grid item's `auto`) and system colours (a button's text
 * follows the page's colour scheme).
 */
const ALWAYS = new Set([
  "min-width",
  "min-height",
  "min-inline-size",
  "min-block-size",
  "width",
  "height",
  "color",
  "color-scheme",
]);

/** The style that makes the clone look like the source: only what it would not get anyway. */
function styleText(computed: CSSStyleDeclaration, parent: CSSStyleDeclaration | null, tag: string): string {
  const base = defaultStyle(tag);
  // Some tags do not inherit what others do (a button's font, a heading's weight):
  // a value only comes from the parent when this tag's default is the plain inherited one.
  const plain = defaultStyle("span");
  let text = "";
  for (let index = 0; index < computed.length; index += 1) {
    const name = computed.item(index);
    const value = computed.getPropertyValue(name);
    if (!ALWAYS.has(name)) {
      const inherits = parent !== null && INHERITED.has(name) && base.get(name) === plain.get(name);
      if (value === (inherits ? parent.getPropertyValue(name) : base.get(name))) continue;
    }
    text += `${name}:${value};`;
  }
  return text;
}

/** Every property, for pseudo-elements (rare, and their defaults depend on `content`). */
function fullStyleText(computed: CSSStyleDeclaration): string {
  let text = "";
  for (let index = 0; index < computed.length; index += 1) {
    const name = computed.item(index);
    text += `${name}:${computed.getPropertyValue(name)};`;
  }
  return text;
}

async function embedBackground(value: string): Promise<string> {
  let text = value;
  for (const match of Array.from(value.matchAll(/url\(["']?([^"')]+)["']?\)/g))) {
    const absolute = new URL(match[1] as string, document.baseURI).href;
    text = text.replace(match[0], `url(${await toDataUrl(absolute)})`);
  }
  return text;
}

type Inlining = {
  fonts: Set<string>;
  pseudo: string[];
  pending: Promise<void>[];
  count: number;
  /** Selectors (without the pseudo part) that give some element a ::before or ::after. */
  pseudoHosts: string[];
  /** The drawn region in viewport pixels; nodes wholly outside it keep their box but not their insides. */
  view: { left: number; top: number; right: number; bottom: number };
};

/** Every selector in the page's readable stylesheets that makes a ::before or ::after, minus that part. */
function pseudoHostSelectors(): string[] {
  const hosts = new Set<string>();
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        if (!/:(before|after)/i.test(rule.selectorText)) continue;
        for (const part of rule.selectorText.split(",")) {
          if (!/:(before|after)/i.test(part)) continue;
          const host = part.replace(/::?(before|after)/gi, "").trim();
          hosts.add(host === "" ? "*" : host);
        }
      } else if ("cssRules" in rule && (rule as CSSGroupingRule).cssRules) {
        visit((rule as CSSGroupingRule).cssRules);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visit(sheet.cssRules);
    } catch {
      // A cross-origin sheet we may not read (fonts, usually).
    }
  }
  return [...hosts];
}

function mayHavePseudo(element: Element, hosts: string[]): boolean {
  for (const host of hosts) {
    try {
      if (element.matches(host)) return true;
    } catch {
      // A selector this browser cannot match on its own (e.g. with :hover chains); ignore it.
    }
  }
  return false;
}

/**
 * Copy what `source` looks like onto `clone`, down the tree: computed style
 * (only what would not come for free), pseudo-elements, images, canvases and
 * form values. Fetches (images, backgrounds) run together and are awaited once.
 */
function inlineTree(source: Element, clone: Element, parent: CSSStyleDeclaration | null, work: Inlining): void {
  const computed = getComputedStyle(source);
  // Wholly outside what is drawn: keep the box (so everything visible lays out the
  // same) but not what is inside it. A long list then costs only its visible rows.
  if (parent && clone instanceof HTMLElement) {
    const box = source.getBoundingClientRect();
    const outside =
      box.right < work.view.left || box.left > work.view.right || box.bottom < work.view.top || box.top > work.view.bottom;
    if (outside && computed.getPropertyValue("display") !== "contents") {
      clone.setAttribute("style", `${styleText(computed, parent, source.tagName.toLowerCase())}visibility:hidden;`);
      clone.replaceChildren();
      return;
    }
  }
  if (clone instanceof HTMLElement || clone instanceof SVGElement) {
    clone.setAttribute("style", styleText(computed, parent, source.tagName.toLowerCase()));
    const family = computed.getPropertyValue("font-family").split(",")[0]?.replace(/["']/g, "").trim();
    if (family) work.fonts.add(family);

    const background = computed.getPropertyValue("background-image");
    if (background.includes("url(")) {
      const element = clone;
      work.pending.push(
        embedBackground(background).then((embedded) => {
          element.style.setProperty("background-image", embedded);
        }),
      );
    }

    // ::before and ::after are not in the DOM: give the clone a class and a rule for each.
    for (const which of mayHavePseudo(source, work.pseudoHosts) ? (["::before", "::after"] as const) : []) {
      const pseudo = getComputedStyle(source, which);
      const content = pseudo.getPropertyValue("content");
      if (!content || content === "none" || content === "normal") continue;
      work.count += 1;
      const name = `scree-p${work.count}`;
      clone.classList.add(name);
      work.pseudo.push(`.${name}${which}{${fullStyleText(pseudo)}}`);
    }
  }

  if (source instanceof HTMLImageElement && clone instanceof HTMLImageElement) {
    const src = source.currentSrc || source.src;
    clone.removeAttribute("srcset");
    clone.removeAttribute("loading");
    if (src) {
      work.pending.push(
        toDataUrl(src).then((data) => {
          clone.src = data;
        }),
      );
    }
  } else if (source instanceof HTMLCanvasElement && clone instanceof HTMLCanvasElement) {
    // A canvas serialises empty: swap it for a picture of its pixels.
    const picture = document.createElement("img");
    picture.setAttribute("style", clone.getAttribute("style") ?? "");
    try {
      picture.src = source.toDataURL();
    } catch {
      // A tainted canvas cannot be read; it stays blank.
    }
    clone.replaceWith(picture);
    return;
  } else if (source instanceof HTMLInputElement && clone instanceof HTMLInputElement) {
    clone.setAttribute("value", source.value);
    if (source.checked) clone.setAttribute("checked", "");
  } else if (source instanceof HTMLTextAreaElement) {
    clone.textContent = source.value;
  } else if (source instanceof HTMLSelectElement && clone instanceof HTMLSelectElement) {
    Array.from(clone.options).forEach((option, index) => {
      if (index === source.selectedIndex) option.setAttribute("selected", "");
      else option.removeAttribute("selected");
    });
  }

  const sourceChildren = source.children;
  const cloneChildren = Array.from(clone.children);
  for (let index = 0; index < sourceChildren.length; index += 1) {
    const child = cloneChildren[index];
    if (child) inlineTree(sourceChildren[index] as Element, child, computed, work);
  }
}

function loadSvg(markup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The page could not be drawn into a picture."));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
}

/**
 * Draw what an element looks like right now into a canvas, and note where each
 * `data-scree` element sits. The browser does the drawing (an SVG
 * foreignObject), so layout, type and CSS are exactly what the page shows.
 * Scripts, cross-origin images without CORS and video frames are not captured.
 */
export async function snapshotElement(
  element: Element,
  options: DomSnapshotOptions = {},
): Promise<DomSnapshot> {
  const box = element.getBoundingClientRect();
  const fullWidth = Math.max(1, Math.round(box.width));
  const fullHeight = Math.max(1, Math.round(box.height));
  const clip = options.clip ?? { left: 0, top: 0, width: fullWidth, height: fullHeight };
  const width = Math.max(1, Math.round(clip.width));
  const height = Math.max(1, Math.round(clip.height));
  const wanted = options.scale ?? Math.min(window.devicePixelRatio || 1, 2);
  const scale = Math.min(wanted, MAX_SIDE / Math.max(width, height));

  const groups: DomGroup[] = [];
  const marked = [element, ...Array.from(element.querySelectorAll("[data-scree]"))];
  for (const node of marked) {
    const id = node.getAttribute("data-scree");
    if (!id) continue;
    const rect = node.getBoundingClientRect();
    const left = rect.left - box.left - clip.left;
    const top = rect.top - box.top - clip.top;
    // Only groups that show in the drawn part.
    if (left + rect.width <= 0 || top + rect.height <= 0 || left >= width || top >= height) continue;
    groups.push({ id, left, top, width: rect.width, height: rect.height });
  }

  const clone = element.cloneNode(true) as HTMLElement;
  const work: Inlining = {
    fonts: new Set<string>(),
    pseudo: [],
    pending: [],
    count: 0,
    pseudoHosts: pseudoHostSelectors(),
    view: {
      left: box.left + clip.left,
      top: box.top + clip.top,
      right: box.left + clip.left + clip.width,
      bottom: box.top + clip.top + clip.height,
    },
  };
  inlineTree(element, clone, null, work);
  await Promise.all(work.pending);
  const fonts = work.fonts;
  clone.style.setProperty("margin", "0");
  if (options.opaque) clone.style.setProperty("opacity", "1");
  clone.style.setProperty("position", "static");
  // The exact size, not the rounded one: rounding would shift the layout inside by fractions.
  clone.style.setProperty("width", `${box.width}px`);
  clone.style.setProperty("height", `${box.height}px`);
  clone.style.setProperty("transform", "none");
  clone.style.setProperty("box-sizing", "border-box");

  const fontCss = await embeddedFontCss(fonts);
  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    (fontCss || work.pseudo.length > 0 ? `<style>${fontCss}${work.pseudo.join("")}</style>` : "") +
    `<foreignObject x="${-clip.left}" y="${-clip.top}" width="${box.width}" height="${box.height}">` +
    new XMLSerializer().serializeToString(clone) +
    `</foreignObject></svg>`;

  const picture = await loadSvg(markup);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("A canvas could not be created for the snapshot.");
  if (options.background) {
    context.fillStyle = options.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(picture, 0, 0, canvas.width, canvas.height);
  return { canvas, width, height, groups };
}

/** A transition state from a snapshot: its pixels, exact aspect, marked groups, and "keep what did not change still". */
export function targetFromSnapshot(
  snapshot: DomSnapshot,
  options: ImageTargetOptions = {},
): ParticleTarget & { groups: DomGroup[]; snapshot: DomSnapshot } {
  const target = createImageTargetFromCanvas(snapshot.canvas, options);
  if (target.image) {
    // Sampling rounds the picture's size; restore the element's exact aspect so an overlay lands pixel for pixel.
    const rect = target.image.rect;
    const middle = (rect.top + rect.bottom) / 2;
    const half = ((rect.right - rect.left) * (snapshot.height / snapshot.width)) / 2;
    target.image.rect = { ...rect, top: middle + half, bottom: middle - half };
    // An interface: what did not change between two states should not move.
    target.image.still = true;
    target.image.groups = snapshot.groups.map((group) => ({
      id: group.id,
      u0: group.left / snapshot.width,
      u1: (group.left + group.width) / snapshot.width,
      v0: 1 - (group.top + group.height) / snapshot.height,
      v1: 1 - group.top / snapshot.height,
    }));
  }
  return Object.assign(target, { groups: snapshot.groups, snapshot });
}

/**
 * The same snapshot placed inside a larger frame (CSS pixels): drawn at `left`,
 * `top`, with `background` around it (transparent by default, so nothing is drawn
 * there). Two states of different sizes, each put in the frame both share, line
 * up exactly where they sat on the page.
 */
export function placeSnapshot(
  snapshot: DomSnapshot,
  frame: { left: number; top: number; width: number; height: number },
  background?: string,
): DomSnapshot {
  const scale = snapshot.canvas.width / snapshot.width;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(frame.width * scale));
  canvas.height = Math.max(1, Math.round(frame.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("A canvas could not be created for the snapshot.");
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(snapshot.canvas, Math.round(frame.left * scale), Math.round(frame.top * scale));
  return {
    canvas,
    width: frame.width,
    height: frame.height,
    groups: snapshot.groups.map((group) => ({ ...group, left: group.left + frame.left, top: group.top + frame.top })),
  };
}

/** A transition state made from live DOM: pieces and particles built from what the element looks like now. */
export async function createElementTarget(
  element: Element,
  options: ImageTargetOptions & DomSnapshotOptions = {},
): Promise<ParticleTarget & { groups: DomGroup[]; snapshot: DomSnapshot }> {
  return targetFromSnapshot(await snapshotElement(element, options), options);
}
