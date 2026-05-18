import { ObjectId } from "mongodb";
import { media, MediaItemDoc } from "./mongo";

export async function saveMedia(
  item: Omit<MediaItemDoc, "_id" | "createdAt">
): Promise<MediaItemDoc> {
  const col = await media();
  const doc: MediaItemDoc = { ...item, createdAt: new Date() };
  const r = await col.insertOne(doc as MediaItemDoc);
  return { ...doc, _id: r.insertedId };
}

export async function getMedia(id: string): Promise<MediaItemDoc | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await media();
  return col.findOne({ _id: new ObjectId(id) });
}

export async function listMedia(opts: {
  kind?: MediaItemDoc["kind"];
  sourcePluginId?: string;
  limit?: number;
} = {}): Promise<MediaItemDoc[]> {
  const col = await media();
  const q: Record<string, unknown> = {};
  if (opts.kind) q.kind = opts.kind;
  if (opts.sourcePluginId) q.sourcePluginId = opts.sourcePluginId;
  return col
    .find(q)
    .sort({ createdAt: -1 })
    .limit(opts.limit ?? 200)
    .toArray();
}

export async function deleteMedia(id: string): Promise<void> {
  if (!ObjectId.isValid(id)) return;
  const col = await media();
  await col.deleteOne({ _id: new ObjectId(id) });
}

// Convenience: turn a raw PNG buffer into a base64 data URL suitable for
// storing on a MediaItemDoc (matches the existing image-block format).
export function pngBufferToDataUrl(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// Strip the `data:...;base64,` prefix and return the raw bytes. Useful when
// we want to push the same bytes into canvas drawImage.
export function dataUrlToBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("invalid data URL");
  const meta = dataUrl.slice(5, comma); // strip leading "data:"
  const isBase64 = /;base64$/i.test(meta);
  const payload = dataUrl.slice(comma + 1);
  return isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
}
