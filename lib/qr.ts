import QRCode from "qrcode";
import { createCanvas, SKRSContext2D } from "@napi-rs/canvas";

// Legacy behaviour: border=0 ("no quiet zone baked in"), nearest-neighbor
// scale to fill the target. We produce a 1-bit module grid then blit it
// with nearest-neighbor so the QR stays crisp on e-ink.
//
// Returns a canvas the caller can drawImage into target block.

export async function renderQr(
  ctx: SKRSContext2D,
  text: string,
  rect: { x: number; y: number; w: number; h: number },
  opts: { margin?: number; errorLevel?: "L" | "M" | "Q" | "H" } = {}
) {
  if (!text) return;

  const errorLevel = opts.errorLevel ?? "L";
  const margin = Math.max(0, opts.margin ?? 0);
  // Produce the module grid.
  const qr = QRCode.create(text, { errorCorrectionLevel: errorLevel });
  const size = qr.modules.size;
  const data = qr.modules.data as Uint8Array | number[];

  // Draw base at 1 module/px to an offscreen, then nearest-neighbor scale
  // into the target rect.
  const off = createCanvas(size, size);
  const octx = off.getContext("2d");
  // @ts-ignore
  octx.imageSmoothingEnabled = false;
  const img = octx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = data[i] ? 0 : 255; // 1 = dark module
    const p = i * 4;
    img.data[p] = v; img.data[p + 1] = v; img.data[p + 2] = v; img.data[p + 3] = 255;
  }
  octx.putImageData(img, 0, 0);

  // Figure out the side length: square, min of (w, h), minus margin*2, then
  // rounded down to a multiple of the module count so every module is an
  // equal integer number of output pixels (perfectly crisp).
  const maxSide = Math.max(1, Math.min(rect.w, rect.h) - margin * 2);
  const modulePx = Math.max(1, Math.floor(maxSide / size));
  const side = modulePx * size;

  // Right-align + vertically center — this matches the legacy layout where
  // the QR sits on the right edge of the event box.
  const dx = rect.x + rect.w - side - margin;
  const dy = rect.y + Math.floor((rect.h - side) / 2);

  // White quiet zone (background) behind QR so invert/overlays don't clobber it.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(dx - margin, dy - margin, side + margin * 2, side + margin * 2);

  // @ts-ignore
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, dx, dy, side, side);
}
