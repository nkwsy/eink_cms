import { describe, expect, it } from "vitest";
import type { Block, FrozenAsset, FrozenPlugin } from "@/lib/mongo";
import {
  changedSince, contentHash, parsePromoteAt, repoint, Snapshot, stableJson, usedBy, versionsToPrune,
} from "@/lib/version-core";
import { block } from "./helpers";

function card(layout: Block[], over: Partial<FrozenAsset> = {}): FrozenAsset {
  return { name: "Card", width: 100, height: 50, layout, ...over };
}
function plugin(settings: Record<string, unknown>): FrozenPlugin {
  return { typeId: "kpi", name: "KPI", width: 100, height: 50, settings, ttlSec: 60 };
}
const text = (t: string) => block({ type: "text", x: 0, y: 0, w: 10, h: 10, text: t });
const useCard = (id: string) => block({ type: "asset", x: 0, y: 0, w: 10, h: 10, assetId: id });
const usePlugin = (id: string) => block({ type: "plugin", x: 0, y: 0, w: 10, h: 10, pluginInstanceId: id });

describe("stable hashing", () => {
  it("ignores key order and empty properties", () => {
    expect(stableJson({ b: 1, a: [{ d: null, c: 2 }] })).toBe(stableJson({ a: [{ c: 2, e: undefined }], b: 1 }));
    expect(contentHash({ a: 1, b: null })).toBe(contentHash({ a: 1 }));
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
  });
});

describe("what a layout uses", () => {
  it("finds plugins and media inside cards too", () => {
    const inner = card([usePlugin("p2"), block({ type: "image", x: 0, y: 0, w: 5, h: 5, mediaId: "m2" })]);
    const got = usedBy(
      [usePlugin("p1"), useCard("a1"), block({ type: "image", x: 0, y: 0, w: 5, h: 5, mediaId: "m1" })],
      { a1: inner }
    );
    expect(got.pluginIds.sort()).toEqual(["p1", "p2"]);
    expect(got.mediaIds.sort()).toEqual(["m1", "m2"]);
  });
});

describe("what changed since a version", () => {
  const inner = card([text("inner")]);
  const frozen: Snapshot = {
    assets: { outer: card([useCard("inner"), usePlugin("p")]), inner, other: card([text("other")]) },
    plugins: { p: plugin({ n: 1 }) },
  };

  it("reports nothing when the library is unchanged, even if a card was renamed", () => {
    const current: Snapshot = {
      assets: { ...frozen.assets, other: { ...frozen.assets.other, name: "Renamed" } },
      plugins: frozen.plugins,
    };
    expect(changedSince(frozen, current)).toEqual({ assets: [], plugins: [] });
  });

  it("reports a changed inner card and the card around it, inner first", () => {
    const current: Snapshot = {
      assets: { ...frozen.assets, inner: card([text("edited")]) },
      plugins: frozen.plugins,
    };
    expect(changedSince(frozen, current)).toEqual({ assets: ["inner", "outer"], plugins: [] });
  });

  it("reports a card whose plugin settings changed", () => {
    const current: Snapshot = { assets: frozen.assets, plugins: { p: plugin({ n: 2 }) } };
    expect(changedSince(frozen, current)).toEqual({ assets: ["outer"], plugins: ["p"] });
  });

  it("reports deleted cards and plugins", () => {
    const current: Snapshot = { assets: { outer: frozen.assets.outer, inner }, plugins: {} };
    const got = changedSince(frozen, current);
    expect(got.plugins).toEqual(["p"]);
    expect(got.assets.sort()).toEqual(["other", "outer"]);
  });

  it("copes with cards that contain each other", () => {
    const loop: Snapshot = { assets: { a: card([useCard("b")]), b: card([useCard("a")]) }, plugins: {} };
    expect(changedSince(loop, loop)).toEqual({ assets: [], plugins: [] });
  });
});

describe("repointing", () => {
  it("swaps only the ids it is given", () => {
    const layout = [useCard("a"), useCard("b"), usePlugin("p"), text("t")];
    const out = repoint(layout, { a: "a2" }, { p: "p2" });
    expect(out[0].assetId).toBe("a2");
    expect(out[1]).toBe(layout[1]);
    expect(out[2].pluginInstanceId).toBe("p2");
    expect(out[3]).toBe(layout[3]);
    expect(layout[0].assetId).toBe("a");
  });
});

describe("keeping the newest versions", () => {
  const all = Array.from({ length: 53 }, (_, i) => ({ id: `v${i + 1}`, number: i + 1 }));

  it("drops the oldest beyond the limit", () => {
    expect(versionsToPrune(all, [], 50).map((v) => v.number)).toEqual([1, 2, 3]);
    expect(versionsToPrune(all.slice(0, 50), [], 50)).toEqual([]);
  });

  it("never drops the live or scheduled version", () => {
    expect(versionsToPrune(all, ["v1", undefined, "v3"], 50).map((v) => v.number)).toEqual([2, 4, 5]);
  });
});

describe("promote-at time", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  it("reads a future time", () => {
    expect(parsePromoteAt("2026-11-18T09:00:00Z", now).at?.toISOString()).toBe("2026-11-18T09:00:00.000Z");
  });
  it("treats empty or past times as promote now", () => {
    expect(parsePromoteAt(undefined, now)).toEqual({ at: null });
    expect(parsePromoteAt("", now)).toEqual({ at: null });
    expect(parsePromoteAt("2026-11-17T11:59:00Z", now)).toEqual({ at: null });
  });
  it("refuses nonsense and far-off times", () => {
    expect(parsePromoteAt("next tuesday-ish", now).error).toBeTruthy();
    expect(parsePromoteAt("2029-01-01T00:00:00Z", now).error).toBeTruthy();
  });
});
