import { ObjectId, assets as assetsColl, AssetDoc, DeviceDoc } from "./mongo";

export async function loadAssetMap(device: DeviceDoc): Promise<Map<string, AssetDoc>> {
  const ids = Array.from(
    new Set(
      device.layout.filter((b) => b.type === "asset" && b.assetId).map((b) => b.assetId as string)
    )
  );
  const map = new Map<string, AssetDoc>();
  if (!ids.length) return map;
  const col = await assetsColl();
  const docs = await col
    .find({ _id: { $in: ids.map((i) => new ObjectId(i)) } })
    .toArray();
  for (const d of docs) map.set(String(d._id), d);
  return map;
}
