import { describe, expect, it } from "vitest";

import { Mp4Muxer } from "../src/engine/export/mp4";
import { exportSize, frameCount, progressAtFrame } from "../src/engine/export/timeline";
import { crc32, zipStore } from "../src/engine/export/zip";

type Box = { type: string; start: number; size: number; children: Box[] };
const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "dinf", "edts"]);

function readBoxes(bytes: Uint8Array, start: number, end: number): Box[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes: Box[] = [];
  let at = start;
  while (at < end) {
    const size = view.getUint32(at);
    const type = String.fromCharCode(...bytes.slice(at + 4, at + 8));
    expect(size).toBeGreaterThanOrEqual(8);
    boxes.push({
      type,
      start: at,
      size,
      children: CONTAINERS.has(type) ? readBoxes(bytes, at + 8, at + size) : [],
    });
    at += size;
  }
  expect(at).toBe(end);
  return boxes;
}

function find(boxes: Box[], path: string[]): Box {
  const [head, ...rest] = path;
  const box = boxes.find((candidate) => candidate.type === head);
  if (!box) throw new Error(`missing ${head}`);
  return rest.length ? find(box.children, rest) : box;
}

describe("export timing", () => {
  it("sizes aspects by their short side", () => {
    expect(exportSize("16:9", "1080p")).toEqual({ width: 1920, height: 1080 });
    expect(exportSize("9:16", "1080p")).toEqual({ width: 1080, height: 1920 });
    expect(exportSize("1:1", "720p")).toEqual({ width: 720, height: 720 });
    expect(exportSize("16:9", "4k")).toEqual({ width: 3840, height: 2160 });
  });

  it("holds, eases, and holds", () => {
    const timing = { fps: 30, durationSeconds: 2, holdStartSeconds: 1, holdEndSeconds: 1 };
    expect(frameCount(timing)).toBe(120);
    expect(progressAtFrame(0, timing)).toBe(0);
    expect(progressAtFrame(29, timing)).toBe(0);
    expect(progressAtFrame(60, timing)).toBeCloseTo(0.5);
    expect(progressAtFrame(90, timing)).toBe(1);
    expect(progressAtFrame(119, timing)).toBe(1);
  });
});

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("hello"))).toBe(0x3610a686);
  });

  it("writes stored entries with a central directory", () => {
    const zip = zipStore([
      { name: "a.png", data: new Uint8Array([1, 2, 3]) },
      { name: "b.png", data: new Uint8Array([4, 5]) },
    ]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const centralOffset = view.getUint32(end + 16, true);
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
  });
});

describe("mp4 muxer", () => {
  const description = new Uint8Array([1, 0x64, 0, 0x28, 0xff, 0xe1, 0, 0]);

  function mux(ptsOrder: number[]): Uint8Array {
    const muxer = new Mp4Muxer(640, 360, 30);
    muxer.setDecoderDescription(description);
    ptsOrder.forEach((frame, index) => {
      muxer.addSample(new Uint8Array(10 + index), (frame * 1e6) / 30, index === 0);
    });
    return muxer.finish();
  }

  it("writes ftyp, moov, mdat with consistent sizes", () => {
    const bytes = mux([0, 1, 2, 3]);
    const boxes = readBoxes(bytes, 0, bytes.length);
    expect(boxes.map((box) => box.type)).toEqual(["ftyp", "moov", "mdat"]);
    const mdat = find(boxes, ["mdat"]);
    expect(mdat.size).toBe(8 + 10 + 11 + 12 + 13);

    const view = new DataView(bytes.buffer);
    const stco = find(boxes, ["moov", "trak", "mdia", "minf", "stbl", "stco"]);
    expect(view.getUint32(stco.start + 16)).toBe(mdat.start + 8);
    const stsz = find(boxes, ["moov", "trak", "mdia", "minf", "stbl", "stsz"]);
    expect(view.getUint32(stsz.start + 16)).toBe(4);
    const stss = find(boxes, ["moov", "trak", "mdia", "minf", "stbl", "stss"]);
    expect(view.getUint32(stss.start + 12)).toBe(1);
    expect(() => find(boxes, ["moov", "trak", "mdia", "minf", "stbl", "ctts"])).toThrow();
  });

  it("adds composition offsets and an edit list when frames are reordered", () => {
    const bytes = mux([0, 2, 1, 3]);
    const boxes = readBoxes(bytes, 0, bytes.length);
    expect(find(boxes, ["moov", "trak", "mdia", "minf", "stbl", "ctts"]).size).toBeGreaterThan(16);
    expect(find(boxes, ["moov", "trak", "edts"]).size).toBeGreaterThan(8);
  });

  it("refuses to finish without frames or decoder config", () => {
    expect(() => new Mp4Muxer(2, 2, 30).finish()).toThrow(/decoder config/);
  });
});
