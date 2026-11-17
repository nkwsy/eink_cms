// Calibration screen: a test chart to show on a real panel. It answers the
// questions the hardware documents do not: does the panel show real greys,
// how thin a line survives, which text weight reads best, and which picture
// treatment looks best.
//
// Unlike a normal screen it deliberately contains real grey values (the grey
// patches, the "Soft" text column and the "Grey" pictures), because seeing
// what the panel does with them is the point.
import path from "node:path";
import fs from "node:fs/promises";
import { createCanvas, loadImage, Canvas, SKRSContext2D } from "@napi-rs/canvas";
import { editorDims } from "./dims";
import { ensureFontsRegistered, fontString } from "./fonts";
import { fillRect, FramePainter, GrayFrame, newFrame, rotateFrame, strokeRectInside } from "./frame";
import { bayerCutoff, quantize, ResolvedImageMode } from "./tone";
import { qrModuleCount, renderQr } from "./qr";

const CELL = 960;
// Margin inside each panel, and the width left for its content.
const PAD = 24;
const CONTENT = CELL - PAD * 2;
const WHITE = 255;
const BLACK = 0;
export const TEXT_WEIGHTS = [
  { label: "Light", cutoff: 160 },
  { label: "Normal", cutoff: 128 },
  { label: "Heavy", cutoff: 96 },
] as const;

export type CalibrationDevice = {
  name: string;
  slug: string;
  width: number;
  height: number;
  rotation?: number | null;
};

type TextOpts = {
  family?: string;
  bold?: boolean;
  // "soft" keeps the antialiased grey edge; a number inks pixels covered at
  // least that much.
  cutoff?: number | "soft";
  value?: number;
  align?: "left" | "center" | "right";
};

class Chart {
  private scratch: Canvas = createCanvas(1600, 260);
  private sctx = this.scratch.getContext("2d") as SKRSContext2D;
  constructor(public frame: GrayFrame) {}

  text(str: string, x: number, y: number, size: number, opts: TextOpts = {}): number {
    const { sctx, scratch, frame } = this;
    const cutoff = opts.cutoff ?? 128;
    const value = opts.value ?? WHITE;
    sctx.clearRect(0, 0, scratch.width, scratch.height);
    sctx.font = fontString(opts.family ?? "houschka", size, !!opts.bold, false);
    sctx.textBaseline = "top";
    sctx.textAlign = "left";
    sctx.fillStyle = "#ffffff";
    const w = Math.ceil(sctx.measureText(str).width);
    const pad = Math.ceil(size * 0.4);
    const bw = Math.min(scratch.width, w + pad * 2);
    const bh = Math.min(scratch.height, Math.ceil(size * 1.9));
    sctx.fillText(str, pad, pad);
    const px = sctx.getImageData(0, 0, bw, bh).data;
    let left = x;
    if (opts.align === "center") left = x - w / 2;
    if (opts.align === "right") left = x - w;
    const dx = Math.round(left) - pad;
    const dy = Math.round(y) - pad;
    for (let yy = 0; yy < bh; yy++) {
      const fy = dy + yy;
      if (fy < 0 || fy >= frame.height) continue;
      for (let xx = 0; xx < bw; xx++) {
        const fx = dx + xx;
        if (fx < 0 || fx >= frame.width) continue;
        const a = px[(yy * bw + xx) * 4 + 3];
        if (a === 0) continue;
        const o = fy * frame.width + fx;
        if (cutoff === "soft") {
          const under = frame.data[o];
          frame.data[o] = Math.round(under + ((value - under) * a) / 255);
        } else if (a >= cutoff) {
          frame.data[o] = value;
        }
      }
    }
    return w;
  }

  rect(x: number, y: number, w: number, h: number, value: number) {
    fillRect(this.frame, { x, y, w, h }, value);
  }

  /** Copies a tile of grey values onto the frame. */
  tile(x: number, y: number, w: number, h: number, data: Uint8Array) {
    const { frame } = this;
    for (let yy = 0; yy < h; yy++) {
      const fy = y + yy;
      if (fy < 0 || fy >= frame.height) continue;
      for (let xx = 0; xx < w; xx++) {
        const fx = x + xx;
        if (fx < 0 || fx >= frame.width) continue;
        frame.data[fy * frame.width + fx] = data[yy * w + xx];
      }
    }
  }

