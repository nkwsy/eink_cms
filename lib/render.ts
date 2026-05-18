import { createCanvas, loadImage, SKRSContext2D } from "@napi-rs/canvas";
import path from "node:path";
import fs from "node:fs/promises";
import { AssetDoc, Block, DeviceDoc, FontFamily } from "./mongo";
import { encodeBmp1bit, encodeBmp24bit, rgbaTo1Bit, rotateRgba } from "./bmp";
import { ensureFontsRegistered, fontString } from "./fonts";
import { renderQr } from "./qr";
import { abbreviateDay, dayOfMonth, formatTimeParts, monthName, parseFlexible } from "./dates";
import { editorDims } from "./dims";
import { ensureFreshOutput } from "./plugins/runner";
import { getMedia } from "./media";

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
  // Layout is authored in the editor's visual frame: when the device is
  // mounted with a 90°/270° rotation, the user designs at the swapped
  // dimensions. We draw the canvas at the editor frame, then rotate the
  // pixels so the device buffer matches the stored native width/height.
  const { w: editW, h: editH } = editorDims(device);
  const canvas = createCanvas(editW, editH);
  const ctx = canvas.getContext("2d") as SKRSContext2D;
  // @ts-ignore
  ctx.imageSmoothingEnabled = false;
  // @ts-ignore
  ctx.antialias = "none";

  const defaultBg = device.background ?? "black";
  ctx.fillStyle = defaultBg === "black" ? "#000000" : "#ffffff";
  ctx.fillRect(0, 0, editW, editH);

  for (const block of device.layout) {
    await drawBlock(ctx, block, assetMap, { defaultBg });
  }

  const rgba = ctx.getImageData(0, 0, editW, editH).data;
  const pixels1 = rgbaTo1Bit(rgba, editW, editH, {
    mode: opts.dither ? "dither" : "threshold",
    threshold: opts.threshold ?? 160,
  });

  let outW = editW;
  let outH = editH;
  let outPixels = pixels1;
  let outRgba: Uint8ClampedArray = rgba;
  if (device.rotation) {
    const r = rotatePixels(pixels1, editW, editH, device.rotation);
    outPixels = r.pixels;
    outW = r.width;
    outH = r.height;
    const rr = rotateRgba(rgba, editW, editH, device.rotation);
    outRgba = rr.rgba;
  }

  const bmp = device.bitDepth === 24
    ? encodeBmp24bit(outW, outH, outRgba)
    : encodeBmp1bit(outW, outH, outPixels);
  return { pixels1: outPixels, rgba: outRgba, width: outW, height: outH, bmp };
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
    case "plugin":
      await drawPluginBlock(ctx, block);
      return;
  }
}

// Plugin output is a PNG cached in the media collection. We make sure it's
// fresh (subject to the instance's TTL) and then draw it at the block's
// position and size — same compositing path as drawImage.
async function drawPluginBlock(ctx: SKRSContext2D, block: Block) {
  if (!block.pluginInstanceId) return;
  try {
    const inst = await ensureFreshOutput(block.pluginInstanceId);
    const mediaId = inst?.latestMediaId;
    if (!mediaId) return;
    const m = await getMedia(mediaId);
    if (!m?.dataUrl) return;
    const img = await loadImage(m.dataUrl);
    // @ts-ignore
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, block.x, block.y, block.w, block.h);
  } catch (e) {
    console.error("plugin block render failed", block.pluginInstanceId, e);
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
  //
  // Additionally, mediaId points at a MediaItem and wins over imageData
  // when both are present. Existing data-URL blocks keep working.
  let src = block.imageData;
  if (block.mediaId) {
    const m = await getMedia(block.mediaId);
    if (m?.dataUrl) src = m.dataUrl;
  }
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
  const family = block.fontFamily ?? "mono";
  const baseBold = !!block.bold;
  const baseItalic = !!block.italic;
  ctx.fillStyle = fg;
  ctx.textBaseline = "top";

  const lineHeight = Math.ceil(size * (block.lineHeight ?? 1.15));

  const raw = applyVars(block.text, dctx);

  // Rich path: parse **bold** / *italic* inline runs, word-wrap them, then
  // draw each run with its own font. Plain path keeps the legacy fast path.
  if (block.rich) {
    const lines = layoutRichLines(ctx, raw, w, family, size, baseBold, baseItalic);
    const totalH = lines.length === 0 ? 0 : (lines.length - 1) * lineHeight + size;
    let startY = y;
    if (block.vAlign === "middle") startY = y + Math.max(0, Math.floor((h - totalH) / 2));
    if (block.vAlign === "bottom") startY = y + Math.max(0, h - totalH);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let lineW = 0;
      for (const r of line) {
        ctx.font = fontString(family, size, r.bold, r.italic);
        lineW += ctx.measureText(r.text).width;
      }
      let lx = x;
      if (block.align === "center") lx = x + Math.max(0, Math.floor((w - lineW) / 2));
      if (block.align === "right")  lx = x + Math.max(0, w - Math.ceil(lineW));
      const yy = startY + i * lineHeight;
      let cx = lx;
      for (const r of line) {
        ctx.font = fontString(family, size, r.bold, r.italic);
        ctx.fillText(r.text, cx, yy);
        cx += ctx.measureText(r.text).width;
      }
    }
    return;
  }

  ctx.font = fontString(family, size, baseBold, baseItalic);
  const lines = wrapText(ctx, raw, w);
  // The visible text occupies (N-1) line-heights of leading plus one font
  // size worth of glyph height — using `lines.length * lineHeight` left a
  // trailing leading band, which made vAlign=bottom look short and
  // vAlign=middle drift upward.
  const totalH = lines.length === 0 ? 0 : (lines.length - 1) * lineHeight + size;
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

