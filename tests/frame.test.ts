import { describe, expect, it } from "vitest";
import {
  fillRect, FramePainter, frameHash, frameToBmp, newFrame, packFrame, rotateFrame, strokeRectInside, unpackFrame,
} from "@/lib/frame";
import { qrModuleCount, renderQr } from "@/lib/qr";

describe("frame", () => {
  it("rotates there and back", () => {
    const f = newFrame(5, 3);
    f.data.forEach((_, i) => (f.data[i] = i * 10));
    const r = rotateFrame(f, 90);
    expect([r.width, r.height]).toEqual([3, 5]);
    expect(Array.from(rotateFrame(r, 270).data)).toEqual(Array.from(f.data));
    expect(Array.from(rotateFrame(rotateFrame(f, 180), 180).data)).toEqual(Array.from(f.data));
  });

  it("survives storage", () => {
    const f = newFrame(64, 32);
    fillRect(f, { x: 3, y: 4, w: 20, h: 10 }, 255);
    const back = unpackFrame(packFrame(f), 64, 32);
    expect(frameHash(back)).toBe(frameHash(f));
    expect(() => unpackFrame(packFrame(f), 64, 31)).toThrow();
  });

  it("clips fills and draws rings inside the rectangle", () => {
    const f = newFrame(10, 10);
    fillRect(f, { x: -5, y: -5, w: 8, h: 8 }, 255);
    expect(f.data[2 * 10 + 2]).toBe(255);
    expect(f.data[3 * 10 + 3]).toBe(0);
    const g = newFrame(10, 10);
    strokeRectInside(g, { x: 2, y: 2, w: 6, h: 6 }, 1, 255);
    expect(g.data[2 * 10 + 2]).toBe(255);
    expect(g.data[7 * 10 + 7]).toBe(255);
    expect(g.data[4 * 10 + 4]).toBe(0);
    expect(g.data[1 * 10 + 1]).toBe(0);
  });

  it("writes the 24-bit BMP the 28-inch panel accepts", () => {
    const f = newFrame(3840, 1080);
    f.data[0] = 255; // top-left pixel
    const bmp = frameToBmp(f, 24);
    expect(bmp.toString("ascii", 0, 2)).toBe("BM");
    expect(bmp.length).toBe(54 + 3840 * 1080 * 3);
    expect(bmp.readInt32LE(18)).toBe(3840);
    expect(bmp.readInt32LE(22)).toBe(1080);
    expect(bmp.readUInt16LE(28)).toBe(24);
    expect(bmp.readUInt32LE(30)).toBe(0);
    // Rows are stored bottom-up, so the top-left pixel is in the last row.
    const lastRow = 54 + 1079 * 3840 * 3;
    expect([bmp[lastRow], bmp[lastRow + 1], bmp[lastRow + 2]]).toEqual([255, 255, 255]);
    expect(bmp[54]).toBe(0);
  });

  it("writes a 1-bit BMP for 1-bit devices", () => {
    const bmp = frameToBmp(newFrame(296, 128, 255), 1);
    expect(bmp.readUInt16LE(28)).toBe(1);
  });
});

describe("QR drawn straight into a frame", () => {
  const url = "https://www.urbanrivers.org";
  const n = qrModuleCount(url, "M");
  const px = 5;
  const side = (n + 8) * px;

  async function draw(style: "bars" | "square") {
    const f = newFrame(side, side, 128);
    await renderQr(new FramePainter(f), url, { x: 0, y: 0, w: side, h: side }, {
      quietModules: 4, errorLevel: "M", style, invert: true,
    });
    return f;
  }
  const at = (f: { data: Uint8Array }, mx: number, my: number, dy = 2) =>
    f.data[((my + 4) * px + dy) * side + (mx + 4) * px + 2];

  it("paints a 4-module quiet zone and whole-pixel modules", async () => {
    const f = await draw("square");
    expect(f.data.every((v) => v === 0 || v === 255)).toBe(true);
    expect(f.data[0]).toBe(0);                 // quiet zone
    expect(at(f, 0, 0)).toBe(255);             // finder outer ring
    expect(at(f, 1, 1)).toBe(0);               // finder gap
    expect(at(f, 3, 3)).toBe(255);             // finder centre
  });

  it("keeps finder squares solid and leaves a gap between bar rows", async () => {
    const bars = await draw("bars");
    const square = await draw("square");
    // Finder pattern: identical in both styles, including the bottom pixel row.
    for (let m = 0; m < 7; m++) expect(at(bars, m, 0, px - 1)).toBe(at(square, m, 0, px - 1));
    // Data area: bars are 4 of 5 pixels tall, so the last pixel row of every
    // module is background.
    let gapRows = 0;
    for (let mx = 8; mx < n - 8; mx++) {
      if (at(square, mx, 10) === 255) {
        expect(at(bars, mx, 10, 1)).toBe(255);
        expect(at(bars, mx, 10, px - 1)).toBe(0);
        gapRows++;
      }
    }
    expect(gapRows).toBeGreaterThan(0);
  });
});