  title(ox: number, oy: number, str: string, caption: string[]) {
    this.text(str, ox, oy + 4, 44, { family: "houschka-bold" });
    this.rect(ox, oy + 62, CONTENT, 3, WHITE);
    caption.forEach((line, i) => this.text(line, ox, oy + 74 + i * 26, 20));
  }
}

/** Draws the calibration chart in the device's native orientation. */
export async function renderCalibration(device: CalibrationDevice, now = new Date()): Promise<GrayFrame> {
  ensureFontsRegistered();
  const { w: W, h: H } = editorDims(device);
  const frame = newFrame(W, H, BLACK);
  const chart = new Chart(frame);

  // Four square panels along the long side: side by side on a landscape
  // screen, stacked on a portrait one.
  const landscape = W >= H;
  const long = landscape ? W : H;
  const short = landscape ? H : W;
  const count = Math.max(1, Math.min(4, Math.floor(long / CELL)));
  const cellLong = Math.floor(long / count);
  const offLong = Math.max(0, Math.floor((cellLong - CELL) / 2));
  const offShort = Math.max(0, Math.floor((short - CELL) / 2));
  const panels = [panelGreys, panelLines, panelText, panelPictures];
  for (let i = 0; i < count; i++) {
    const ox = (landscape ? i * cellLong + offLong : offShort) + PAD;
    const oy = landscape ? offShort : i * cellLong + offLong;
    await panels[i](chart, ox, oy, device, now);
  }

  // Edge check: a 1-pixel line on all four edges, and a mark in each corner.
  strokeRectInside(frame, { x: 0, y: 0, w: W, h: H }, 1, WHITE);
  chart.text("TL", 10, 8, 22, { family: "houschka-bold" });
  chart.text("TR", W - 10, 8, 22, { family: "houschka-bold", align: "right" });
  chart.text("BL", 10, H - 34, 22, { family: "houschka-bold" });
  chart.text("BR", W - 10, H - 34, 22, { family: "houschka-bold", align: "right" });

  return device.rotation ? rotateFrame(frame, device.rotation) : frame;
}

type Panel = (c: Chart, ox: number, oy: number, device: CalibrationDevice, now: Date) => void | Promise<void>;

// ---- 1: greys ----
const panelGreys: Panel = (c, ox, oy, device, now) => {
  c.title(ox, oy, "1  GREYS", [
    "Top rows: 16 real grey levels, 0 = black, 15 = white.",
    "How many different shades can you tell apart?",
  ]);
  const pw = 104, ph = 90, gap = 10;
  const patch = (level: number, x: number, y: number, dots: boolean) => {
    const v = Math.round((level * 255) / 15);
    if (dots) {
      for (let yy = 0; yy < ph; yy++) {
        for (let xx = 0; xx < pw; xx++) {
          const fx = x + xx, fy = y + yy;
          if (fx < 0 || fy < 0 || fx >= c.frame.width || fy >= c.frame.height) continue;
          c.frame.data[fy * c.frame.width + fx] = v > bayerCutoff(fx, fy) ? WHITE : BLACK;
        }
      }
    } else {
      c.rect(x, y, pw, ph, v);
    }
    strokeRectInside(c.frame, { x: x - 2, y: y - 2, w: pw + 4, h: ph + 4 }, 1, WHITE);
    c.text(String(level), x + pw / 2, y + ph + 6, 20, { align: "center" });
  };
  for (let i = 0; i < 16; i++) {
    const x = ox + 2 + (i % 8) * (pw + gap);
    patch(i, x, oy + 140 + Math.floor(i / 8) * 130, false);
  }
  // Smooth ramp.
  const rw = 8 * pw + 7 * gap;
  for (let xx = 0; xx < rw; xx++) {
    c.rect(ox + 2 + xx, oy + 410, 1, 46, Math.round((xx * 255) / (rw - 1)));
  }
  c.text("Smooth ramp from black to white", ox, oy + 462, 20);

  c.text("Bottom rows: the same 16 levels as dot patterns (pure black and white).", ox, oy + 506, 20);
  for (let i = 0; i < 16; i++) {
    const x = ox + 2 + (i % 8) * (pw + gap);
    patch(i, x, oy + 546 + Math.floor(i / 8) * 130, true);
  }

  const rot = device.rotation ? `, mounted at ${device.rotation}°` : "";
  c.text(`${device.name}  ·  /${device.slug}`, ox, oy + 824, 26, { family: "houschka-bold" });
  c.text(`${device.width} × ${device.height} pixels${rot}`, ox, oy + 860, 22);
  c.text(`Calibration chart drawn ${now.toISOString().slice(0, 16).replace("T", " ")} UTC`, ox, oy + 890, 22);
};

