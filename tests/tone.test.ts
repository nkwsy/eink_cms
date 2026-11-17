import { describe, expect, it } from "vitest";
import { bayerCutoff, pickImageMode, quantize } from "@/lib/tone";

function flat(w: number, h: number, v: number) {
  return new Uint8Array(w * h).fill(v);
}
function whiteShare(a: Uint8Array) {
  let n = 0;
  for (const v of a) if (v === 255) n++;
  return n / a.length;
}

describe("dot pattern", () => {
  it("keeps pure black and pure white solid", () => {
    expect(whiteShare(quantize(flat(64, 64, 0), 64, 64, "dots"))).toBe(0);
    expect(whiteShare(quantize(flat(64, 64, 255), 64, 64, "dots"))).toBe(1);
  });

  it("gets denser as the grey gets lighter", () => {
    let last = -1;
    for (let level = 0; level <= 15; level++) {
      const share = whiteShare(quantize(flat(64, 64, Math.round((level * 255) / 15)), 64, 64, "dots"));
      expect(share).toBeGreaterThanOrEqual(last);
      last = share;
    }
    expect(whiteShare(quantize(flat(64, 64, 128), 64, 64, "dots"))).toBeCloseTo(0.5, 1);
  });

  it("stays in phase across neighbouring tiles", () => {
    const a = quantize(flat(8, 8, 100), 8, 8, "dots", { originX: 0, originY: 0 });
    const b = quantize(flat(8, 8, 100), 8, 8, "dots", { originX: 8, originY: 16 });
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(bayerCutoff(3, 5)).toBe(bayerCutoff(11, 13));
  });
});

describe("quantize", () => {
  it("only ever produces black or white", () => {
    const w = 97, h = 53;
    const ramp = new Uint8Array(w * h);
    for (let i = 0; i < ramp.length; i++) ramp[i] = (i * 7) % 256;
    for (const mode of ["sharp", "dots", "dither"] as const) {
      const out = quantize(ramp, w, h, mode);
      expect(out.every((v) => v === 0 || v === 255)).toBe(true);
    }
  });

  it("dither keeps the average tone of a flat grey", () => {
    expect(whiteShare(quantize(flat(80, 80, 64), 80, 80, "dither"))).toBeCloseTo(64 / 255, 1);
  });
});

describe("pickImageMode", () => {
  it("cuts line art sharply", () => {
    const art = new Uint8Array(1000);
    for (let i = 0; i < art.length; i++) art[i] = i % 3 === 0 ? 255 : 0;
    expect(pickImageMode(art)).toBe("sharp");
  });

  it("uses dots for flat grey fills", () => {
    const diagram = new Uint8Array(1000).fill(0);
    diagram.fill(142, 0, 400);
    expect(pickImageMode(diagram)).toBe("dots");
  });

  it("dithers smooth tones", () => {
    const photo = new Uint8Array(1024);
    for (let i = 0; i < photo.length; i++) photo[i] = i % 256;
    expect(pickImageMode(photo)).toBe("dither");
  });
});
