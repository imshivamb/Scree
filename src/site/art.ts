/**
 * Original artwork for the site, generated at load. The brand is rock:
 * strata, scree, contour lines, a crystal. Everything is drawn here — no stock,
 * no screenshots — at high resolution so the stage stays crisp.
 */

const BONE = "#eee8dc";
const STONE = "#a49b8e";
const EMBER = "#ff5a36";
const SERIF = '"Instrument Serif", "Times New Roman", serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

export async function loadFonts(): Promise<void> {
  if (!document.fonts) return;
  const wanted = [`400 200px ${SERIF}`, `italic 400 200px ${SERIF}`, `400 20px ${MONO}`];
  await Promise.race([
    Promise.all(wanted.map((font) => document.fonts.load(font))),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);
}

/* ——— Small numeric toolkit ——— */

function mulberry(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, seed: number, octaves = 5): number {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += noise(x * frequency, y * frequency, seed + octave * 17) * amplitude;
    frequency *= 2.02;
    amplitude *= 0.5;
  }
  return total;
}

type Rgb = [number, number, number];
const hex = (value: string): Rgb => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function canvas(width: number, height: number): { element: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  const context = element.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  return { element, context };
}

const toUrl = (element: HTMLCanvasElement) => element.toDataURL("image/png");

/* ——— Typography ——— */

/** "Every piece / finds its place." — roman over italic, like the page. */
export function headlineArt(): string {
  const { element, context } = canvas(2400, 1060);
  context.textAlign = "center";
  context.fillStyle = BONE;
  context.font = `400 400px ${SERIF}`;
  context.letterSpacing = "-10px";
  context.fillText("Every piece", 1200, 430);
  context.fillStyle = STONE;
  context.font = `italic 400 400px ${SERIF}`;
  context.fillText("finds its place.", 1200, 860);
  return toUrl(element);
}

/** The closing wordmark: "scree" with an ember full stop. */
export function wordmarkArt(): string {
  const { element, context } = canvas(2000, 800);
  context.textAlign = "center";
  context.font = `400 560px ${SERIF}`;
  context.letterSpacing = "-14px";
  const width = context.measureText("scree").width;
  context.fillStyle = BONE;
  context.fillText("scree", 960, 560);
  context.fillStyle = EMBER;
  context.beginPath();
  context.arc(960 + width / 2 + 54, 520, 40, 0, Math.PI * 2);
  context.fill();
  return toUrl(element);
}

/* ——— Strata: a monolith of warped rock layers with ember seams ——— */

