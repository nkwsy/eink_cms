// Stored finished images. Promoting a screen draws it once and stores the
// result; the pull URL then hands over the stored copy without drawing
// anything, so a sign that has just been powered on gets its image at once.
import { Binary } from "mongodb";
import {
  Block, DeviceDoc, devices, frames, liveBackups, ObjectId, PublishedRef,
} from "./mongo";
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

/** Deletes a device's stored images that nothing points at any more. */
async function pruneFrames(deviceId: string, keep: Array<string | undefined | null>) {
  const keepIds = keep.filter((k): k is string => !!k && ObjectId.isValid(k)).map((k) => new ObjectId(k));
  const col = await frames();
  await col.deleteMany({ deviceId, _id: { $nin: keepIds } });
}

/**
 * Draws the draft (or the live layout when there is no draft), stores the
 * image and makes it live. The layout and image it replaces are kept so the
 * promote can be undone once.
 */
export async function promoteDevice(device: DeviceDoc): Promise<PublishedRef> {
  const deviceId = String(device._id);
  const source: Block[] =
    device.draftLayout && device.draftLayout.length > 0 ? device.draftLayout : device.layout;
  const frame = await renderLayoutCrisp(device, source, await loadAssetMapForLayout(source));
  const ref = await storeFrame(deviceId, "screen", frame);

  // While calibration is showing, the "real" live image is the one it covered.
  const replacedPublished =
    device.published?.kind === "calibration" ? device.beforeCalibration ?? null : device.published ?? null;
  const backups = await liveBackups();
  await backups.updateOne(
    { deviceId },
    { $set: { deviceId, layout: device.layout, published: replacedPublished, replacedAt: ref.at } },
    { upsert: true }
  );

  const col = await devices();
  await col.updateOne(
    { _id: device._id },
    {
      $set: { layout: source, published: ref, updatedAt: ref.at },
      $unset: { draftLayout: "", beforeCalibration: "" },
    }
  );
  await pruneFrames(deviceId, [ref.frameId, replacedPublished?.frameId]);
  return ref;
}

/** Puts a calibration image on the pull URL without touching the layout. */
export async function showCalibration(device: DeviceDoc, frame: GrayFrame): Promise<PublishedRef> {
  const deviceId = String(device._id);
  const ref = await storeFrame(deviceId, "calibration", frame);
  const covered =
    device.published?.kind === "calibration" ? device.beforeCalibration ?? null : device.published ?? null;
  const col = await devices();
  await col.updateOne({ _id: device._id }, { $set: { published: ref, beforeCalibration: covered } });
  const backup = await (await liveBackups()).findOne({ deviceId });
  await pruneFrames(deviceId, [ref.frameId, covered?.frameId, backup?.published?.frameId]);
  return ref;
}

export type RestoreResult = "calibration-removed" | "previous-live-restored" | "nothing-to-restore";

/**
 * Undoes the last thing that changed the live image:
 * - calibration showing → back to what it covered;
 * - otherwise → swap with the layout and image the last promote replaced
 *   (calling it again swaps back).
 */
export async function restorePrevious(device: DeviceDoc): Promise<RestoreResult> {
  const deviceId = String(device._id);
  const col = await devices();

  if (device.published?.kind === "calibration") {
    const covered = device.beforeCalibration ?? null;
    await col.updateOne(
      { _id: device._id },
      covered
        ? { $set: { published: covered }, $unset: { beforeCalibration: "" } }
        : { $unset: { published: "", beforeCalibration: "" } }
    );
    return "calibration-removed";
  }

  const backups = await liveBackups();
  const backup = await backups.findOne({ deviceId });
  if (!backup) return "nothing-to-restore";
  const now = new Date();
  await backups.updateOne(
    { deviceId },
    { $set: { layout: device.layout, published: device.published ?? null, replacedAt: now } }
  );
  await col.updateOne(
    { _id: device._id },
    backup.published
      ? { $set: { layout: backup.layout, published: backup.published, updatedAt: now } }
      : { $set: { layout: backup.layout, updatedAt: now }, $unset: { published: "" } }
  );
  return "previous-live-restored";
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
