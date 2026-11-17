import fs from "node:fs";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { AssetDoc, Block } from "@/lib/mongo";
import { frameToPng, GrayFrame } from "@/lib/frame";

let nextId = 0;
export function block(partial: Partial<Block> & Pick<Block, "type" | "x" | "y" | "w" | "h">): Block {
  return { id: `b${nextId++}`, ...partial };
}

/** A PNG data URL built from a per-pixel grey function. */
export function grayPngDataUrl(w: number, h: number, value: (x: number, y: number) => number): string {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.max(0, Math.min(255, Math.round(value(x, y))));
      const p = (y * w + x) * 4;
      img.data[p] = v; img.data[p + 1] = v; img.data[p + 2] = v; img.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`;
}

export function countValue(frame: GrayFrame, value: number): number {
  let n = 0;
  for (let i = 0; i < frame.data.length; i++) if (frame.data[i] === value) n++;
  return n;
}

export function distinctLevels(frame: GrayFrame): number {
  const seen = new Uint8Array(256);
  for (let i = 0; i < frame.data.length; i++) seen[frame.data[i]] = 1;
  return seen.reduce((a, b) => a + b, 0);
}

/** Writes a PNG next to the tests' output folder when EINK_TEST_OUT is set. */
export async function dump(name: string, frame: GrayFrame) {
  const dir = process.env.EINK_TEST_OUT;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.png`), await frameToPng(frame));
}

/**
 * Compares a frame with a stored reference image, pixel for pixel. Text is
 * rasterised slightly differently on different operating systems, so a small
 * share of differing pixels is allowed. Set UPDATE_GOLDEN=1 to (re)write the
 * reference.
 */
export async function expectMatchesGolden(name: string, frame: GrayFrame, maxDiffShare = 0.004) {
  const file = path.join(__dirname, "golden", `${name}.png`);
  if (process.env.UPDATE_GOLDEN === "1" || !fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, await frameToPng(frame));
    return;
  }
  const img = await loadImage(fs.readFileSync(file));
  if (img.width !== frame.width || img.height !== frame.height) {
    throw new Error(`${name}: reference is ${img.width}×${img.height}, frame is ${frame.width}×${frame.height}`);
  }
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, img.width, img.height).data;
  let diff = 0;
  for (let i = 0; i < frame.data.length; i++) if (px[i * 4] !== frame.data[i]) diff++;
  const share = diff / frame.data.length;
  if (share > maxDiffShare) {
    await dump(`${name}-actual`, frame);
    throw new Error(`${name}: ${(share * 100).toFixed(3)}% of pixels differ from the reference`);
  }
}

export function eventCardAsset(): AssetDoc {
  return {
    name: "Event row",
    width: 400,
    height: 100,
    background: "black",
    variables: [
      { key: "title", type: "text", default: "Workshop" },
      { key: "url", type: "url", default: "https://www.urbanrivers.org" },
    ],
    layout: [
      block({ type: "text", x: 8, y: 8, w: 280, h: 40, text: "{{title}}", fontFamily: "houschka-bold", fontSize: 30, padding: 0 }),
      block({ type: "line", x: 0, y: 96, w: 400, h: 4, lineDirection: "horizontal", lineThickness: 4, lineColor: "white" }),
      block({ type: "qr", x: 310, y: 6, w: 84, h: 84, qrUrl: "{{url}}", qrStyle: "bars", qrQuiet: 2, qrErrorLevel: "M" }),
    ],
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}
