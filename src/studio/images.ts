/** Input helpers: load what people drop or paste, and clean up logo backgrounds. */

const MAX_EDGE = 1024;
const TOLERANCE = 42;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That file is not an image Scree can read."));
    image.src = src;
  });
}

function drawToCanvas(image: HTMLImageElement): { canvas: HTMLCanvasElement; data: ImageData } {
  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot read images.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, data: context.getImageData(0, 0, canvas.width, canvas.height) };
}

function hasTransparency(data: ImageData): boolean {
  for (let index = 3; index < data.data.length; index += 4 * 7) {
    if ((data.data[index] ?? 255) < 250) return true;
  }
  return false;
}

/**
 * If the image is opaque, treat the colour found along its border as the
 * background and flood it away from the edges. Interior pixels of the same
 * colour (e.g. the white inside a letter) stay, because they are not reached.
 */
function floodBackground(data: ImageData): void {
  const { width, height } = data;
  const pixels = data.data;
  const border: number[] = [];
  for (let x = 0; x < width; x += 1) border.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y += 1) border.push(y * width, y * width + width - 1);

  let r = 0;
  let g = 0;
  let b = 0;
  for (const index of border) {
    r += pixels[index * 4] ?? 0;
    g += pixels[index * 4 + 1] ?? 0;
    b += pixels[index * 4 + 2] ?? 0;
  }
  r /= border.length;
  g /= border.length;
  b /= border.length;

  const distance = (index: number) =>
    Math.hypot(
      (pixels[index * 4] ?? 0) - r,
      (pixels[index * 4 + 1] ?? 0) - g,
      (pixels[index * 4 + 2] ?? 0) - b,
    );
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  for (const index of border) {
    if (!seen[index] && distance(index) < TOLERANCE) {
      seen[index] = 1;
      queue[tail++] = index;
    }
  }
  while (head < tail) {
    const index = queue[head++] ?? 0;
    const d = distance(index);
    // Soft edge: fully clear well inside the tolerance, fade near it.
    pixels[index * 4 + 3] = Math.round(255 * Math.max(0, (d - TOLERANCE * 0.55) / (TOLERANCE * 0.45)));
    const x = index % width;
    const neighbours = [
      x > 0 ? index - 1 : -1,
      x < width - 1 ? index + 1 : -1,
      index - width,
      index + width,
    ];
    for (const next of neighbours) {
      if (next < 0 || next >= width * height || seen[next]) continue;
      if (distance(next) < TOLERANCE) {
        seen[next] = 1;
        queue[tail++] = next;
      }
    }
  }
}

/** A URL Scree can sample. Logos get a transparent background when needed. */
export async function prepareImage(
  src: string,
  options: { removeBackground: boolean },
): Promise<string> {
  if (!options.removeBackground) return src;
  const image = await loadImage(src);
  const { canvas, data } = drawToCanvas(image);
  if (hasTransparency(data)) return src;
  floodBackground(data);
  canvas.getContext("2d")?.putImageData(data, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return src;
  return URL.createObjectURL(blob);
}

/** The first image file in a drop or paste, if any. */
export function imageFromTransfer(transfer: DataTransfer | null): File | null {
  if (!transfer) return null;
  for (const item of transfer.items ?? []) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  const file = transfer.files?.[0];
  return file && file.type.startsWith("image/") ? file : null;
}
