// Version logic that needs no database: hashing, finding what a layout uses,
// and working out which cards and plugins have changed since a version was
// saved.
import { createHash } from "node:crypto";
import type { AssetDoc, Block, FrozenAsset, FrozenPlugin, PluginInstanceDoc } from "./mongo";

export const MAX_VERSIONS = 50;

export type Snapshot = {
  assets: Record<string, FrozenAsset>;
  plugins: Record<string, FrozenPlugin>;
};

/**
 * JSON with object keys sorted and empty (null/undefined) properties dropped,
 * so equal content always gives the same text. The database stores undefined
 * as null, which is why the two are treated alike.
 */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of Object.keys(obj).sort()) {
    if (obj[k] == null) continue;
    parts.push(`${JSON.stringify(k)}:${stableJson(obj[k])}`);
  }
  return `{${parts.join(",")}}`;
}

export function contentHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function freezeAsset(a: AssetDoc | FrozenAsset): FrozenAsset {
  return {
    name: a.name,
    width: a.width,
    height: a.height,
    background: a.background,
    layout: a.layout ?? [],
    variables: a.variables,
  };
}

export function freezePlugin(p: PluginInstanceDoc | FrozenPlugin): FrozenPlugin {
  return {
    typeId: p.typeId,
    name: p.name,
    width: p.width,
    height: p.height,
    settings: p.settings ?? {},
    ttlSec: p.ttlSec,
  };
}

// What decides how a card or plugin draws. The name is left out: renaming a
// card does not change a screen.
function assetLook(a: FrozenAsset) {
  return { width: a.width, height: a.height, background: a.background, layout: a.layout, variables: a.variables };
}
function pluginLook(p: FrozenPlugin) {
  return { typeId: p.typeId, width: p.width, height: p.height, settings: p.settings, ttlSec: p.ttlSec };
}

export function assetIdsIn(layout: Block[]): string[] {
  return unique(layout.filter((b) => b.type === "asset" && b.assetId).map((b) => b.assetId as string));
}
export function pluginIdsIn(layout: Block[]): string[] {
  return unique(layout.filter((b) => b.type === "plugin" && b.pluginInstanceId).map((b) => b.pluginInstanceId as string));
}
export function mediaIdsIn(layout: Block[]): string[] {
  return unique(layout.filter((b) => b.mediaId).map((b) => b.mediaId as string));
}

function unique(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

/** Every plugin and media item a layout uses, directly or through its cards. */
export function usedBy(layout: Block[], assets: Record<string, FrozenAsset>) {
  const layouts = [layout, ...Object.values(assets).map((a) => a.layout ?? [])];
  return {
    pluginIds: unique(layouts.flatMap(pluginIdsIn)),
    mediaIds: unique(layouts.flatMap(mediaIdsIn)),
  };
}

/**
 * A hash per card that also covers the cards and plugins placed inside it, so
 * a card counts as changed when anything it shows has changed.
 */
export function deepHashes(snap: Snapshot): { assets: Record<string, string>; plugins: Record<string, string> } {
  const plugins: Record<string, string> = {};
  for (const [id, p] of Object.entries(snap.plugins)) plugins[id] = contentHash(pluginLook(p));

  const assets: Record<string, string> = {};
  const visiting = new Set<string>();
  const visit = (id: string): string => {
    if (assets[id]) return assets[id];
    const a = snap.assets[id];
    if (!a) return "missing";
    if (visiting.has(id)) return "cycle";
    visiting.add(id);
    const inner = [
      ...assetIdsIn(a.layout).sort().map((c) => `a:${c}:${visit(c)}`),
      ...pluginIdsIn(a.layout).sort().map((c) => `p:${c}:${plugins[c] ?? "missing"}`),
    ];
    visiting.delete(id);
    assets[id] = contentHash({ own: assetLook(a), inner });
    return assets[id];
  };
  for (const id of Object.keys(snap.assets)) visit(id);
  return { assets, plugins };
}

/**
 * The frozen cards and plugins that no longer match what is in the library
 * now (changed or deleted). Cards come back inner-first, so a copy of an outer
 * card can point at the copies of the cards inside it.
 */
export function changedSince(frozen: Snapshot, current: Snapshot): { assets: string[]; plugins: string[] } {
  const was = deepHashes(frozen);
  const now = deepHashes(current);
  const plugins = Object.keys(frozen.plugins).filter((id) => was.plugins[id] !== now.plugins[id]);

  const assets: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id) || !frozen.assets[id]) return;
    seen.add(id);
    for (const c of assetIdsIn(frozen.assets[id].layout)) visit(c);
    if (was.assets[id] !== now.assets[id]) assets.push(id);
  };
  for (const id of Object.keys(frozen.assets)) visit(id);
  return { assets, plugins };
}

/** Points a layout's card and plugin blocks at other ids. Untouched blocks are returned as they are. */
export function repoint(layout: Block[], assetMap: Record<string, string>, pluginMap: Record<string, string>): Block[] {
  return layout.map((b) => {
    if (b.type === "asset" && b.assetId && assetMap[b.assetId]) return { ...b, assetId: assetMap[b.assetId] };
    if (b.type === "plugin" && b.pluginInstanceId && pluginMap[b.pluginInstanceId]) {
      return { ...b, pluginInstanceId: pluginMap[b.pluginInstanceId] };
    }
    return b;
  });
}

/**
 * Which versions to delete so at most `max` remain. The oldest go first;
 * versions in `keep` (live, scheduled) are never deleted.
 */
export function versionsToPrune<T extends { id: string; number: number }>(
  all: T[],
  keep: Array<string | undefined | null>,
  max = MAX_VERSIONS
): T[] {
  const protectedIds = new Set(keep.filter(Boolean) as string[]);
  const excess = all.length - max;
  if (excess <= 0) return [];
  return all
    .filter((v) => !protectedIds.has(v.id))
    .sort((a, b) => a.number - b.number)
    .slice(0, excess);
}

/** Splits "promote at" input into a usable time, or says why not. */
export function parsePromoteAt(input: unknown, now: Date): { at: Date | null; error?: string } {
  if (input == null || input === "") return { at: null };
  const at = new Date(String(input));
  if (Number.isNaN(at.getTime())) return { at: null, error: "That time could not be read." };
  if (at.getTime() <= now.getTime()) return { at: null };
  if (at.getTime() - now.getTime() > 366 * 24 * 3600 * 1000) {
    return { at: null, error: "That time is more than a year away." };
  }
  return { at };
}
