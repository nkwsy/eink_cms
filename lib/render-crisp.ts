// Crisp renderer: every pixel of the result is pure black or pure white.
//
// The old renderer draws everything antialiased onto one canvas and, for
// 24-bit panels, ships the soft grey edges as they are. The panel then makes
// its own black/white decision per pixel, which is what erodes small text.
//
// Here each block is converted on its own, with the rule that suits it:
//   - text and dates: drawn alone, then a pixel is inked when the glyph covers
//     at least `inkCutoff` of it — one consistent rule for every letter;
//   - lines, shapes, borders, QR codes: written as whole-pixel rectangles;
//   - pictures and plugin output: resampled to the block's size, then cut
//     sharply, dot-patterned or dithered (see lib/tone.ts).
import { createCanvas, Canvas, Image, SKRSContext2D } from "@napi-rs/canvas";
import type { AssetDoc, Block, DeviceDoc } from "./mongo";
import { ensureFontsRegistered } from "./fonts";
import { editorDims } from "./dims";
import { renderQr } from "./qr";
import { applyVars, drawDate, drawText, DrawCtx, InkBounds, loadBlockImage, loadPluginImage } from "./render";
import {
  fillRect, FramePainter, frameRect, GrayFrame, intersect, newFrame, Rect, rotateFrame, roundRect, strokeRectInside,
} from "./frame";
import { ImageMode, pickImageMode, quantize } from "./tone";

export const CRISP_RENDERER = "crisp-1";
export const DEFAULT_INK_CUTOFF = 128;
const MAX_ASSET_DEPTH = 6;

export type CrispDevice = Pick<DeviceDoc, "width" | "height" | "rotation" | "background" | "inkCutoff">;

type State = {
  frame: GrayFrame;
  scratch: Canvas;
  sctx: SKRSContext2D;
  cutoff: number;
  assetMap: Map<string, AssetDoc>;
};

// Placement of an asset's inner blocks: offset plus scale.
type Xf = { ox: number; oy: number; sx: number; sy: number };
const IDENTITY: Xf = { ox: 0, oy: 0, sx: 1, sy: 1 };

/**
 * Draws a layout in the device's native orientation. The returned frame holds
 * only 0 and 255.
 */
export async function renderLayoutCrisp(
  device: CrispDevice,
  layout: Block[],
  assetMap: Map<string, AssetDoc>
): Promise<GrayFrame> {
  ensureFontsRegistered();
  const { w, h } = editorDims(device);
  const defaultBg = device.background ?? "black";
  const frame = newFrame(w, h, defaultBg === "black" ? 0 : 255);
  const scratch = createCanvas(w, h);
  const st: State = {
    frame,
    scratch,
    sctx: scratch.getContext("2d") as SKRSContext2D,
    cutoff: clampCutoff(device.inkCutoff),
    assetMap,
  };
  await drawBlocks(st, layout, { defaultBg }, IDENTITY, frameRect(frame), 0);
  return device.rotation ? rotateFrame(frame, device.rotation) : frame;
}

export function clampCutoff(v: number | undefined | null): number {
  if (v == null || !Number.isFinite(v)) return DEFAULT_INK_CUTOFF;
  return Math.min(250, Math.max(8, Math.round(v)));
}

async function drawBlocks(st: State, blocks: Block[], dctx: DrawCtx, xf: Xf, clip: Rect, depth: number) {
  for (const b of blocks) {
    await drawBlock(st, place(b, xf), dctx, clip, depth);
  }
}

