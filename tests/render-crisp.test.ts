import { describe, expect, it } from "vitest";
import type { AssetDoc, Block } from "@/lib/mongo";
import { isPureBlackWhite } from "@/lib/frame";
import { renderLayoutCrisp } from "@/lib/render-crisp";
import { renderDevice } from "@/lib/render";
import { block, countValue, dump, eventCardAsset, expectMatchesGolden, grayPngDataUrl } from "./helpers";

const device = { width: 800, height: 480, background: "black" as const };

function fixture(): { layout: Block[]; assets: Map<string, AssetDoc> } {
  const assets = new Map<string, AssetDoc>([["card", eventCardAsset()]]);
  const photo = grayPngDataUrl(160, 120, (x, y) => (x / 159) * 200 + (y / 119) * 55);
  const diagram = grayPngDataUrl(160, 80, (x, y) => (x > 20 && x < 140 && y > 15 && y < 65 ? 142 : 0));
  const layout: Block[] = [
    block({ type: "text", x: 16, y: 10, w: 460, h: 70, text: "Wild Mile", fontFamily: "houschka-bold", fontSize: 60, padding: 0 }),
    block({
      type: "text", x: 16, y: 86, w: 440, h: 110, fontFamily: "houschka", fontSize: 20, rich: true,
      text: "Catch them before they **migrate**! These birds prefer to feed on red or orange flowers.",
    }),
    block({ type: "line", x: 0, y: 204, w: 800, h: 6, lineDirection: "horizontal", lineThickness: 6, lineColor: "white" }),
    block({ type: "line", x: 480, y: 0, w: 6, h: 204, lineDirection: "vertical", lineThickness: 6, lineColor: "white" }),
    block({ type: "shape", x: 500, y: 12, w: 120, h: 60, shapeKind: "outlined", lineThickness: 3 }),
    block({ type: "qr", x: 640, y: 12, w: 148, h: 148, qrUrl: "https://www.urbanrivers.org", qrStyle: "bars", qrQuiet: 4, qrErrorLevel: "M" }),
    block({ type: "image", x: 16, y: 224, w: 160, h: 120, imageData: photo }),
    block({ type: "image", x: 200, y: 224, w: 160, h: 80, imageData: diagram }),
    block({
      type: "date", x: 16, y: 360, w: 300, h: 110, dateISO: "2026-08-03", startTime: "18:30", endTime: "20:30",
      dateShowDayOfWeek: true, dateShowDay: true, dateShowMonth: true, dateShowTime: true, dateLayout: "stacked",
    }),
    block({ type: "asset", x: 390, y: 224, w: 400, h: 100, assetId: "card", variableBindings: { title: "Music Theory" } }),
    // The same card at half size: inner blocks are laid out again, not resampled.
    block({ type: "asset", x: 390, y: 340, w: 200, h: 50, assetId: "card" }),
    block({ type: "text", x: 600, y: 400, w: 190, h: 60, text: "Inverted", background: "white", fontFamily: "houschka-demibold", fontSize: 28, align: "center", vAlign: "middle" }),
  ];
  return { layout, assets };
}

describe("crisp renderer", () => {
  it("produces only pure black and pure white", async () => {
    const { layout, assets } = fixture();
    const frame = await renderLayoutCrisp(device, layout, assets);
    await dump("crisp-fixture", frame);
    expect([frame.width, frame.height]).toEqual([800, 480]);
    expect(isPureBlackWhite(frame)).toBe(true);
    // Something was actually drawn.
    const white = countValue(frame, 255) / frame.data.length;
    expect(white).toBeGreaterThan(0.03);
    expect(white).toBeLessThan(0.6);
  });

  it("matches the stored reference image", async () => {
    const { layout, assets } = fixture();
    await expectMatchesGolden("crisp-fixture", await renderLayoutCrisp(device, layout, assets));
  });

  it("fixes what the old renderer got wrong: grey edges on 24-bit devices", async () => {
    const { layout, assets } = fixture();
    const old = await renderDevice(
      { ...device, slug: "t", name: "t", bitDepth: 24, layout, createdAt: new Date(0), updatedAt: new Date(0) },
      assets
    );
    let grey = 0;
    for (let i = 0; i < old.rgba.length; i += 4) if (old.rgba[i] !== 0 && old.rgba[i] !== 255) grey++;
    expect(grey).toBeGreaterThan(0);
  });

  it("returns the device's native size for rotated mounts", async () => {
    const { layout, assets } = fixture();
    // Native 480×800 panel mounted sideways: edited at 800×480.
    const rotated = await renderLayoutCrisp({ width: 480, height: 800, rotation: 90, background: "black" }, layout, assets);
    expect([rotated.width, rotated.height]).toEqual([480, 800]);
    expect(isPureBlackWhite(rotated)).toBe(true);
    const upright = await renderLayoutCrisp(device, layout, assets);
    expect(countValue(rotated, 255)).toBe(countValue(upright, 255));
  });

  it("text weight: a lower cut-off inks more pixels", async () => {
    const layout = [block({ type: "text", x: 10, y: 10, w: 780, h: 200, text: "Wild Mile 0123", fontFamily: "houschka", fontSize: 24 })];
    const none = new Map<string, AssetDoc>();
    const light = countValue(await renderLayoutCrisp({ ...device, inkCutoff: 160 }, layout, none), 255);
    const normal = countValue(await renderLayoutCrisp({ ...device, inkCutoff: 128 }, layout, none), 255);
    const heavy = countValue(await renderLayoutCrisp({ ...device, inkCutoff: 96 }, layout, none), 255);
    expect(light).toBeLessThan(normal);
    expect(normal).toBeLessThan(heavy);
  });

  it("keeps a prepared black-and-white picture exactly as it is", async () => {
    const art = grayPngDataUrl(64, 64, (x, y) => ((x >> 3) + (y >> 3)) % 2 === 0 ? 255 : 0);
    const frame = await renderLayoutCrisp(device, [block({ type: "image", x: 100, y: 100, w: 64, h: 64, imageData: art })], new Map());
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const want = ((x >> 3) + (y >> 3)) % 2 === 0 ? 255 : 0;
        expect(frame.data[(100 + y) * 800 + 100 + x]).toBe(want);
      }
    }
  });

  it("clips an asset's contents to the asset", async () => {
    const asset: AssetDoc = {
      name: "overflow", width: 100, height: 50, background: "black", createdAt: new Date(0), updatedAt: new Date(0),
      layout: [block({ type: "shape", x: 50, y: 0, w: 200, h: 50, shapeKind: "filled" })],
    };
    const frame = await renderLayoutCrisp(device, [block({ type: "asset", x: 10, y: 10, w: 100, h: 50, assetId: "a" })], new Map([["a", asset]]));
    expect(frame.data[20 * 800 + 100]).toBe(255); // inside the asset
    expect(frame.data[20 * 800 + 130]).toBe(0);   // past its right edge
  });
});