export function strataArt(): string {
  const width = 1400;
  const height = 1000;
  const { element, context } = canvas(width, height);
  const image = context.createImageData(width, height);
  const bands: Rgb[] = ["#1d1611", "#3a2b21", "#7a4a33", "#b8865a", "#e6cda6", "#f3e6cf", "#a1734c", "#4b3426", "#c9a27a", "#2a1f18"].map(hex);
  const ember = hex(EMBER);
  // A crag: sharp peaks along the top, flanks that lean in, a broken base.
  const random = mulberry(41);
  const peaks: [number, number][] = [];
  for (let x = 0; x <= 1.0001; x += 0.07 + random() * 0.07) {
    const centre = 1 - Math.abs(x - 0.46) * 1.7;
    peaks.push([x, 0.06 + (1 - Math.max(0, centre)) * 0.42 + random() * 0.09]);
  }
  peaks.push([1, 0.55]);
  const ridgeAt = (u: number) => {
    let index = 0;
    while (index < peaks.length - 2 && (peaks[index + 1]?.[0] ?? 1) < u) index += 1;
    const [x0, y0] = peaks[index] ?? [0, 0.5];
    const [x1, y1] = peaks[index + 1] ?? [1, 0.5];
    return (y0 + (y1 - y0) * clamp((u - x0) / Math.max(1e-6, x1 - x0))) + (fbm(u * 30, 0.5, 3, 3) - 0.5) * 0.025;
  };
  const height0 = (u: number, v: number) => fbm(u * 7, v * 7, 17, 4);
  for (let y = 0; y < height; y += 1) {
    const v = y / height;
    const flank = 0.08 + Math.pow(1 - v, 1.4) * 0.12 + (fbm(0.2, v * 9, 9, 3) - 0.5) * 0.06;
    const flankRight = 0.08 + Math.pow(1 - v, 1.2) * 0.1 + (fbm(0.8, v * 9, 19, 3) - 0.5) * 0.06;
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      if (v < ridgeAt(u) || u < flank || u > 1 - flankRight || v > 0.95 - (fbm(u * 12, 0.9, 23, 3) - 0.5) * 0.05) continue;
      // Lit rock surface: a bump field gives every pixel a normal.
      const e = 1.5 / width;
      const h = height0(u, v);
      const nx = (height0(u + e, v) - h) / e;
      const ny = (height0(u, v + e) - h) / e;
      const shade = clamp(0.66 + (-nx * 0.55 - ny * 0.35) * 0.045, 0.25, 1.45);
      // Strata: warped, slightly dipping layers with crisp edges.
      const warp = fbm(u * 2, v * 2, 3, 4) * 0.35 + (fbm(u * 10, v * 4, 5, 3) - 0.5) * 0.06;
      const layer = (v * 15 + warp * 8 - u * 2.2 + 20) % bands.length;
      const index = Math.floor(layer);
      const within = layer - index;
      const base = bands[index] ?? bands[0]!;
      const edge = 1 - smooth(0, 0.03, Math.min(within, 1 - within));
      // Light falls from the upper left; the base of the crag sits in shadow.
      const light = shade * (1.15 - v * 0.55 - u * 0.15);
      let rgb = base.map((c) => c * light) as Rgb;
      rgb = mixRgb(rgb, [12, 9, 7], edge * 0.8);
      // Ember seams: glowing veins along some layer boundaries, with a soft bloom.
      const vein = smooth(0.55, 0.72, fbm(u * 3, v * 3, 29, 3));
      const glow = vein * (1 - smooth(0, 0.09, Math.min(within, 1 - within)));
      rgb = mixRgb(rgb, ember, Math.min(1, glow * 0.9 + vein * edge * 0.6));
      const offset = (y * width + x) * 4;
      image.data[offset] = clamp(rgb[0], 0, 255);
      image.data[offset + 1] = clamp(rgb[1], 0, 255);
      image.data[offset + 2] = clamp(rgb[2], 0, 255);
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return toUrl(element);
}

/* ——— Scree: a heap of individually lit stones ——— */

function stonePath(context: CanvasRenderingContext2D, cx: number, cy: number, r: number, random: () => number): void {
  const corners = 6 + Math.floor(random() * 4);
  context.beginPath();
  for (let corner = 0; corner < corners; corner += 1) {
    const angle = (corner / corners) * Math.PI * 2 + random() * 0.4;
    const radius = r * (0.72 + random() * 0.42);
    const x = cx + Math.cos(angle) * radius * 1.18;
    const y = cy + Math.sin(angle) * radius * 0.82;
    if (corner === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

function drawStone(context: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: Rgb, random: () => number): void {
  const [red, green, blue] = color;
  // Contact shadow.
  context.save();
  context.fillStyle = "rgba(8, 6, 5, 0.55)";
  stonePath(context, cx + r * 0.12, cy + r * 0.2, r, mulberry(Math.floor(cx * 13 + cy)));
  context.fill();
  context.restore();
  stonePath(context, cx, cy, r, random);
  const gradient = context.createRadialGradient(cx - r * 0.45, cy - r * 0.5, r * 0.1, cx, cy, r * 1.3);
  gradient.addColorStop(0, `rgb(${Math.min(255, red * 1.45)}, ${Math.min(255, green * 1.42)}, ${Math.min(255, blue * 1.38)})`);
  gradient.addColorStop(0.55, `rgb(${red}, ${green}, ${blue})`);
  gradient.addColorStop(1, `rgb(${red * 0.42}, ${green * 0.4}, ${blue * 0.38})`);
  context.fillStyle = gradient;
  context.fill();
  context.lineWidth = Math.max(1, r * 0.05);
  context.strokeStyle = `rgba(255, 240, 220, ${0.08 + random() * 0.1})`;
  context.stroke();
}

export function pileArt(): string {
  const width = 1400;
  const height = 1000;
  const { element, context } = canvas(width, height);
  const random = mulberry(77);
  const palette: Rgb[] = ["#4a3a30", "#6e5646", "#93765f", "#b89a7d", "#d8c1a4", "#3a2d25", "#a1734c", "#e6cda6"].map(hex);
  const foot = height * 0.9;
  const peak = height * 0.28;
  const halfWidth = width * 0.4;
  // A scree cone: concave flanks at the angle of repose, small stones high, boulders at the foot.
  const surface = (dx: number) => foot - (foot - peak) * Math.pow(Math.max(0, 1 - Math.abs(dx) / halfWidth), 1.7);
  const stones: { x: number; y: number; r: number; color: Rgb }[] = [];
  for (let index = 0; index < 1100; index += 1) {
    const dx = (random() * 2 - 1) * halfWidth * 1.04;
    const top = surface(dx);
    const into = Math.pow(random(), 0.7);
    const y = lerp(top, foot, into);
    const lowness = (y - peak) / (foot - peak);
    const r = lerp(5, 34, Math.pow(lowness, 1.6)) * (0.65 + random() * 0.6);
    const ember = random() < 0.025;
    const color = ember ? hex("#ff6a40") : (palette[Math.floor(random() * palette.length)] ?? palette[0]!);
    stones.push({ x: width / 2 + dx, y, r, color });
  }
  // Back to front by the bottom of each stone.
  stones.sort((a, b) => a.y + a.r - (b.y + b.r));
  for (const stone of stones) drawStone(context, stone.x, stone.y, stone.r, stone.color, random);
  // A few stones still bouncing down the flanks.
  for (let index = 0; index < 7; index += 1) {
    const side = random() < 0.5 ? -1 : 1;
    const dx = side * halfWidth * (0.2 + random() * 0.6);
    drawStone(context, width / 2 + dx, surface(dx) - 30 - random() * 90, 5 + random() * 9, palette[index % palette.length] ?? palette[0]!, random);
  }
  return toUrl(element);
}

/* ——— Contours: a topographic map of the descent ——— */

export function contoursArt(): string {
  const width = 1500;
  const height = 1000;
  const { element, context } = canvas(width, height);
  const image = context.createImageData(width, height);
  const field = new Float32Array(width * height);
  const levels = 22;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const v = y / height;
      // A massif: two peaks plus ridged noise.
      const peakA = Math.exp(-((u - 0.36) ** 2 * 9 + (v - 0.42) ** 2 * 11));
      const peakB = Math.exp(-((u - 0.68) ** 2 * 14 + (v - 0.6) ** 2 * 14)) * 0.7;
      field[y * width + x] = (peakA + peakB) * 0.82 + fbm(u * 3.2, v * 3.2, 13) * 0.32;
    }
  }
  const bone = hex(BONE);
  const ember = hex(EMBER);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const h = (field[index] ?? 0) * levels;
      const gx = ((field[index + 1] ?? 0) - (field[index - 1] ?? 0)) * levels * 0.5;
      const gy = ((field[index + width] ?? 0) - (field[index - width] ?? 0)) * levels * 0.5;
      const gradient = Math.hypot(gx, gy) + 1e-6;
      const f = h - Math.floor(h);
      const distance = Math.min(f, 1 - f) / gradient;
      const major = Math.floor(h + 0.5) % 5 === 0;
      const width_ = major ? 1.5 : 0.75;
      const line = 1 - smooth(width_ * 0.6, width_ + 0.6, distance);
      // Fade out at the edge of an oval map.
      const u = x / width - 0.5;
      const v = y / height - 0.5;
      const mask = 1 - smooth(0.36, 0.5, Math.hypot(u * 1.05, v * 1.45));
      const alpha = line * mask * (major ? 1 : 0.55);
      if (alpha <= 0.01) continue;
      const colour = major ? ember : bone;
      const offset = index * 4;
      image.data[offset] = colour[0];
      image.data[offset + 1] = colour[1];
      image.data[offset + 2] = colour[2];
      image.data[offset + 3] = Math.round(alpha * 255);
    }
  }
  context.putImageData(image, 0, 0);
  // Survey marks and spot heights.
  context.font = `400 22px ${MONO}`;
  context.fillStyle = STONE;
  const marks: [number, number, string][] = [
    [0.36, 0.42, "2 846"],
    [0.68, 0.6, "1 912"],
    [0.22, 0.7, "1 140"],
    [0.55, 0.24, "2 210"],
  ];
  for (const [u, v, label] of marks) {
    const x = u * width;
    const y = v * height;
    context.strokeStyle = EMBER;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x - 9, y);
    context.lineTo(x + 9, y);
    context.moveTo(x, y - 9);
    context.lineTo(x, y + 9);
    context.stroke();
    context.fillText(label, x + 16, y - 10);
  }
  return toUrl(element);
}

