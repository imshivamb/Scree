import { createImageTarget } from "./from-image";
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
};

const MAX_SIDE = 4096;

/** Fetch a URL and return it as a data URL, or the original when it cannot be read. */
async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
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
}

/** `@font-face` rules the page declares, with font files embedded so the snapshot keeps its type. */
async function embeddedFontCss(families: Set<string>): Promise<string> {
  const rules: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let cssRules: CSSRuleList;
    try {
      cssRules = sheet.cssRules;
    } catch {
      continue; // a cross-origin sheet we may not read
    }
    for (const rule of Array.from(cssRules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const family = rule.style.getPropertyValue("font-family").replace(/["']/g, "").trim();
      if (!families.has(family)) continue;
      const base = sheet.href ?? document.baseURI;
      let text = rule.cssText;
      const urls = Array.from(text.matchAll(/url\(["']?([^"')]+)["']?\)/g));
      for (const match of urls) {
        const raw = match[1] as string;
        const absolute = new URL(raw, base).href;
        text = text.replace(match[0], `url(${await toDataUrl(absolute)})`);
      }
      rules.push(text);
    }
  }
  return rules.join("\n");
}

/** Copy the computed style of `source` onto `clone`, and do the same down the tree. */
async function inlineTree(source: Element, clone: Element, fonts: Set<string>): Promise<void> {
  const computed = getComputedStyle(source);
  const target = (clone as HTMLElement).style;
  if (target) {
    for (let index = 0; index < computed.length; index += 1) {
      const name = computed.item(index);
      target.setProperty(name, computed.getPropertyValue(name), computed.getPropertyPriority(name));
    }
    const family = computed.getPropertyValue("font-family").split(",")[0]?.replace(/["']/g, "").trim();
    if (family) fonts.add(family);

    const background = computed.getPropertyValue("background-image");
    if (background && background !== "none" && background.includes("url(")) {
      let text = background;
      for (const match of Array.from(background.matchAll(/url\(["']?([^"')]+)["']?\)/g))) {
        const absolute = new URL(match[1] as string, document.baseURI).href;
        text = text.replace(match[0], `url(${await toDataUrl(absolute)})`);
      }
      target.setProperty("background-image", text);
    }
  }

  if (source instanceof HTMLImageElement && clone instanceof HTMLImageElement) {
    const src = source.currentSrc || source.src;
    if (src) clone.src = await toDataUrl(src);
    clone.removeAttribute("srcset");
    clone.removeAttribute("loading");
  } else if (source instanceof HTMLCanvasElement && clone instanceof HTMLCanvasElement) {
    const context = clone.getContext("2d");
    clone.width = source.width;
    clone.height = source.height;
    if (context) context.drawImage(source, 0, 0);
  } else if (source instanceof HTMLInputElement && clone instanceof HTMLInputElement) {
    clone.setAttribute("value", source.value);
    if (source.checked) clone.setAttribute("checked", "");
  } else if (source instanceof HTMLTextAreaElement) {
    clone.textContent = source.value;
  }

  const sourceChildren = Array.from(source.children);
  const cloneChildren = Array.from(clone.children);
  for (let index = 0; index < sourceChildren.length; index += 1) {
    const child = cloneChildren[index];
    if (child) await inlineTree(sourceChildren[index] as Element, child, fonts);
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
  const width = Math.max(1, Math.round(box.width));
  const height = Math.max(1, Math.round(box.height));
  const wanted = options.scale ?? Math.min(window.devicePixelRatio || 1, 2);
  const scale = Math.min(wanted, MAX_SIDE / Math.max(width, height));

  const groups: DomGroup[] = [];
  const marked = [element, ...Array.from(element.querySelectorAll("[data-scree]"))];
  for (const node of marked) {
    const id = node.getAttribute("data-scree");
    if (!id) continue;
    const rect = node.getBoundingClientRect();
    groups.push({ id, left: rect.left - box.left, top: rect.top - box.top, width: rect.width, height: rect.height });
  }

  const clone = element.cloneNode(true) as HTMLElement;
  const fonts = new Set<string>();
  await inlineTree(element, clone, fonts);
  clone.style.setProperty("margin", "0");
  clone.style.setProperty("position", "static");
  clone.style.setProperty("width", `${width}px`);
  clone.style.setProperty("height", `${height}px`);
  clone.style.setProperty("transform", "none");
  clone.style.setProperty("box-sizing", "border-box");

  const fontCss = await embeddedFontCss(fonts);
  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    (fontCss ? `<style>${fontCss}</style>` : "") +
    `<foreignObject x="0" y="0" width="100%" height="100%">` +
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

/** A transition state made from live DOM: pieces and particles built from what the element looks like now. */
export async function createElementTarget(
  element: Element,
  options: ImageTargetOptions & DomSnapshotOptions = {},
): Promise<ParticleTarget & { groups: DomGroup[] }> {
  const snapshot = await snapshotElement(element, options);
  const target = await createImageTarget(snapshot.canvas.toDataURL("image/png"), options);
  if (target.image) {
    target.image.groups = snapshot.groups.map((group) => ({
      id: group.id,
      u0: group.left / snapshot.width,
      u1: (group.left + group.width) / snapshot.width,
      v0: 1 - (group.top + group.height) / snapshot.height,
      v1: 1 - group.top / snapshot.height,
    }));
  }
  return Object.assign(target, { groups: snapshot.groups });
}
