import { createCanvas, loadImage, SKRSContext2D } from "@napi-rs/canvas";
import path from "node:path";
import fs from "node:fs/promises";
import { AssetDoc, Block, DeviceDoc } from "./mongo";
import { encodeBmp1bit, rgbaTo1Bit } from "./bmp";
import { ensureFontsRegistered, fontString } from "./fonts";
import { renderQr } from "./qr";
import { abbreviateDay, dayOfMonth, formatTimeParts, monthName, parseFlexible } from "./dates";

// ---- Rendering pipeline ----
// 1) Draw everything onto an RGBA canvas at device pixel size.
// 2) Threshold the result to 1-bit (no antialiasing in the final image).
// 3) Emit BMP from the 1-bit buffer.

export type RenderOptions = {
  dither?: boolean;
  threshold?: number;
};

export async function renderDevice(
  device: DeviceDoc,
  assetMap: Map<string, AssetDoc>,
  opts: RenderOptions = {}
): Promise<{ pixels1: Uint8Array; rgba: Uint8ClampedArray; width: number; height: number; bmp: Buffer }> {
  ensureFontsRegistered();
  const canvas = createCanvas(device.width, device.height);
  const ctx = canvas.getContext("2d") as SKRSContext2D;
  // @ts-ignore
  ctx.imageSmoothingEnabled = false;
  // @ts-ignore
  ctx.antialias = "none";

  const defaultBg = device.background ?? "white";
  ctx.fillStyle = defaultBg === "black" ? "#000000" : "#ffffff";
  ctx.fillRect(0, 0, device.width, device.height);

  for (const block of device.layout) {
    await drawBlock(ctx, block, assetMap, { defaultBg });
  }

  const rgba = ctx.getImageData(0, 0, device.width, device.height).data;
  const pixels1 = rgbaTo1Bit(rgba, device.width, device.height, {
    mode: opts.dither ? "dither" : "threshold",
    threshold: opts.threshold ?? 160,
  });

  let outW = device.width;
  let outH = device.height;
  let outPixels = pixels1;
  if (device.rotation) {
    const r = rotatePixels(pixels1, device.width, device.height, device.rotation);
    outPixels = r.pixels;
    outW = r.width;
    outH = r.height;
  }

  const bmp = encodeBmp1bit(outW, outH, outPixels);
  return { pixels1: outPixels, rgba, width: outW, height: outH, bmp };
}

function rotatePixels(pixels: Uint8Array, w: number, h: number, deg: number) {
  if (deg === 180) {
    const out = new Uint8Array(pixels.length);
    for (let i = 0; i < pixels.length; i++) out[pixels.length - 1 - i] = pixels[i];
    return { pixels: out, width: w, height: h };
  }
  if (deg === 90 || deg === 270) {
    const out = new Uint8Array(pixels.length);
    const nw = h, nh = w;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const src = y * w + x;
        if (deg === 90) {
          out[x * nw + (h - 1 - y)] = pixels[src];
        } else {
          out[(w - 1 - x) * nw + y] = pixels[src];
        }
      }
    }
    return { pixels: out, width: nw, height: nh };
  }
  return { pixels, width: w, height: h };
}

// Context passed through asset instances so variable bindings propagate
// into child blocks (text templates, image slots, QR URLs, dates).
type DrawCtx = {
  bindings?: Record<string, string>;
  imageBindings?: Record<string, string>;
  defaultBg?: "white" | "black";
};

function applyVars(text: string | undefined, dctx: DrawCtx): string {
  if (!text) return "";
  if (!dctx.bindings) return text;
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, k) => {
    return dctx.bindings?.[k] ?? "";
  });
}

async function drawBlock(
  ctx: SKRSContext2D,
  block: Block,
  assetMap: Map<string, AssetDoc>,
  dctx: DrawCtx
) {
  const effectiveBg = block.background ?? dctx.defaultBg ?? (block.invert ? "black" : "white");
  // Explicit per-block background fill only applies when the block actually
  // opts into one (via background or invert) — otherwise we leave whatever
  // is already on the canvas untouched (e.g. device-level black).
  if (block.background || block.invert) {
    ctx.fillStyle = effectiveBg === "black" ? "#000000" : "#ffffff";
    ctx.fillRect(block.x, block.y, block.w, block.h);
  }
  if (block.border) {
    ctx.strokeStyle = effectiveBg === "black" ? "#ffffff" : "#000000";
    ctx.lineWidth = 1;
    ctx.strokeRect(block.x + 0.5, block.y + 0.5, block.w - 1, block.h - 1);
  }
  const fg = effectiveBg === "black" ? "#ffffff" : "#000000";

  switch (block.type) {
    case "asset":
      await drawAsset(ctx, block, assetMap, dctx);
      return;
    case "image":
      await drawImage(ctx, block, dctx);
      return;
    case "text":
      drawText(ctx, block, fg, dctx);
      return;
    case "qr":
      await drawQrBlock(ctx, block, dctx, fg);
      return;
    case "date":
      drawDate(ctx, block, fg, dctx);
      return;
    case "line":
      drawLine(ctx, block, fg);
      return;
    case "shape":
      drawShape(ctx, block, fg);
      return;
  }
}

