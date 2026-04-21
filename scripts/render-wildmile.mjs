// Render the Wild Mile banner without hitting MongoDB.
// Usage: npx tsx scripts/render-wildmile.mjs [out.png]
import path from "node:path";
import fs from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";

process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";

const { renderDevice } = await import("../lib/render.ts");
const { PRESET_FACTORIES } = await import("../lib/presets.ts");
const { wildMileDeviceDoc } = await import("../lib/seed-wildmile.ts");

const now = new Date();
const assetMap = new Map();
const keyToId = {};
for (const f of PRESET_FACTORIES) {
  const id = `fake_${f.key}`;
  keyToId[f.key] = id;
  assetMap.set(id, { _id: id, ...f.make(), createdAt: now, updatedAt: now });
}
const ids = {
  event: keyToId.event,
  activity: keyToId.activity,
  activityDated: keyToId.activity_dated,
  callout: keyToId.callout,
  titleBar: keyToId.title_bar,
};
const device = { _id: "demo", ...wildMileDeviceDoc(ids), createdAt: now, updatedAt: now };

console.log("Rendering Wild Mile", device.width, "×", device.height, "with", device.layout.length, "blocks…");
const { bmp, pixels1, width, height } = await renderDevice(device, assetMap, { threshold: 160 });

// Dump 1-bit preview as PNG.
const canvas = createCanvas(width, height);
const ctx = canvas.getContext("2d");
const img = ctx.createImageData(width, height);
for (let i = 0, p = 0; i < pixels1.length; i++, p += 4) {
  const v = pixels1[i] ? 255 : 0;
  img.data[p] = v; img.data[p + 1] = v; img.data[p + 2] = v; img.data[p + 3] = 255;
}
ctx.putImageData(img, 0, 0);
const png = await canvas.encode("png");
const outPng = process.argv[2] || path.join(process.cwd(), "scripts", "wildmile.png");
await fs.writeFile(outPng, png);
await fs.writeFile(outPng.replace(/\.png$/, ".bmp"), bmp);
console.log("Wrote", outPng, "and", outPng.replace(/\.png$/, ".bmp"));
