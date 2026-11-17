// Tone conversion for eink output: turns 8-bit grey into pure black/white.
// Pure functions, no canvas, so they can be unit-tested directly.

export type ImageMode = "auto" | "sharp" | "dots" | "dither";
export type ResolvedImageMode = Exclude<ImageMode, "auto">;

// Classic 8×8 Bayer matrix (ranks 0..63).
const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
];

/**
 * Cut-off for the dot pattern at absolute pixel (x, y). A grey value above the
 * cut-off becomes white. Pure black (0) and pure white (255) always survive.
 * Using absolute coordinates keeps neighbouring patterned areas in phase.
 */
export function bayerCutoff(x: number, y: number): number {
  return ((BAYER8[(y & 7) * 8 + (x & 7)] + 0.5) * 255) / 64;
}

/**
 * Chooses a conversion for a picture.
 * - Mostly black and white already (line art, prepared 1-bit images) → sharp.
 * - Mid-tones concentrated in a few flat values (diagram fills) → dots.
 * - Otherwise (photographs, shading) → dither.
 */
export function pickImageMode(gray: Uint8Array, alpha?: Uint8Array): ResolvedImageMode {
  const hist = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i < gray.length; i++) {
    if (alpha && alpha[i] === 0) continue;
    hist[gray[i]]++;
    total++;
  }
  if (total === 0) return "sharp";
  let mid = 0;
  for (let v = 48; v <= 207; v++) mid += hist[v];
  if (mid / total < 0.04) return "sharp";

  // Share of the mid-tones held by the two most common 8-level bands.
  const bands: number[] = [];
  for (let v = 48; v <= 207; v += 8) {
    let n = 0;
    for (let k = v; k < v + 8; k++) n += hist[k];
    bands.push(n);
  }
  bands.sort((a, b) => b - a);
  const flat = (bands[0] + (bands[1] ?? 0)) / mid;
  return flat > 0.6 ? "dots" : "dither";
}

export type QuantizeOptions = {
  // Pixels with alpha 0 are skipped (left as-is in the output, value 0).
  alpha?: Uint8Array;
  // Cut-off for "sharp" and for dither decisions. Default 128.
  cutoff?: number;
  // Absolute position of the tile's top-left, so dot patterns stay in phase.
  originX?: number;
  originY?: number;
};

/** Converts 8-bit grey to 0/255. Returns a new array the same size. */
export function quantize(
  gray: Uint8Array,
  width: number,
  height: number,
  mode: ResolvedImageMode,
  opts: QuantizeOptions = {}
): Uint8Array {
  const out = new Uint8Array(width * height);
  const cutoff = opts.cutoff ?? 128;
  const alpha = opts.alpha;

  if (mode === "sharp") {
    for (let i = 0; i < out.length; i++) out[i] = gray[i] >= cutoff ? 255 : 0;
    return out;
  }

  if (mode === "dots") {
    const ox = opts.originX ?? 0;
    const oy = opts.originY ?? 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        out[i] = gray[i] > bayerCutoff(x + ox, y + oy) ? 255 : 0;
      }
    }
    return out;
  }

  // Floyd–Steinberg error diffusion.
  const work = new Float32Array(width * height);
  for (let i = 0; i < work.length; i++) work[i] = gray[i];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (alpha && alpha[i] === 0) continue;
      const old = work[i];
      const neu = old >= cutoff ? 255 : 0;
      out[i] = neu;
      const err = old - neu;
      if (x + 1 < width) work[i + 1] += (err * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) work[i + width - 1] += (err * 3) / 16;
        work[i + width] += (err * 5) / 16;
        if (x + 1 < width) work[i + width + 1] += (err * 1) / 16;
      }
    }
  }
  return out;
}