// Moves and scales a block that lives inside an asset. At scale 1 (an asset
// placed at its own size) this only offsets it.
function place(b: Block, xf: Xf): Block {
  if (xf === IDENTITY) return b;
  const x0 = Math.round(xf.ox + b.x * xf.sx);
  const y0 = Math.round(xf.oy + b.y * xf.sy);
  const x1 = Math.round(xf.ox + (b.x + b.w) * xf.sx);
  const y1 = Math.round(xf.oy + (b.y + b.h) * xf.sy);
  const out: Block = { ...b, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  if (xf.sx === 1 && xf.sy === 1) return out;
  const s = Math.min(xf.sx, xf.sy);
  if (b.type === "text" || (b.type === "date" && b.dateLayout === "row")) {
    out.fontSize = Math.max(4, Math.round((b.fontSize ?? 16) * s));
    out.padding = Math.round((b.padding ?? 4) * s);
  } else if (b.fontSize != null) {
    out.fontSize = Math.max(4, Math.round(b.fontSize * s));
  }
  if (b.lineThickness != null) out.lineThickness = Math.max(1, Math.round(b.lineThickness * s));
  if (b.qrMargin != null) out.qrMargin = Math.round(b.qrMargin * s);
  return out;
}

async function drawBlock(st: State, block: Block, dctx: DrawCtx, clip: Rect, depth: number) {
  const rect: Rect = { x: block.x, y: block.y, w: block.w, h: block.h };
  // Same colour rules as the old renderer's drawBlock.
  const effectiveBg = block.background ?? dctx.defaultBg ?? (block.invert ? "black" : "white");
  const bgV = effectiveBg === "black" ? 0 : 255;
  const fgV = 255 - bgV;
  if (block.background || block.invert) fillRect(st.frame, rect, bgV, clip);
  if (block.border) strokeRectInside(st.frame, rect, 1, fgV, clip);

  switch (block.type) {
    case "asset":
      await drawAsset(st, block, dctx, clip, depth);
      return;
    case "image": {
      const img = await loadBlockImage(block, dctx);
      if (img) drawPicture(st, img, rect, block.imageMode ?? "auto", clip);
      return;
    }
    case "plugin": {
      const img = await loadPluginImage(block);
      // Plugin output is text and graphics, so cut it sharply unless told otherwise.
      if (img) drawPicture(st, img, rect, block.imageMode ?? "sharp", clip);
      return;
    }
    case "text":
      drawInk(st, clip, fgV, dctx, (ctx, d) => drawText(ctx, block, "#ffffff", d));
      return;
    case "date":
      drawInk(st, clip, fgV, dctx, (ctx, d) => drawDate(ctx, block, "#ffffff", d));
      return;
    case "qr": {
      const url = applyVars(block.qrUrl ?? block.text ?? "", dctx);
      if (!url) return;
      await renderQr(new FramePainter(st.frame, clip), url, roundRect(rect), {
        margin: block.qrMargin ?? 0,
        quietModules: block.qrQuiet,
        errorLevel: block.qrErrorLevel ?? "L",
        style: block.qrStyle ?? "square",
        verticalShrink: block.qrVerticalShrink ?? 0.8,
        invert: block.qrInvert ?? true,
      });
      return;
    }
    case "line": {
      const t = Math.max(1, Math.round(block.lineThickness ?? 1));
      const v = block.lineColor === "white" ? 255 : block.lineColor === "black" ? 0 : fgV;
      const r = roundRect(rect);
      if (block.lineDirection === "vertical") {
        fillRect(st.frame, { x: r.x + Math.floor((r.w - t) / 2), y: r.y, w: t, h: r.h }, v, clip);
      } else {
        fillRect(st.frame, { x: r.x, y: r.y + Math.floor((r.h - t) / 2), w: r.w, h: t }, v, clip);
      }
      return;
    }
    case "shape":
      if (block.shapeKind === "outlined") {
        strokeRectInside(st.frame, rect, Math.max(1, block.lineThickness ?? 1), fgV, clip);
      } else {
        fillRect(st.frame, rect, fgV, clip);
      }
      return;
  }
}

async function drawAsset(st: State, block: Block, parent: DrawCtx, clip: Rect, depth: number) {
  if (!block.assetId || depth >= MAX_ASSET_DEPTH) return;
  const asset = st.assetMap.get(block.assetId);
  if (!asset || asset.width <= 0 || asset.height <= 0) return;

  const bindings: Record<string, string> = {};
  for (const v of asset.variables ?? []) {
    if (v.default != null) bindings[v.key] = v.default;
  }
  if (block.variableBindings) Object.assign(bindings, block.variableBindings);
  const imageBindings = { ...(block.imageBindings ?? {}) };
  const innerBg = block.background ?? asset.background ?? parent.defaultBg ?? "white";

  const rect = roundRect({ x: block.x, y: block.y, w: block.w, h: block.h });
  const inner = intersect(rect, clip);
  if (!inner) return;
  fillRect(st.frame, rect, innerBg === "black" ? 0 : 255, clip);
  const xf: Xf = { ox: rect.x, oy: rect.y, sx: rect.w / asset.width, sy: rect.h / asset.height };
  await drawBlocks(st, asset.layout, { bindings, imageBindings, defaultBg: innerBg }, xf, inner, depth + 1);
}

// Draws text on its own, then inks every pixel the glyphs cover enough of.
function drawInk(
  st: State,
  clip: Rect,
  value: number,
  dctx: DrawCtx,
  draw: (ctx: SKRSContext2D, dctx: DrawCtx) => void
) {
  const { sctx, frame } = st;
  const ink = new InkBounds();
  sctx.clearRect(0, 0, frame.width, frame.height);
  sctx.textAlign = "left";
  sctx.textBaseline = "top";
  draw(sctx, { ...dctx, ink });
  const bounds = ink.rect();
  const r = bounds && intersect(bounds, clip);
  if (!r) return;
  const px = sctx.getImageData(r.x, r.y, r.w, r.h).data;
  for (let y = 0; y < r.h; y++) {
    let o = (r.y + y) * frame.width + r.x;
    let a = y * r.w * 4 + 3;
    for (let x = 0; x < r.w; x++, o++, a += 4) {
      if (px[a] >= st.cutoff) frame.data[o] = value;
    }
  }
}

// Resamples a picture to the block, flattens it onto what is already there,
// then converts it to black and white.
function drawPicture(st: State, img: Image, rectIn: Rect, mode: ImageMode, clip: Rect) {
  const rect = roundRect(rectIn);
  if (rect.w < 1 || rect.h < 1) return;
  const visible = intersect(rect, clip);
  if (!visible) return;

  const c = createCanvas(rect.w, rect.h);
  const cctx = c.getContext("2d") as SKRSContext2D;
  cctx.imageSmoothingEnabled = true;
  cctx.imageSmoothingQuality = "high";
  cctx.drawImage(img, 0, 0, rect.w, rect.h);
  const px = cctx.getImageData(0, 0, rect.w, rect.h).data;

  const n = rect.w * rect.h;
  const gray = new Uint8Array(n);
  const alpha = new Uint8Array(n);
  const { frame } = st;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const a = px[p + 3];
    alpha[i] = a;
    if (a === 0) continue;
    let g = (px[p] * 299 + px[p + 1] * 587 + px[p + 2] * 114) / 1000;
    if (a < 255) {
      // Blend soft edges of a transparent picture with what is underneath.
      const fx = rect.x + (i % rect.w);
      const fy = rect.y + Math.floor(i / rect.w);
      const under = fx >= 0 && fy >= 0 && fx < frame.width && fy < frame.height
        ? frame.data[fy * frame.width + fx]
        : 0;
      g = (g * a + under * (255 - a)) / 255;
    }
    gray[i] = Math.round(g);
  }

  const resolved = mode === "auto" ? pickImageMode(gray, alpha) : mode;
  const bw = quantize(gray, rect.w, rect.h, resolved, { alpha, originX: rect.x, originY: rect.y });

  for (let y = visible.y; y < visible.y + visible.h; y++) {
    for (let x = visible.x; x < visible.x + visible.w; x++) {
      const i = (y - rect.y) * rect.w + (x - rect.x);
      if (alpha[i] === 0) continue;
      frame.data[y * frame.width + x] = bw[i];
    }
  }
}
