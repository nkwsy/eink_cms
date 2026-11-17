import { describe, expect, it } from "vitest";
import { renderCalibration } from "@/lib/calibration";
import { distinctLevels, dump } from "./helpers";

const base = { name: "Dock sign", slug: "eink-1-h", width: 3840, height: 1080 };
const fixedTime = new Date("2026-11-16T12:00:00Z");

describe("calibration chart", () => {
  it("fills a horizontal 28-inch screen and contains real greys", async () => {
    const frame = await renderCalibration(base, fixedTime);
    await dump("calibration-horizontal", frame);
    expect([frame.width, frame.height]).toEqual([3840, 1080]);
    expect(distinctLevels(frame)).toBeGreaterThan(16);
    // The 1-pixel edge line reaches all four edges.
    expect(frame.data[5]).toBe(255);
    expect(frame.data[1079 * 3840 + 3000]).toBe(255);
    expect(frame.data[500 * 3840]).toBe(255);
    expect(frame.data[500 * 3840 + 3839]).toBe(255);
  });

  it("is laid out upright for a vertical mount and returned at native size", async () => {
    const frame = await renderCalibration({ ...base, rotation: 90 }, fixedTime);
    await dump("calibration-vertical-native", frame);
    expect([frame.width, frame.height]).toEqual([3840, 1080]);
    expect(distinctLevels(frame)).toBeGreaterThan(16);
  });
});