/* ——— Crystal: a faceted mineral sphere lit from within ——— */

export function crystalArt(): string {
  const size = 1000;
  const { element, context } = canvas(size, size);
  const image = context.createImageData(size, size);
  const random = mulberry(5);
  const sites: [number, number, number][] = [];
  for (let index = 0; index < 170; index += 1) {
    const z = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const ring = Math.sqrt(1 - z * z);
    sites.push([Math.cos(angle) * ring, Math.sin(angle) * ring, z]);
  }
  const light = [-0.5, -0.6, 0.62];
  const lightLength = Math.hypot(...light);
  const ember = hex(EMBER);
  const obsidian = hex("#0f0c0a");
  const smoke = hex("#4a4038");
  const radius = size * 0.42;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x - size / 2) / radius;
      const ny = (y - size / 2) / radius;
      const r2 = nx * nx + ny * ny;
      if (r2 > 1) continue;
      const nz = Math.sqrt(1 - r2);
      let best = -2;
      let second = -2;
      let facet: [number, number, number] = [nx, ny, nz];
      for (const site of sites) {
        const dot = site[0] * nx + site[1] * ny + site[2] * nz;
        if (dot > best) {
          second = best;
          best = dot;
          facet = site;
        } else if (dot > second) {
          second = dot;
        }
      }
      const edge = 1 - smooth(0, 0.006, best - second);
      const normal = [facet[0] * 0.85 + nx * 0.15, facet[1] * 0.85 + ny * 0.15, facet[2] * 0.85 + nz * 0.15];
      const length = Math.hypot(normal[0]!, normal[1]!, normal[2]!);
      const diffuse = clamp((normal[0]! * light[0]! + normal[1]! * light[1]! + normal[2]! * light[2]!) / (length * lightLength));
      // Each facet catches the light a little differently: glassy, not plastic.
      const facetTone = hash2(Math.floor(facet[0] * 1000), Math.floor(facet[1] * 1000), 3);
      const fresnel = Math.pow(1 - nz, 2.6);
      const inner = smooth(0.15, 1.1, nx * 0.55 + ny * 0.85 + 0.25) * (0.6 + facetTone * 0.4);
      let rgb = mixRgb(obsidian, smoke, Math.pow(diffuse, 1.6) * (0.5 + facetTone * 0.5));
      rgb = mixRgb(rgb, ember, inner * 0.62);
      rgb = mixRgb(rgb, [255, 238, 220], Math.pow(diffuse, 28) * 0.95 + edge * 0.18 * diffuse);
      rgb = mixRgb(rgb, ember, fresnel * 0.5);
      const offset = (y * size + x) * 4;
      const soft = 1 - smooth(0.988, 1, Math.sqrt(r2));
      image.data[offset] = clamp(rgb[0], 0, 255);
      image.data[offset + 1] = clamp(rgb[1], 0, 255);
      image.data[offset + 2] = clamp(rgb[2], 0, 255);
      image.data[offset + 3] = Math.round(255 * soft);
    }
  }
  context.putImageData(image, 0, 0);
  return toUrl(element);
}

/** Small loose stones for the parallax debris layer. */
export function debrisStone(seed: number, size: number): string {
  const { element, context } = canvas(size, size);
  const random = mulberry(seed);
  const palette: Rgb[] = ["#6e5646", "#93765f", "#b89a7d", "#4a3a30", "#d8c1a4"].map(hex);
  const color = random() < 0.12 ? hex("#ff6a40") : (palette[Math.floor(random() * palette.length)] ?? palette[0]!);
  drawStone(context, size / 2, size / 2, size * 0.34, color, random);
  return toUrl(element);
}