// Rich-text inline parser. Recognises **bold**, *italic*, and the
// combined ***bold italic***. Asterisks not part of a recognised pair are
// kept as literal characters.
type RichRun = { text: string; bold: boolean; italic: boolean };
function parseRich(s: string, baseBold: boolean, baseItalic: boolean): RichRun[] {
  const out: RichRun[] = [];
  let bold = baseBold;
  let italic = baseItalic;
  let buf = "";
  const push = () => { if (buf) { out.push({ text: buf, bold, italic }); buf = ""; } };
  let i = 0;
  while (i < s.length) {
    if (s.startsWith("***", i)) { push(); bold = !bold; italic = !italic; i += 3; continue; }
    if (s.startsWith("**", i))  { push(); bold = !bold;            i += 2; continue; }
    if (s[i] === "*")           { push(); italic = !italic;         i += 1; continue; }
    buf += s[i++];
  }
  push();
  return out;
}

// Tokenise rich runs into per-line lists, word-wrapping at maxWidth.
// Each output line is an array of runs that, concatenated, make up that line.
function layoutRichLines(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  family: FontFamily,
  size: number,
  baseBold: boolean,
  baseItalic: boolean,
): RichRun[][] {
  const lines: RichRun[][] = [];
  const paragraphs = text.split(/\r?\n/);
  for (const para of paragraphs) {
    const runs = parseRich(para, baseBold, baseItalic);
    // Flatten into atomic tokens (words + spaces) preserving the format
    // of each segment, so we can word-wrap one word at a time.
    type Atom = RichRun & { isSpace: boolean };
    const atoms: Atom[] = [];
    for (const r of runs) {
      const parts = r.text.split(/(\s+)/);
      for (const p of parts) {
        if (!p) continue;
        atoms.push({ text: p, bold: r.bold, italic: r.italic, isSpace: /^\s+$/.test(p) });
      }
    }
    let line: RichRun[] = [];
    let lineW = 0;
    for (const a of atoms) {
      ctx.font = fontString(family, size, a.bold, a.italic);
      const w = ctx.measureText(a.text).width;
      if (a.isSpace) {
        // Drop spaces at line start; otherwise extend the line.
        if (line.length === 0) continue;
        line.push({ text: a.text, bold: a.bold, italic: a.italic });
        lineW += w;
        continue;
      }
      if (line.length > 0 && lineW + w > maxWidth) {
        // Trim a trailing space-run before wrapping.
        while (line.length && /^\s+$/.test(line[line.length - 1].text)) line.pop();
        lines.push(line);
        line = [];
        lineW = 0;
      }
      line.push({ text: a.text, bold: a.bold, italic: a.italic });
      lineW += w;
    }
    if (line.length || paragraphs.length > 1) lines.push(line);
  }
  return lines;
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
  // renderQr paints its own quiet zone in the chosen polarity, so we don't
  // need to pre-fill the block — doing so would overwrite the inverted
  // (black-bg) QR's intended quiet zone.
  await renderQr(ctx, url, { x: block.x, y: block.y, w: block.w, h: block.h }, {
    margin: block.qrMargin ?? 0,
    errorLevel: block.qrErrorLevel ?? "L",
    style: block.qrStyle ?? "square",
    verticalShrink: block.qrVerticalShrink ?? 0.8,
    invert: block.qrInvert ?? true,
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
  ctx.fillStyle = block.lineColor === "white" ? "#ffffff"
                : block.lineColor === "black" ? "#000000"
                : fg;
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
