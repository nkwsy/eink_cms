import { ObjectId, assets as assetsColl, AssetDoc, Block, DeviceDoc } from "./mongo";

// Used by the old renderer: only the assets placed directly on the live layout.
export async function loadAssetMap(device: DeviceDoc): Promise<Map<string, AssetDoc>> {
  return loadAssetMapForLayout(device.layout, 1);
}

/**
 * Loads every asset a layout uses, following assets placed inside other
 * assets up to `maxDepth` levels.
 */
export async function loadAssetMapForLayout(layout: Block[], maxDepth = 6): Promise<Map<string, AssetDoc>> {
  const map = new Map<string, AssetDoc>();
  let wanted = assetIds(layout);
  const col = wanted.length ? await assetsColl() : null;
  for (let depth = 0; col && depth < maxDepth && wanted.length; depth++) {
    const ids = wanted.filter((id) => !map.has(id) && ObjectId.isValid(id));
    if (!ids.length) break;
    const docs = await col.find({ _id: { $in: ids.map((i) => new ObjectId(i)) } }).toArray();
    for (const d of docs) map.set(String(d._id), d);
    wanted = docs.flatMap((d) => assetIds(d.layout ?? []));
  }
  return map;
}

function assetIds(layout: Block[]): string[] {
  return Array.from(
    new Set(layout.filter((b) => b.type === "asset" && b.assetId).map((b) => b.assetId as string))
  );
}