// ---- 2: lines and QR ----
const panelLines: Panel = async (c, ox, oy) => {
  c.title(ox, oy, "2  LINES AND QR", [
    "Each group is four lines with equal gaps; the number is the thickness in pixels.",
    "Which is the thinnest group that looks solid and even?",
  ]);
  const weights = [1, 2, 3, 4, 6, 8];
  const groups = (y: number, value: number) => {
    weights.forEach((t, i) => {
      const hx = ox + 10 + i * 72;
      for (let k = 0; k < 4; k++) c.rect(hx, y + k * t * 2, 60, t, value);
      const vx = ox + 460 + i * 72;
      for (let k = 0; k < 4; k++) c.rect(vx + k * t * 2, y, t, 56, value);
    });
  };
  const labels = (y: number) => {
    weights.forEach((t, i) => {
      c.text(String(t), ox + 40 + i * 72, y, 18, { align: "center" });
      c.text(String(t), ox + 460 + i * 72 + t * 3.5, y, 18, { align: "center" });
    });
  };
  c.text("White on black", ox, oy + 136, 20, { family: "houschka-bold" });
  groups(oy + 170, WHITE);
  labels(oy + 234);

  c.text("Black on white", ox, oy + 270, 20, { family: "houschka-bold" });
  c.rect(ox, oy + 300, CONTENT, 76, WHITE);
  groups(oy + 310, BLACK);
  labels(oy + 382);

  c.text("Fine patterns: each should look like an even grey, not blotchy", ox, oy + 422, 20, { family: "houschka-bold" });
  const fine: Array<[string, (x: number, y: number) => boolean]> = [
    ["1 px checks", (x, y) => ((x + y) & 1) === 0],
    ["2 px checks", (x, y) => (((x >> 1) + (y >> 1)) & 1) === 0],
    ["4 px checks", (x, y) => (((x >> 2) + (y >> 2)) & 1) === 0],
    ["1 px rows", (_x, y) => (y & 1) === 0],
    ["1 px columns", (x) => (x & 1) === 0],
  ];
  fine.forEach(([label, on], i) => {
    const x0 = ox + 10 + i * 180, y0 = oy + 456;
    for (let yy = 0; yy < 110; yy++) {
      for (let xx = 0; xx < 150; xx++) {
        if (on(xx, yy)) c.rect(x0 + xx, y0 + yy, 1, 1, WHITE);
      }
    }
    c.text(label, x0, y0 + 116, 18);
  });

  c.text("QR codes: scan each one with a phone", ox, oy + 606, 20, { family: "houschka-bold" });
  const url = "https://www.urbanrivers.org";
  const modules = qrModuleCount(url, "M") + 8;
  const codes: Array<["bars" | "square", number]> = [["bars", 4], ["bars", 6], ["square", 4], ["square", 6]];
  let x = ox + 10;
  for (const [style, px] of codes) {
    const side = modules * px;
    await renderQr(new FramePainter(c.frame), url, { x, y: oy + 640, w: side, h: side }, {
      quietModules: 4, errorLevel: "M", style, invert: true,
    });
    c.text(`${style}, ${px} px`, x + 4 * px, oy + 640 + side + 4, 18);
    x += side + 36;
  }
};

// ---- 3: text ----
const panelText: Panel = (c, ox, oy) => {
  c.title(ox, oy, "3  TEXT", [
    "Soft is how screens are sent today (grey edges). The other three are pure black and white.",
    "Which column is easiest to read at the small sizes?",
  ]);
  const cols: Array<{ label: string; cutoff: number | "soft" }> = [
    { label: "Soft", cutoff: "soft" },
    ...TEXT_WEIGHTS,
  ];
  const colX = (k: number) => ox + 60 + k * 213;
  const sample = (size: number) => (size >= 40 ? "River" : size >= 30 ? "Wild Mile" : "Wild Mile 0123");
  const block = (y: number, sizes: number[], family: string, value: number) => {
    for (const size of sizes) {
      c.text(String(size), ox + 4, y + Math.max(0, (size - 18) / 2), 18, { value });
      cols.forEach((col, k) => c.text(sample(size), colX(k), y, size, { family, cutoff: col.cutoff, value }));
      y += Math.round(size * 1.45) + 6;
    }
    return y;
  };
  cols.forEach((col, k) => c.text(col.label, colX(k), oy + 136, 22, { family: "houschka-bold" }));
  let y = block(oy + 174, [14, 18, 24, 32, 44, 60], "houschka", WHITE);

  c.text("Bold face", ox, y + 8, 20, { family: "houschka-bold" });
  y = block(y + 40, [18, 24, 32], "houschka-bold", WHITE);

  c.text("Black on white", ox, y + 8, 20, { family: "houschka-bold" });
  c.rect(ox, y + 40, CONTENT, 150, WHITE);
  block(y + 50, [18, 24, 32], "houschka", BLACK);
};

