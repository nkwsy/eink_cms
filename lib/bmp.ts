// 1-bit monochrome BMP encoder.
// Input: width, height, and a Uint8Array of length width*height of {0,1} (1 = white, 0 = black).
// This matches the Windows BITMAPINFOHEADER 1bpp format that most eink boards happily read.

export function encodeBmp1bit(width: number, height: number, pixels: Uint8Array): Buffer {
  if (pixels.length !== width * height) {
    throw new Error(`pixel buffer length ${pixels.length} != ${width}*${height}`);
  }

  // Each row in BMP is padded to a multiple of 4 bytes.
  const rowBytes = Math.ceil(width / 8);
  const rowStride = (rowBytes + 3) & ~3;
  const imageSize = rowStride * height;

  const fileHeaderSize = 14;
  const dibHeaderSize = 40;
  const paletteSize = 8; // 2 colors * 4 bytes
  const pixelOffset = fileHeaderSize + dibHeaderSize + paletteSize;
  const fileSize = pixelOffset + imageSize;

  const buf = Buffer.alloc(fileSize);

  // File header
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(0, 6);
  buf.writeUInt32LE(pixelOffset, 10);

  // DIB header (BITMAPINFOHEADER)
  buf.writeUInt32LE(dibHeaderSize, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22); // positive = bottom-up
  buf.writeUInt16LE(1, 26);    // planes
  buf.writeUInt16LE(1, 28);    // bits per pixel
  buf.writeUInt32LE(0, 30);    // compression = BI_RGB
  buf.writeUInt32LE(imageSize, 34);
  buf.writeInt32LE(2835, 38);  // x pixels/meter (~72dpi)
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(2, 46);    // colors used
  buf.writeUInt32LE(0, 50);    // important colors

  // Palette: BGRA. Index 0 = black, Index 1 = white.
  buf[54] = 0; buf[55] = 0; buf[56] = 0; buf[57] = 0;           // black
  buf[58] = 255; buf[59] = 255; buf[60] = 255; buf[61] = 0;     // white

  // Pixel data — bottom-up
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width;
    const dstRow = pixelOffset + y * rowStride;
    for (let x = 0; x < width; x++) {
      const bit = pixels[srcRow + x] & 1; // 1 = white, 0 = black
      if (bit) {
        const byteIndex = dstRow + (x >> 3);
        const bitIndex = 7 - (x & 7);
        buf[byteIndex] |= 1 << bitIndex;
      }
    }
  }

  return buf;
}

// 24-bit BGR BMP encoder.
// Input: width, height, and an RGBA buffer (4 bytes/pixel) matching canvas output.
// Some e-ink controllers (e.g. the 28" 3840×1080 panel) refuse 1-bpp BMPs and
// expect a 24-bpp Windows V3 BMP even when the source is monochrome — they read
// the BGR channels and threshold internally.
export function encodeBmp24bit(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray): Buffer {
  if (rgba.length !== width * height * 4) {
    throw new Error(`rgba buffer length ${rgba.length} != ${width}*${height}*4`);
  }

  const rowBytes = width * 3;
  const rowStride = (rowBytes + 3) & ~3;
  const imageSize = rowStride * height;

  const fileHeaderSize = 14;
  const dibHeaderSize = 40;
  const pixelOffset = fileHeaderSize + dibHeaderSize;
  const fileSize = pixelOffset + imageSize;

  const buf = Buffer.alloc(fileSize);

  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(0, 6);
  buf.writeUInt32LE(pixelOffset, 10);

  buf.writeUInt32LE(dibHeaderSize, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22); // positive = bottom-up
  buf.writeUInt16LE(1, 26);     // planes
  buf.writeUInt16LE(24, 28);    // bits per pixel
  buf.writeUInt32LE(0, 30);     // compression = BI_RGB
  buf.writeUInt32LE(imageSize, 34);
  buf.writeInt32LE(3779, 38);   // x pixels/meter (~96dpi to match sample)
  buf.writeInt32LE(3779, 42);
  buf.writeUInt32LE(0, 46);     // colors used
  buf.writeUInt32LE(0, 50);     // important colors

  // Pixel data — bottom-up, BGR
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4;
    const dstRow = pixelOffset + y * rowStride;
    for (let x = 0; x < width; x++) {
      const s = srcRow + x * 4;
      const d = dstRow + x * 3;
      // Treat transparent pixels as white.
      if (rgba[s + 3] === 0) {
        buf[d] = 255; buf[d + 1] = 255; buf[d + 2] = 255;
      } else {
        buf[d]     = rgba[s + 2]; // B
        buf[d + 1] = rgba[s + 1]; // G
        buf[d + 2] = rgba[s];     // R
      }
    }
  }
  return buf;
}

// Rotate an RGBA buffer (4 bytes/pixel) by 90/180/270 degrees. Returns
// new buffer + dims. deg=0 returns the input unchanged.
export function rotateRgba(rgba: Uint8ClampedArray, w: number, h: number, deg: number): { rgba: Uint8ClampedArray; width: number; height: number } {
  if (!deg || deg % 360 === 0) return { rgba, width: w, height: h };
  if (deg === 180) {
    const out = new Uint8ClampedArray(rgba.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const src = (y * w + x) * 4;
        const dst = ((h - 1 - y) * w + (w - 1 - x)) * 4;
        out[dst] = rgba[src]; out[dst + 1] = rgba[src + 1]; out[dst + 2] = rgba[src + 2]; out[dst + 3] = rgba[src + 3];
      }
    }
    return { rgba: out, width: w, height: h };
  }
  const nw = h, nh = w;
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = deg === 90
        ? (x * nw + (h - 1 - y)) * 4
        : ((w - 1 - x) * nw + y) * 4;
      out[dst] = rgba[src]; out[dst + 1] = rgba[src + 1]; out[dst + 2] = rgba[src + 2]; out[dst + 3] = rgba[src + 3];
    }
  }
  return { rgba: out, width: nw, height: nh };
}

// Convert RGBA canvas pixels to a 1-bit buffer (1 = white).
// mode: "threshold" does flat cutoff; "dither" does Floyd–Steinberg.
export function rgbaTo1Bit(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  opts: { mode?: "threshold" | "dither"; threshold?: number } = {}
): Uint8Array {
  const mode = opts.mode ?? "threshold";
  const threshold = opts.threshold ?? 128;
  const out = new Uint8Array(width * height);

  if (mode === "threshold") {
    for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
      const a = rgba[i + 3];
      // Transparent pixels treated as white (background).
      const gray =
        a === 0 ? 255 : (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
      out[p] = gray >= threshold ? 1 : 0;
    }
    return out;
  }

  // Floyd–Steinberg dither on a float gray buffer
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    const a = rgba[i + 3];
    gray[p] =
      a === 0 ? 255 : (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = gray[i];
      const neu = old >= threshold ? 255 : 0;
      out[i] = neu === 255 ? 1 : 0;
      const err = old - neu;
      if (x + 1 < width) gray[i + 1] += (err * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) gray[i + width - 1] += (err * 3) / 16;
        gray[i + width] += (err * 5) / 16;
        if (x + 1 < width) gray[i + width + 1] += (err * 1) / 16;
      }
    }
  }
  return out;
}

// Convert a 1-bit buffer back to an RGBA PNG-ready Uint8ClampedArray for UI preview.
export function oneBitToRgba(pixels: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, p = 0; i < pixels.length; i++, p += 4) {
    const v = pixels[i] ? 255 : 0;
    out[p] = out[p + 1] = out[p + 2] = v;
    out[p + 3] = 255;
  }
  return out;
}
