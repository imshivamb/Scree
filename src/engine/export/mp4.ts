import { concat } from "./zip";

/**
 * Minimal MP4 (ISO BMFF) muxer for one H.264 video track, as produced by
 * WebCodecs `VideoEncoder` with `avc: { format: "avc" }`. Not fragmented:
 * ftyp → moov → mdat, so it plays everywhere and seeks instantly.
 */

const TIMESCALE = 90_000;
const MOVIE_TIMESCALE = 1_000;

type Sample = { data: Uint8Array; pts: number; key: boolean };

const text = (value: string) => new TextEncoder().encode(value);

function u8(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}
function u16(value: number): Uint8Array {
  return u8((value >>> 8) & 0xff, value & 0xff);
}
function u32(value: number): Uint8Array {
  return u8((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}
function zeros(length: number): Uint8Array {
  return new Uint8Array(length);
}

function box(type: string, ...payload: Uint8Array[]): Uint8Array {
  const body = concat(payload);
  return concat([u32(body.length + 8), text(type), body]);
}

function fullBox(type: string, version: number, flags: number, ...payload: Uint8Array[]): Uint8Array {
  return box(type, u8(version, (flags >>> 16) & 0xff, (flags >>> 8) & 0xff, flags & 0xff), ...payload);
}

const MATRIX = concat([0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].map(u32));

export class Mp4Muxer {
  private readonly samples: Sample[] = [];
  private description: Uint8Array | null = null;

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly fps: number,
  ) {}

  setDecoderDescription(description: Uint8Array): void {
    this.description ??= description;
  }

  /** Add an encoded sample in decode order. `ptsMicros` is its presentation time. */
  addSample(data: Uint8Array, ptsMicros: number, key: boolean): void {
    this.samples.push({ data, pts: Math.round((ptsMicros * TIMESCALE) / 1e6), key });
  }

  finish(): Uint8Array<ArrayBuffer> {
    if (!this.description) throw new Error("MP4 needs the encoder's decoder config");
    if (this.samples.length === 0) throw new Error("MP4 needs at least one frame");
    const delta = Math.round(TIMESCALE / this.fps);
    const count = this.samples.length;
    const mediaDuration = delta * count;

    // Decode times are evenly spaced; presentation offsets cover reordering.
    const offsets = this.samples.map((sample, index) => sample.pts - index * delta);
    const shift = Math.max(0, -Math.min(...offsets));
    const reordered = offsets.some((offset) => offset !== 0);

    const ftyp = box("ftyp", text("isom"), u32(512), text("isom"), text("iso2"), text("avc1"), text("mp41"));
    const mdatSize = this.samples.reduce((sum, sample) => sum + sample.data.length, 0);
    const buildMoov = (chunkOffset: number) =>
      this.moov(delta, count, mediaDuration, offsets, shift, reordered, chunkOffset);
    const probe = buildMoov(0);
    const moov = buildMoov(ftyp.length + probe.length + 8);

    return concat([ftyp, moov, u32(mdatSize + 8), text("mdat"), ...this.samples.map((s) => s.data)]);
  }

  private moov(
    delta: number,
    count: number,
    mediaDuration: number,
    offsets: number[],
    shift: number,
    reordered: boolean,
    chunkOffset: number,
  ): Uint8Array {
    const movieDuration = Math.round((mediaDuration * MOVIE_TIMESCALE) / TIMESCALE);
    const mvhd = fullBox(
      "mvhd", 0, 0,
      u32(0), u32(0), u32(MOVIE_TIMESCALE), u32(movieDuration),
      u32(0x00010000), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(2),
    );
    const tkhd = fullBox(
      "tkhd", 0, 3,
      u32(0), u32(0), u32(1), u32(0), u32(movieDuration), zeros(8),
      u16(0), u16(0), u16(0), u16(0), MATRIX, u32(this.width << 16), u32(this.height << 16),
    );
    const edts = shift
      ? box("edts", fullBox("elst", 0, 0, u32(1), u32(movieDuration), u32(shift), u16(1), u16(0)))
      : new Uint8Array(0);

    const mdhd = fullBox("mdhd", 0, 0, u32(0), u32(0), u32(TIMESCALE), u32(mediaDuration), u16(0x55c4), u16(0));
    const hdlr = fullBox("hdlr", 0, 0, u32(0), text("vide"), zeros(12), text("Scree\0"));
    const vmhd = fullBox("vmhd", 0, 1, zeros(8));
    const dinf = box("dinf", fullBox("dref", 0, 0, u32(1), fullBox("url ", 0, 1)));

    const avc1 = box(
      "avc1",
      zeros(6), u16(1), zeros(16), u16(this.width), u16(this.height),
      u32(0x00480000), u32(0x00480000), u32(0), u16(1), zeros(32), u16(0x0018), u16(0xffff),
      box("avcC", this.description ?? new Uint8Array(0)),
    );
    const stsd = fullBox("stsd", 0, 0, u32(1), avc1);
    const stts = fullBox("stts", 0, 0, u32(1), u32(count), u32(delta));
    const keys = this.samples.flatMap((sample, index) => (sample.key ? [index + 1] : []));
    const stss = fullBox("stss", 0, 0, u32(keys.length), ...keys.map(u32));
    const ctts = reordered
      ? fullBox("ctts", 0, 0, u32(count), ...offsets.flatMap((offset) => [u32(1), u32(offset + shift)]))
      : new Uint8Array(0);
    const stsc = fullBox("stsc", 0, 0, u32(1), u32(1), u32(count), u32(1));
    const stsz = fullBox("stsz", 0, 0, u32(0), u32(count), ...this.samples.map((s) => u32(s.data.length)));
    const stco = fullBox("stco", 0, 0, u32(1), u32(chunkOffset));

    const stbl = box("stbl", stsd, stts, ctts, stss, stsc, stsz, stco);
    const minf = box("minf", vmhd, dinf, stbl);
    const mdia = box("mdia", mdhd, hdlr, minf);
    const trak = box("trak", tkhd, edts, mdia);
    return box("moov", mvhd, trak);
  }
}