async function drawAsset(ctx: SKRSContext2D, block: Block, assetMap: Map<string, AssetDoc>, parentCtx: DrawCtx) {
  if (!block.assetId) return;
  const asset = assetMap.get(block.assetId);
  if (!asset) return;
  // Compose variable bindings: start with asset-variable defaults, then overlay instance bindings.
  const bindings: Record<string, string> = {};
  for (const v of asset.variables ?? []) {
    if (v.default != null) bindings[v.key] = v.default;
  }
  if (block.variableBindings) Object.assign(bindings, block.variableBindings);
  const imageBindings = { ...(block.imageBindings ?? {}) };

  // The asset's internal canvas background follows (in order): the instance's
  // explicit background, the asset's own default background, or the parent bg.
  const innerBg = block.background ?? asset.background ?? parentCtx.defaultBg ?? "white";

  const off = createCanvas(asset.width, asset.height);
  const octx = off.getContext("2d") as SKRSContext2D;
  // @ts-ignore
  octx.imageSmoothingEnabled = false;
  // @ts-ignore
  octx.antialias = "none";
  octx.fillStyle = innerBg === "black" ? "#000000" : "#ffffff";
  octx.fillRect(0, 0, asset.width, asset.height);
  for (const inner of asset.layout) {
    await drawBlock(octx, inner, assetMap, { bindings, imageBindings, defaultBg: innerBg });
  }
  // @ts-ignore
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, block.x, block.y, block.w, block.h);
}

async function drawImage(ctx: SKRSContext2D, block: Block, dctx: DrawCtx) {
  // imageData may reference a variable slot name — e.g. "{{photo}}" — which
  // lets asset instances swap images. It may also be:
  //   - a data: URL (user-uploaded 1-bit PNG)
  //   - a leading-slash path, resolved against ./public/ on disk
  //   - an http(s) URL (fetched by loadImage)
  let src = block.imageData;
  if (src && src.startsWith("{{") && src.endsWith("}}")) {
    const key = src.slice(2, -2).trim();
    src = dctx.imageBindings?.[key] ?? dctx.bindings?.[key];
  }
  if (!src) return;
  try {
    let source: string | Buffer = src;
    if (src.startsWith("/")) {
      const abs = path.join(process.cwd(), "public", src.replace(/^\/+/, ""));
      source = await fs.readFile(abs);
    }
    const img = await loadImage(source);
    // @ts-ignore
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, block.x, block.y, block.w, block.h);
  } catch (e) {
    console.error("image load failed", src, e);
  }
}

function drawText(ctx: SKRSContext2D, block: Block, fg: string, dctx: DrawCtx) {
  const padding = block.padding ?? 4;
  const x = block.x + padding;
  const y = block.y + padding;
  const w = block.w - padding * 2;
  const h = block.h - padding * 2;
  const size = block.fontSize ?? 16;
  ctx.fillStyle = fg;
  ctx.font = fontString(block.fontFamily ?? "mono", size, !!block.bold, !!block.italic);
  ctx.textBaseline = "top";

  const raw = applyVars(block.text, dctx);
  const lines = wrapText(ctx, raw, w);
  const lineHeight = Math.ceil(size * (block.lineHeight ?? 1.15));
  const totalH = lines.length * lineHeight;
  let startY = y;
  if (block.vAlign === "middle") startY = y + Math.max(0, Math.floor((h - totalH) / 2));
  if (block.vAlign === "bottom") startY = y + Math.max(0, h - totalH);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = ctx.measureText(line);
    let lx = x;
    if (block.align === "center") lx = x + Math.max(0, Math.floor((w - m.width) / 2));
    if (block.align === "right") lx = x + Math.max(0, w - Math.ceil(m.width));
    ctx.fillText(line, lx, startY + i * lineHeight);
  }
}

