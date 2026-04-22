// Run: node --experimental-vm-modules scripts/smoke-render.mjs
// Lightweight proof that canvas + BMP encoding work without Mongo.
import { createCanvas } from "@napi-rs/canvas";
import fs from "node:fs";

const W = 296, H = 128;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
ctx.fillStyle = "#000000";
ctx.fillRect(4, 4, W - 8, 20);
ctx.fillStyle = "#ffffff";
ctx.font = "bold 14px monospace";
ctx.textBaseline = "top";
ctx.fillText("EINK CMS SMOKE", 8, 6);
ctx.fillStyle = "#000000";
ctx.font = "12px monospace";
ctx.fillText("296x128 · 1-bit BMP", 8, 32);
ctx.strokeStyle = "#000000";
ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

const rgba = ctx.getImageData(0, 0, W, H).data;
const pix = new Uint8Array(W * H);
for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
  const g = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  pix[p] = g >= 160 ? 1 : 0;
}

// Inline the BMP encoder (duplicate of lib/bmp.ts, kept small for the smoke test)
function encode1(width, height, pixels) {
  const rowBytes = Math.ceil(width / 8);
  const rowStride = (rowBytes + 3) & ~3;
  const imageSize = rowStride * height;
  const pixelOffset = 14 + 40 + 8;
  const fileSize = pixelOffset + imageSize;
  const buf = Buffer.alloc(fileSize);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(pixelOffset, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(1, 28);
  buf.writeUInt32LE(imageSize, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(2, 46);
  buf[58] = 255; buf[59] = 255; buf[60] = 255;
  for (let y = 0; y < height; y++) {
    const dst = pixelOffset + y * rowStride;
    const srcRow = (height - 1 - y) * width;
    for (let x = 0; x < width; x++) {
      if (pixels[srcRow + x]) buf[dst + (x >> 3)] |= 1 << (7 - (x & 7));
    }
  }
  return buf;
}

const bmp = encode1(W, H, pix);
fs.writeFileSync("smoke.bmp", bmp);
console.log("Wrote smoke.bmp", bmp.length, "bytes");
