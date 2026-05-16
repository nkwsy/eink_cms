import QRCode from "qrcode";
import { SKRSContext2D } from "@napi-rs/canvas";

// We paint modules directly as filled rectangles at the target scale —
// no offscreen 1-module-per-pixel canvas + upscale, which used to leave
// modules looking smeared/striped after the 1-bit threshold pass.
//
// Two styles:
//   "square" — classic: every active module is a `modulePx × modulePx`
//              solid square.
//   "bars"   — port of python-qrcode's HorizontalSquareBarsDrawer:
//              each active module is a full-width × shrunken-height
//              bar, vertically centred. Consecutive active modules in a
//              row merge into a continuous band; rows are separated by
//              a vertical gap of `(1 - verticalShrink) * modulePx`.

export type QrStyle = "square" | "bars";

export async function renderQr(
  ctx: SKRSContext2D,
  text: string,
  rect: { x: number; y: number; w: number; h: number },
  opts: {
    margin?: number;
    errorLevel?: "L" | "M" | "Q" | "H";
    style?: QrStyle;
    verticalShrink?: number; // bars only; clamped to [0.1, 1]
    invert?: boolean;        // default true: black quiet zone, white modules
  } = {}
) {
  if (!text) return;

  const errorLevel = opts.errorLevel ?? "L";
  const margin = Math.max(0, opts.margin ?? 0);
  const style: QrStyle = opts.style ?? "square";
  const verticalShrink = Math.min(1, Math.max(0.1, opts.verticalShrink ?? 0.8));
  const invert = opts.invert ?? true;

  const qr = QRCode.create(text, { errorCorrectionLevel: errorLevel });
  const size = qr.modules.size;
  const data = qr.modules.data as Uint8Array | number[];

  // Round the module size down so every module is an equal integer number
  // of output pixels — that's what keeps the result crisp after the 1-bit
  // threshold downstream.
  const maxSide = Math.max(1, Math.min(rect.w, rect.h) - margin * 2);
  const modulePx = Math.max(1, Math.floor(maxSide / size));
  const side = modulePx * size;

  const dx = rect.x + rect.w - side - margin;
  const dy = rect.y + Math.floor((rect.h - side) / 2);

  const bgColor = invert ? "#000000" : "#ffffff";
  const fgColor = invert ? "#ffffff" : "#000000";

  // Quiet zone — matches the QR's own background colour so adjacent
  // surroundings don't create false edges for scanners.
  ctx.fillStyle = bgColor;
  ctx.fillRect(dx - margin, dy - margin, side + margin * 2, side + margin * 2);

  ctx.fillStyle = fgColor;

  // Finder patterns must stay solid: scanners locate them by the 1:1:3:1:1
  // ratio across both axes, which the bars style would otherwise destroy.
  // They occupy a 7×7 area at three corners.
  const isFinder = (x: number, y: number) =>
    (x < 7 && y < 7) ||
    (x >= size - 7 && y < 7) ||
    (x < 7 && y >= size - 7);

  if (style === "bars") {
    const barH = Math.max(1, Math.round(modulePx * verticalShrink));
    const barOffset = Math.floor((modulePx - barH) / 2);
    for (let y = 0; y < size; y++) {
      // Coalesce same-status (finder/non-finder) active runs and emit
      // one fillRect per run — full square for finder runs, vertically
      // shrunken bar for data runs.
      let runStart = -1;
      let runFinder = false;
      const flush = (endExcl: number) => {
        if (runStart < 0) return;
        if (runFinder) {
          ctx.fillRect(dx + runStart * modulePx, dy + y * modulePx, (endExcl - runStart) * modulePx, modulePx);
        } else {
          ctx.fillRect(dx + runStart * modulePx, dy + y * modulePx + barOffset, (endExcl - runStart) * modulePx, barH);
        }
        runStart = -1;
      };
      for (let x = 0; x <= size; x++) {
        const active = x < size && !!data[y * size + x];
        const fin = x < size && isFinder(x, y);
        if (runStart >= 0 && (!active || fin !== runFinder)) flush(x);
        if (active && runStart < 0) { runStart = x; runFinder = fin; }
      }
    }
    return;
  }

  // "square" style — also coalesce horizontal runs so we issue fewer fills.
  for (let y = 0; y < size; y++) {
    let runStart = -1;
    for (let x = 0; x <= size; x++) {
      const active = x < size && !!data[y * size + x];
      if (active && runStart < 0) runStart = x;
      if (!active && runStart >= 0) {
        ctx.fillRect(
          dx + runStart * modulePx,
          dy + y * modulePx,
          (x - runStart) * modulePx,
          modulePx
        );
        runStart = -1;
      }
    }
  }
}