function wrapText(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  const paragraphs = text.split(/\r?\n/);
  for (const para of paragraphs) {
    if (para.length === 0) { out.push(""); continue; }
    const words = para.split(/\s+/);
    let line = "";
    for (const word of words) {
      const candidate = line ? line + " " + word : word;
      const m = ctx.measureText(candidate);
      if (m.width <= maxWidth || line === "") {
        line = candidate;
      } else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

async function drawQrBlock(ctx: SKRSContext2D, block: Block, dctx: DrawCtx, fg: string) {
  const url = applyVars(block.qrUrl ?? block.text ?? "", dctx);
  if (!url) return;
  // QR always needs white modules around it to scan — paint the block white
  // first if our context is otherwise black.
  const parentBg = dctx.defaultBg === "black" ? "black" : "white";
  if (parentBg === "black") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(block.x, block.y, block.w, block.h);
  }
  await renderQr(ctx, url, { x: block.x, y: block.y, w: block.w, h: block.h }, {
    margin: block.qrMargin ?? 0,
    errorLevel: block.qrErrorLevel ?? "L",
  });
}

function drawDate(ctx: SKRSContext2D, block: Block, fg: string, dctx: DrawCtx) {
  const dateSrc = applyVars(block.dateISO, dctx);
  const date = parseFlexible(dateSrc) ?? new Date();
  const startTime = parseFlexible(applyVars(block.startTime, dctx), date);
  const endTime = parseFlexible(applyVars(block.endTime, dctx), date);

  ctx.fillStyle = fg;

  if (block.dateLayout === "row") {
    const parts: string[] = [];
    if (block.dateShowDayOfWeek !== false) parts.push(abbreviateDay(date));
    if (block.dateShowMonth !== false) parts.push(monthName(date));
    if (block.dateShowDay !== false) parts.push(dayOfMonth(date));
    let line = parts.join(" ");
    if (block.dateShowTime && startTime) {
      const s = formatTimeParts(startTime);
      if (endTime) {
        const e = formatTimeParts(endTime);
        line += ` · ${s.hm}-${e.hm}${e.ampm}`;
      } else {
        line += ` · ${s.hm}${s.ampm}`;
      }
    }
    const padding = block.padding ?? 4;
    ctx.font = fontString(block.fontFamily ?? "houschka", block.fontSize ?? 16, !!block.bold, !!block.italic);
    ctx.textBaseline = "top";
    const m = ctx.measureText(line);
    const innerW = block.w - padding * 2;
    const x = block.x + padding;
    const y = block.y + padding;
    const lx = block.align === "center" ? x + Math.max(0, (innerW - m.width) / 2) :
               block.align === "right"  ? x + Math.max(0, innerW - m.width) : x;
    ctx.fillText(line, lx, y);
    return;
  }

  // Legacy-style stacked layout — anchor points mirror banner.py/add_text_date.
  // Inside a box of height H (typical 180), with an 80-px grid unit the legacy
  // uses these anchors relative to the box origin:
  //   day-of-week   center-bottom at (70, 0.25·H)   demibold, font_size(4)=39
  //   day-of-month  center-bottom at (70, 0.75·H)   medium,   font_size(8)=95
  //   month         center-top    at (70, 0.80·H)   medium,   font_size(2)=25
  //   time-start    left-bottom   at (140, 0.75·H)  demibold, font_size(3)=31
  //   time-end      left-top      at (140, 0.80·H)  medium,   font_size(1)=20
  const H = block.h;
  const scale = H / 180;
  const base = block.fontSize ?? Math.max(8, Math.round(16 * scale));
  const size = (n: number) => Math.max(6, Math.round(base * Math.pow(1.25, n)));

  const dateCx = block.x + Math.round(70 * scale);
  const timeLx = block.x + Math.round(140 * scale);
  const yFrac = (f: number) => block.y + Math.round(f * H);

  ctx.textAlign = "center";

  if (block.dateShowDayOfWeek !== false) {
    ctx.font = fontString("houschka-demibold", size(4), false, false);
    ctx.textBaseline = "alphabetic";
    ctx.fillText(abbreviateDay(date), dateCx, yFrac(0.25));
  }
  if (block.dateShowDay !== false) {
    ctx.font = fontString("houschka", size(8), false, false);
    ctx.textBaseline = "alphabetic";
    ctx.fillText(dayOfMonth(date), dateCx, yFrac(0.75));
  }
  if (block.dateShowMonth !== false) {
    ctx.font = fontString("houschka", size(2), false, false);
    ctx.textBaseline = "top";
    ctx.fillText(monthName(date), dateCx, yFrac(0.80));
  }

  if (block.dateShowTime && startTime) {
    ctx.textAlign = "left";
    const s = formatTimeParts(startTime);
    ctx.font = fontString("houschka-demibold", size(3), false, false);
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`${s.hm}${s.ampm}`, timeLx, yFrac(0.75));
    if (endTime) {
      const e = formatTimeParts(endTime);
      ctx.font = fontString("houschka", size(1), false, false);
      ctx.textBaseline = "top";
      ctx.fillText(`to ${e.hm}${e.ampm}`, timeLx, yFrac(0.80));
    }
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

function drawLine(ctx: SKRSContext2D, block: Block, fg: string) {
  const t = Math.max(1, block.lineThickness ?? 1);
  ctx.fillStyle = fg;
  if (block.lineDirection === "vertical") {
    ctx.fillRect(block.x + Math.floor((block.w - t) / 2), block.y, t, block.h);
  } else {
    ctx.fillRect(block.x, block.y + Math.floor((block.h - t) / 2), block.w, t);
  }
}

function drawShape(ctx: SKRSContext2D, block: Block, fg: string) {
  if (block.shapeKind === "outlined") {
    ctx.strokeStyle = fg;
    ctx.lineWidth = Math.max(1, block.lineThickness ?? 1);
    ctx.strokeRect(block.x + 0.5, block.y + 0.5, block.w - 1, block.h - 1);
  } else {
    ctx.fillStyle = fg;
    ctx.fillRect(block.x, block.y, block.w, block.h);
  }
}
