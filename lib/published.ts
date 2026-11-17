// Stored finished images. Promoting a screen draws it once and stores the
// result; the pull URL then hands over the stored copy without drawing
// anything, so a sign that has just been powered on gets its image at once.
// Promoting itself lives in lib/versions.ts.
import { Binary } from "mongodb";
import { DeviceDoc, devices, frames, ObjectId, PublishedRef, versions } from "./mongo";
import { frameHash, GrayFrame, packFrame, unpackFrame } from "./frame";
import { CRISP_RENDERER, renderLayoutCrisp } from "./render-crisp";
import { loadAssetMapForLayout } from "./fetch-assets";

export async function storeFrame(
  deviceId: string,
  kind: PublishedRef["kind"],
  frame: GrayFrame
): Promise<PublishedRef> {
  const col = await frames();
  const now = new Date();
  const sha256 = frameHash(frame);
  const r = await col.insertOne({
    deviceId,
    kind,
    width: frame.width,
    height: frame.height,
    data: new Binary(packFrame(frame)),
    sha256,
    renderer: CRISP_RENDERER,
    createdAt: now,
  });
  return { frameId: String(r.insertedId), kind, at: now, sha256, width: frame.width, height: frame.height };
}

export async function loadFrame(frameId: string): Promise<GrayFrame | null> {
  if (!ObjectId.isValid(frameId)) return null;
  const col = await frames();
  const doc = await col.findOne({ _id: new ObjectId(frameId) });
  if (!doc) return null;
  try {
    return unpackFrame(doc.data.buffer, doc.width, doc.height);
  } catch (e) {
    console.error("[published] stored frame unreadable", frameId, e);
    return null;
  }
}

/**
 * The image the pull URL should serve for a promoted device. Falls back to
 * drawing the live layout if the stored copy is missing, so a pull never fails
 * just because storage did.
 */
export async function liveFrame(device: DeviceDoc): Promise<GrayFrame | null> {
  if (!device.published) return null;
  const stored = await loadFrame(device.published.frameId);
  if (stored) return stored;
  console.warn("[published] stored frame missing; redrawing", String(device._id));
  return renderLayoutCrisp(device, device.layout, await loadAssetMapForLayout(device.layout));
}

/**
 * Deletes a device's stored images that nothing points at any more: not the
 * live image, not the one calibration is covering, not any version.
 */
export async function pruneFrames(deviceId: string) {
  if (!ObjectId.isValid(deviceId)) return;
  const device = await (await devices()).findOne(
    { _id: new ObjectId(deviceId) },
    { projection: { published: 1, beforeCalibration: 1 } }
  );
  if (!device) return;
  const used = await (await versions())
    .find({ deviceId, "frame.frameId": { $exists: true } }, { projection: { frame: 1 } })
    .toArray();
  const keep = [device.published?.frameId, device.beforeCalibration?.frameId, ...used.map((v) => v.frame?.frameId)]
    .filter((k): k is string => !!k && ObjectId.isValid(k))
    .map((k) => new ObjectId(k));
  // Leave very recent images alone: one may have just been stored by a
  // request that has not written its pointer yet.
  const cutoff = new Date(Date.now() - 2 * 60 * 1000);
  await (await frames()).deleteMany({ deviceId, _id: { $nin: keep }, createdAt: { $lt: cutoff } });
}

/** Puts a calibration image on the pull URL without touching the layout. */
export async function showCalibration(device: DeviceDoc, frame: GrayFrame): Promise<PublishedRef> {
  const deviceId = String(device._id);
  const ref = await storeFrame(deviceId, "calibration", frame);
  const covered =
    device.published?.kind === "calibration" ? device.beforeCalibration ?? null : device.published ?? null;
  const col = await devices();
  await col.updateOne({ _id: device._id }, { $set: { published: ref, beforeCalibration: covered } });
  await pruneFrames(deviceId);
  return ref;
}

/** Takes the calibration chart off the sign and puts back what it covered. */
export async function removeCalibration(device: DeviceDoc): Promise<boolean> {
  if (device.published?.kind !== "calibration") return false;
  const covered = device.beforeCalibration ?? null;
  await (await devices()).updateOne(
    { _id: device._id },
    covered
      ? { $set: { published: covered }, $unset: { beforeCalibration: "" } }
      : { $unset: { published: "", beforeCalibration: "" } }
  );
  await pruneFrames(String(device._id));
  return true;
}

/** Records that the BMP was fetched. Never throws: a pull must not fail on bookkeeping. */
export async function notePull(device: DeviceDoc, userAgent: string | null) {
  try {
    const col = await devices();
    await col.updateOne(
      { _id: device._id },
      {
        $set: { lastPull: { at: new Date(), userAgent: userAgent?.slice(0, 160) ?? undefined } },
        $inc: { pullCount: 1 },
      }
    );
  } catch (e) {
    console.error("[published] could not record pull", e);
  }
}
