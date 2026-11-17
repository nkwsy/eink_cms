// An 8-bit greyscale frame: the form a finished screen takes between the
// renderer, storage and the BMP encoders. Crisp screens only ever hold 0 and
// 255; the calibration screen deliberately holds real greys.
import zlib from "node:zlib";
import crypto from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import { encodeBmp1bit, encodeBmp24FromGray } from "./bmp";

export type GrayFrame = { width: number; height: number; data: Uint8Array };
export type Rect = { x: number; y: number; w: number; h: number };

export function newFrame(width: number, height: number, fill = 0): GrayFrame {
  const data = new Uint8Array(width * height);
  if (fill) data.fill(fill);
  return { width, height, data };
}

export function roundRect(r: Rect): Rect {
  const x = Math.round(r.x);
  const y = Math.round(r.y);
  return { x, y, w: Math.round(r.x + r.w) - x, h: Math.round(r.y + r.h) - y };
}

export function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 <= x || y1 <= y) return null;
  return { x, y, w: x1 - x, h: y1 - y };
}

export function frameRect(frame: GrayFrame): Rect {
  return { x: 0, y: 0, w: frame.width, h: frame.height };
}

/** Fills a rectangle with one value, clipped to the frame and optional clip. */
export function fillRect(frame: GrayFrame, rect: Rect, value: number, clip?: Rect) {
  let r = intersect(roundRect(rect), frameRect(frame));
  if (r && clip) r = intersect(r, clip);
  if (!r) return;
  for (let y = r.y; y < r.y + r.h; y++) {
    frame.data.fill(value, y * frame.width + r.x, y * frame.width + r.x + r.w);
  }
}

/** Draws a ring of thickness `t` just inside `rect`. */
export function strokeRectInside(frame: GrayFrame, rect: Rect, t: number, value: number, clip?: Rect) {
  const r = roundRect(rect);
  const tt = Math.max(1, Math.min(Math.round(t), Math.floor(Math.min(r.w, r.h) / 2) || 1));
  fillRect(frame, { x: r.x, y: r.y, w: r.w, h: tt }, value, clip);
  fillRect(frame, { x: r.x, y: r.y + r.h - tt, w: r.w, h: tt }, value, clip);
  fillRect(frame, { x: r.x, y: r.y, w: tt, h: r.h }, value, clip);
  fillRect(frame, { x: r.x + r.w - tt, y: r.y, w: tt, h: r.h }, value, clip);
}

function colourToGray(style: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(style);
  if (!m) return style === "white" ? 255 : 0;
  const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  return Math.round((r * 299 + g * 587 + b * 114) / 1000);
}

/**
 * The small part of a canvas context that rectangle-only drawing code needs
 * (the QR renderer). Writes straight into a frame, so the result has no soft
 * edges by construction.
 */
export class FramePainter {
  fillStyle = "#000000";
  constructor(private frame: GrayFrame, private clip?: Rect) {}
  fillRect(x: number, y: number, w: number, h: number) {
    fillRect(this.frame, { x, y, w, h }, colourToGray(this.fillStyle), this.clip);
  }
}

/** Rotates by 0/90/180/270 degrees, matching the legacy renderer's rotation. */
export function rotateFrame(frame: GrayFrame, deg: number): GrayFrame {
  const { width: w, height: h, data } = frame;
  if (deg === 180) {
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) out[data.length - 1 - i] = data[i];
    return { width: w, height: h, data: out };
  }
  if (deg === 90 || deg === 270) {
    const out = new Uint8Array(data.length);
    const nw = h;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = data[y * w + x];
        if (deg === 90) out[x * nw + (h - 1 - y)] = v;
        else out[(w - 1 - x) * nw + y] = v;
      }
    }
    return { width: nw, height: w, data: out };
  }
  return frame;
}

/** Encodes a frame as the BMP a device expects (24-bit or 1-bit). */
export function frameToBmp(frame: GrayFrame, bitDepth: 1 | 24 | undefined): Buffer {
  if (bitDepth === 24) return encodeBmp24FromGray(frame.width, frame.height, frame.data);
  const bits = new Uint8Array(frame.data.length);
  for (let i = 0; i < bits.length; i++) bits[i] = frame.data[i] >= 128 ? 1 : 0;
  return encodeBmp1bit(frame.width, frame.height, bits);
}

export async function frameToPng(frame: GrayFrame): Promise<Buffer> {
  const canvas = createCanvas(frame.width, frame.height);
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(frame.width, frame.height);
  for (let i = 0, p = 0; i < frame.data.length; i++, p += 4) {
    const v = frame.data[i];
    img.data[p] = v;
    img.data[p + 1] = v;
    img.data[p + 2] = v;
    img.data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.encode("png");
}

/** Compresses a frame for storage. A black-and-white 28" screen is ~100–300 KB. */
export function packFrame(frame: GrayFrame): Buffer {
  return zlib.deflateSync(Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength));
}

export function unpackFrame(packed: Uint8Array, width: number, height: number): GrayFrame {
  const raw = zlib.inflateSync(packed);
  if (raw.length !== width * height) {
    throw new Error(`stored frame is ${raw.length} bytes, expected ${width}×${height}`);
  }
  return { width, height, data: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) };
}

export function frameHash(frame: GrayFrame): string {
  return crypto
    .createHash("sha256")
    .update(`${frame.width}x${frame.height}:`)
    .update(frame.data)
    .digest("hex");
}

/** True when every pixel is pure black or pure white. */
export function isPureBlackWhite(frame: GrayFrame): boolean {
  for (let i = 0; i < frame.data.length; i++) {
    const v = frame.data[i];
    if (v !== 0 && v !== 255) return false;
  }
  return true;
}