// ---- 4: pictures ----
const panelPictures: Panel = async (c, ox, oy) => {
  c.title(ox, oy, "4  PICTURES", [
    "Grey is sent as real greys. Sharp, Dots and Dither are pure black and white.",
    "Which treatment looks best for shading, and which for the drawing?",
  ]);
  const S = 220;
  const treatments: Array<{ label: string; mode: ResolvedImageMode | "grey" }> = [
    { label: "Grey", mode: "grey" },
    { label: "Sharp", mode: "sharp" },
    { label: "Dots", mode: "dots" },
    { label: "Dither", mode: "dither" },
  ];
  treatments.forEach((t, k) => c.text(t.label, ox + 2 + k * 229, oy + 136, 22, { family: "houschka-bold" }));
  const row = (y: number, gray: Uint8Array) => {
    treatments.forEach((t, k) => {
      const x = ox + 2 + k * 229;
      const data = t.mode === "grey" ? gray : quantize(gray, S, S, t.mode, { originX: x, originY: y });
      c.tile(x, y, S, S, data);
      strokeRectInside(c.frame, { x: x - 2, y: y - 2, w: S + 4, h: S + 4 }, 1, WHITE);
    });
  };
  row(oy + 174, shadedBall(S));
  const sample = await samplePicture(S);
  if (sample) row(oy + 416, sample);
  else c.text("(no sample picture found)", ox + 4, oy + 500, 20);

  c.text("Edges", ox, oy + 680, 20, { family: "houschka-bold" });
  c.text("A white line runs along all four edges of the screen, with TL, TR, BL and BR", ox, oy + 710, 20);
  c.text("in the corners. Check every edge is visible and the corners are where you expect.", ox, oy + 736, 20);
  // Arrow pointing to the top of the screen as it is mounted.
  for (let i = 0; i < 50; i++) c.rect(ox + 60 - i, oy + 790 + i, i * 2 + 1, 1, WHITE);
  c.rect(ox + 48, oy + 840, 25, 50, WHITE);
  c.text("This arrow should point up", ox + 130, oy + 824, 26, { family: "houschka-bold" });
};

// A lit ball on a graded background with a ramp underneath: smooth tones with
// no fine detail, so differences between treatments are easy to see.
function shadedBall(S: number): Uint8Array {
  const out = new Uint8Array(S * S);
  const cx = S / 2, cy = S * 0.42, r = S * 0.33;
  const lx = -0.5, ly = -0.6, lz = 0.62;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 30 + (y / S) * 70;
      const dx = (x - cx) / r, dy = (y - cy) / r;
      const d2 = dx * dx + dy * dy;
      if (d2 <= 1) {
        const dz = Math.sqrt(1 - d2);
        v = 25 + 230 * Math.max(0, dx * lx + dy * ly + dz * lz);
      }
      if (y >= S - 34) v = (x / (S - 1)) * 255;
      out[y * S + x] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return out;
}

// A drawing from the repo's own artwork, cropped square and scaled.
async function samplePicture(S: number): Promise<Uint8Array | null> {
  try {
    const file = path.join(process.cwd(), "public", "images", "32Eink_info_hummingbird.jpg");
    const img = await loadImage(await fs.readFile(file));
    const side = Math.min(img.width, img.height);
    const canvas = createCanvas(S, S);
    const ctx = canvas.getContext("2d") as SKRSContext2D;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
    const px = ctx.getImageData(0, 0, S, S).data;
    const out = new Uint8Array(S * S);
    for (let i = 0, p = 0; i < out.length; i++, p += 4) {
      out[i] = Math.round((px[p] * 299 + px[p + 1] * 587 + px[p + 2] * 114) / 1000);
    }
    return out;
  } catch {
    return null;
  }
}
