// Versions: every promote, and every "save version", writes a numbered,
// unchanging copy of the screen. Going back to one never rewrites history: it
// loads the version into the draft, and promoting that makes a new version.
//
// A version keeps the layout plus the cards and plugin settings it used.
// Cards and plugins are shared between screens, so going back does not change
// the shared ones: where a card or plugin has changed since, a copy is made as
// it was and only this screen's draft points at the copy.
import {
  AssetDoc, assets as assetsColl, Block, DeviceDoc, devices, FrozenAsset, FrozenPlugin, frames, liveBackups,
  ObjectId, pluginInstances, PublishedRef, VersionDoc, versions,
} from "./mongo";
import { loadAssetMapForLayout } from "./fetch-assets";
import { GrayFrame } from "./frame";
import { renderLayoutCrisp } from "./render-crisp";
import { editorDims } from "./dims";
import { loadFrame, pruneFrames, storeFrame } from "./published";
import {
  changedSince, contentHash, deepHashes, freezeAsset, freezePlugin, repoint, Snapshot, usedBy, versionsToPrune,
} from "./version-core";

// ---- helpers ----

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function draftOf(device: DeviceDoc): Block[] {
  return device.draftLayout && device.draftLayout.length > 0 ? device.draftLayout : device.layout ?? [];
}

function screenOf(device: DeviceDoc): VersionDoc["screen"] {
  return plain({
    width: device.width,
    height: device.height,
    rotation: device.rotation,
    background: device.background,
    inkCutoff: device.inkCutoff,
  });
}

async function reload<T extends DeviceDoc>(device: T): Promise<T> {
  return ((await (await devices()).findOne({ _id: device._id })) as T | null) ?? device;
}

async function loadPlugins(ids: string[]): Promise<Record<string, FrozenPlugin>> {
  const valid = ids.filter((id) => ObjectId.isValid(id));
  if (!valid.length) return {};
  const docs = await (await pluginInstances()).find({ _id: { $in: valid.map((i) => new ObjectId(i)) } }).toArray();
  return Object.fromEntries(docs.map((d) => [String(d._id), plain(freezePlugin(d))]));
}

/** The cards, plugin settings and media a layout uses right now. */
async function snapshotFor(layout: Block[]): Promise<Snapshot & { mediaIds: string[] }> {
  const map = await loadAssetMapForLayout(layout);
  const assets: Record<string, FrozenAsset> = {};
  for (const [id, a] of map) assets[id] = plain(freezeAsset(a));
  const { pluginIds, mediaIds } = usedBy(layout, assets);
  return { assets, plugins: await loadPlugins(pluginIds), mediaIds };
}

let indexed = false;
async function ensureIndex() {
  if (indexed) return;
  indexed = true;
  try {
    await (await versions()).createIndex({ deviceId: 1, number: -1 });
  } catch (e) {
    console.error("[versions] could not create index", e);
  }
}

type NewVersion = {
  kind: VersionDoc["kind"];
  layout: Block[];
  label?: string;
  frame?: PublishedRef | null;
  legacy?: boolean;
  restoredFrom?: number;
  promotedAt?: Date;
  createdAt?: Date;
};

async function createVersion(device: DeviceDoc, input: NewVersion): Promise<VersionDoc> {
  await ensureIndex();
  const counted = await (await devices()).findOneAndUpdate(
    { _id: device._id },
    { $inc: { versionSeq: 1 } },
    { returnDocument: "after", projection: { versionSeq: 1 } }
  );
  if (!counted?.versionSeq) throw new Error("device not found");
  const snap = await snapshotFor(input.layout);
  const doc: VersionDoc = {
    deviceId: String(device._id),
    number: counted.versionSeq,
    kind: input.kind,
    createdAt: input.createdAt ?? new Date(),
    screen: screenOf(device),
    layout: input.layout,
    layoutHash: contentHash(input.layout),
    assets: snap.assets,
    plugins: snap.plugins,
    mediaIds: snap.mediaIds,
  };
  const label = input.label?.trim().slice(0, 120);
  if (label) doc.label = label;
  if (input.frame) doc.frame = input.frame;
  if (input.legacy) doc.legacy = true;
  if (input.restoredFrom != null) doc.restoredFrom = input.restoredFrom;
  if (input.promotedAt) doc.promotedAt = input.promotedAt;
  const r = await (await versions()).insertOne(doc);
  return { ...doc, _id: r.insertedId };
}

/** Drops the oldest versions beyond the limit, then the stored images nothing uses. */
async function tidy(deviceId: string) {
  try {
    const device = await (await devices()).findOne(
      { _id: new ObjectId(deviceId) },
      { projection: { liveVersion: 1, scheduled: 1 } }
    );
    const col = await versions();
    const all = await col.find({ deviceId }, { projection: { number: 1 } }).toArray();
    const drop = versionsToPrune(
      all.map((v) => ({ id: String(v._id), number: v.number })),
      [device?.liveVersion?.id, device?.scheduled?.versionId]
    );
    if (drop.length) await col.deleteMany({ _id: { $in: drop.map((v) => new ObjectId(v.id)) } });
    await pruneFrames(deviceId);
  } catch (e) {
    // Housekeeping only; the next promote tries again.
    console.error("[versions] tidy failed", deviceId, e);
  }
}

// ---- first use ----

/**
 * Gives a device its first versions the first time it is touched after
 * versions shipped: the live layout becomes version 1 (or version 2, when
 * there is a "before the last promote" copy to keep as version 1). Nothing
 * about what the sign shows changes.
 */
export async function ensureVersions<T extends DeviceDoc>(device: T): Promise<T> {
  if (device.versionSeq != null) return device;
  const col = await devices();
  // Claim the job, so two requests arriving together do not both do it.
  const claimed = await col.findOneAndUpdate(
    { _id: device._id, versionSeq: { $exists: false } },
    { $set: { versionSeq: 0 } },
    { returnDocument: "after" }
  );
  if (!claimed) return reload(device);
  const deviceId = String(device._id);
  const live =
    claimed.published?.kind === "calibration" ? claimed.beforeCalibration ?? null : claimed.published ?? null;

  const backup = await (await liveBackups()).findOne({ deviceId });
  if (backup && backup.layout?.length) {
    const at = backup.published?.at ?? claimed.createdAt;
    await createVersion(claimed, {
      kind: "promoted",
      layout: backup.layout,
      frame: backup.published,
      legacy: !backup.published,
      promotedAt: at,
      createdAt: at,
    });
  }
  if ((claimed.layout?.length ?? 0) > 0 || live) {
    const at = live?.at ?? claimed.updatedAt;
    const v = await createVersion(claimed, {
      kind: "promoted",
      layout: claimed.layout ?? [],
      frame: live,
      legacy: !live,
      promotedAt: at,
      createdAt: at,
    });
    await col.updateOne({ _id: device._id }, { $set: { liveVersion: { id: String(v._id), number: v.number } } });
  }
  return reload(device);
}

// ---- reading ----

export type VersionSummary = {
  _id: string;
  number: number;
  kind: VersionDoc["kind"];
  label?: string;
  createdAt: Date;
  promotedAt?: Date;
  restoredFrom?: number;
  legacy: boolean;
  width: number;
  height: number;
  isLive: boolean;
  scheduledFor?: Date;
};

export async function listVersions(device: DeviceDoc): Promise<VersionSummary[]> {
  const docs = await (await versions())
    .find({ deviceId: String(device._id) }, { projection: { layout: 0, assets: 0, plugins: 0, mediaIds: 0 } })
    .sort({ number: -1 })
    .toArray();
  return docs.map((v) => {
    const id = String(v._id);
    const native = editorDims(v.screen);
    return {
      _id: id,
      number: v.number,
      kind: v.kind,
      label: v.label,
      createdAt: v.createdAt,
      promotedAt: v.promotedAt,
      restoredFrom: v.restoredFrom,
      legacy: !!v.legacy,
      width: native.w,
      height: native.h,
      isLive: device.liveVersion?.id === id,
      scheduledFor: device.scheduled?.versionId === id ? device.scheduled.at : undefined,
    };
  });
}

export async function getVersion(deviceId: string, versionId: string): Promise<VersionDoc | null> {
  if (!ObjectId.isValid(versionId)) return null;
  return (await versions()).findOne({ _id: new ObjectId(versionId), deviceId });
}

/**
 * A version's picture. Promoted versions have theirs stored; a checkpoint's
 * is drawn the first time it is asked for and kept.
 */
export async function versionFrame(version: VersionDoc): Promise<GrayFrame> {
  if (version.frame) {
    const stored = await loadFrame(version.frame.frameId);
    if (stored) return stored;
  }
  const assetMap = new Map<string, AssetDoc>();
  const epoch = new Date(0);
  for (const [id, a] of Object.entries(version.assets ?? {})) {
    assetMap.set(id, { ...a, createdAt: epoch, updatedAt: epoch });
  }
  const frame = await renderLayoutCrisp(version.screen, version.layout, assetMap);
  try {
    const ref = await storeFrame(version.deviceId, "screen", frame);
    await (await versions()).updateOne({ _id: version._id }, { $set: { frame: ref } });
  } catch (e) {
    console.error("[versions] could not keep drawn picture", e);
  }
  return frame;
}

// ---- writing ----

/** Saves the draft as a version if no version already holds exactly it. */
async function keepUnsavedDraft(device: DeviceDoc, label: string): Promise<VersionDoc | null> {
  const draft = device.draftLayout;
  if (!draft || draft.length === 0) return null;
  const hash = contentHash(draft);
  const existing = await (await versions()).findOne(
    { deviceId: String(device._id), layoutHash: hash },
    { projection: { _id: 1 } }
  );
  if (existing) return null;
  return createVersion(device, { kind: "saved", layout: draft, label });
}

export async function saveCheckpoint(device: DeviceDoc, label?: string): Promise<VersionDoc> {
  device = await ensureVersions(device);
  const v = await createVersion(device, { kind: "saved", layout: draftOf(device), label });
  await tidy(String(device._id));
  return v;
}

export type PromoteResult =
  | { status: "live"; published: PublishedRef; version: number }
  | { status: "scheduled"; at: Date; version: number };

/**
 * Draws the draft (or the live layout when there is no draft), stores the
 * image and writes a version. Without `at` the version goes live now. With
 * `at` it is stored ready and goes live at that time (see applyDueSchedule).
 */
export async function promoteDevice(
  device: DeviceDoc,
  opts: { at?: Date | null; restoredFrom?: number; label?: string } = {}
): Promise<PromoteResult> {
  device = await ensureVersions(device);
  const deviceId = String(device._id);
  const source = draftOf(device);
  const frame = await renderLayoutCrisp(device, source, await loadAssetMapForLayout(source));
  const ref = await storeFrame(deviceId, "screen", frame);
  const col = await devices();

  if (opts.at) {
    if (device.scheduled) await unschedule(device);
    const v = await createVersion(device, { kind: "scheduled", layout: source, frame: ref, label: opts.label });
    await col.updateOne(
      { _id: device._id },
      { $set: { scheduled: { versionId: String(v._id), number: v.number, at: opts.at } } }
    );
    await tidy(deviceId);
    return { status: "scheduled", at: opts.at, version: v.number };
  }

  const v = await createVersion(device, {
    kind: "promoted",
    layout: source,
    frame: ref,
    promotedAt: ref.at,
    restoredFrom: opts.restoredFrom,
    label: opts.label,
  });
  await col.updateOne(
    { _id: device._id },
    {
      $set: { layout: source, published: ref, liveVersion: { id: String(v._id), number: v.number }, updatedAt: ref.at },
      $unset: { draftLayout: "", beforeCalibration: "" },
    }
  );
  await tidy(deviceId);
  return { status: "live", published: ref, version: v.number };
}

async function unschedule(device: DeviceDoc) {
  if (!device.scheduled) return;
  await (await devices()).updateOne({ _id: device._id }, { $unset: { scheduled: "" } });
  if (ObjectId.isValid(device.scheduled.versionId)) {
    await (await versions()).updateOne(
      { _id: new ObjectId(device.scheduled.versionId), kind: "scheduled" },
      { $set: { kind: "saved" } }
    );
  }
}

/** Calls off a timed promote. The version stays in the list as a checkpoint. */
export async function cancelSchedule(device: DeviceDoc): Promise<boolean> {
  if (!device.scheduled) return false;
  await unschedule(device);
  return true;
}

/**
 * Makes a timed promote live once its time has come. Nothing runs on a timer:
 * this is called whenever the device is looked at or its image is fetched,
 * and it only moves a pointer to an image stored when the promote was set up,
 * so it adds nothing noticeable to a pull.
 */
export async function applyDueSchedule<T extends DeviceDoc>(device: T, now = new Date()): Promise<T> {
  const due = device.scheduled;
  if (!due || new Date(due.at).getTime() > now.getTime()) return device;
  const col = await devices();
  const vcol = await versions();
  const version = ObjectId.isValid(due.versionId)
    ? await vcol.findOne({ _id: new ObjectId(due.versionId) }, { projection: { assets: 0, plugins: 0 } })
    : null;
  if (!version?.frame) {
    await col.updateOne({ _id: device._id, "scheduled.versionId": due.versionId }, { $unset: { scheduled: "" } });
    return reload(device);
  }
  const at = new Date(due.at);
  const ref: PublishedRef = { ...version.frame, at };
  const set: Record<string, unknown> = {
    layout: version.layout,
    liveVersion: { id: due.versionId, number: version.number },
    updatedAt: at,
  };
  const unset: Record<string, ""> = { scheduled: "" };
  // The calibration chart stays up until someone takes it down; the new
  // screen waits underneath it.
  if (device.published?.kind === "calibration") set.beforeCalibration = ref;
  else set.published = ref;
  if (device.draftLayout && contentHash(device.draftLayout) === version.layoutHash) unset.draftLayout = "";
  const r = await col.updateOne(
    { _id: device._id, "scheduled.versionId": due.versionId },
    { $set: set, $unset: unset }
  );
  if (r.modifiedCount) {
    await vcol.updateOne({ _id: version._id }, { $set: { kind: "promoted", promotedAt: at } });
  }
  return reload(device);
}

// ---- going back ----

/**
 * The layout of a version, ready to be used as a draft today. Where a card or
 * plugin it used has changed or been deleted since, a copy is made as it was
 * (or an earlier such copy is reused) and the layout points at the copy.
 */
async function layoutAsItWas(
  version: VersionDoc,
  from: string
): Promise<{ layout: Block[]; copiedCards: number; copiedPlugins: number }> {
  const frozen: Snapshot = { assets: version.assets ?? {}, plugins: version.plugins ?? {} };
  const assetIds = Object.keys(frozen.assets);
  if (assetIds.length === 0 && Object.keys(frozen.plugins).length === 0) {
    return { layout: version.layout, copiedCards: 0, copiedPlugins: 0 };
  }

  const probe = assetIds.map((id) => ({ type: "asset", assetId: id })) as Block[];
  const nowAssets: Record<string, FrozenAsset> = {};
  for (const [id, a] of await loadAssetMapForLayout(probe)) nowAssets[id] = plain(freezeAsset(a));
  const pluginIds = Array.from(new Set([...Object.keys(frozen.plugins), ...usedBy([], nowAssets).pluginIds]));
  const current: Snapshot = { assets: nowAssets, plugins: await loadPlugins(pluginIds) };

  const changed = changedSince(frozen, current);
  if (changed.assets.length === 0 && changed.plugins.length === 0) {
    return { layout: version.layout, copiedCards: 0, copiedPlugins: 0 };
  }
  const was = deepHashes(frozen);
  const now = new Date();

  const pluginMap: Record<string, string> = {};
  const pcol = await pluginInstances();
  for (const id of changed.plugins) {
    const hash = was.plugins[id];
    const earlier = await pcol.find({ "copiedFrom.id": id, "copiedFrom.hash": hash }).toArray();
    const reuse = earlier.find((d) => contentHash(freezePlugin(d)) === d.copiedFrom?.selfHash);
    if (reuse) {
      pluginMap[id] = String(reuse._id);
      continue;
    }
    const content = plain({ ...frozen.plugins[id], name: `${frozen.plugins[id].name} (${from})` });
    const r = await pcol.insertOne({
      ...content,
      copiedFrom: { id, hash, selfHash: contentHash(content) },
      createdAt: now,
      updatedAt: now,
    });
    pluginMap[id] = String(r.insertedId);
  }

  const assetMap: Record<string, string> = {};
  const acol = await assetsColl();
  for (const id of changed.assets) {
    const hash = was.assets[id];
    const earlier = await acol.find({ "copiedFrom.id": id, "copiedFrom.hash": hash }).toArray();
    const reuse = earlier.find((d) => contentHash(freezeAsset(d)) === d.copiedFrom?.selfHash);
    if (reuse) {
      assetMap[id] = String(reuse._id);
      continue;
    }
    const a = frozen.assets[id];
    const content = plain({ ...a, name: `${a.name} (${from})`, layout: repoint(a.layout, assetMap, pluginMap) });
    const r = await acol.insertOne({
      ...content,
      copiedFrom: { id, hash, selfHash: contentHash(content) },
      createdAt: now,
      updatedAt: now,
    });
    assetMap[id] = String(r.insertedId);
  }

  return {
    layout: repoint(version.layout, assetMap, pluginMap),
    copiedCards: changed.assets.length,
    copiedPlugins: changed.plugins.length,
  };
}

export type RestoreResult = {
  draftLayout: Block[];
  draftRev: number;
  background?: DeviceDoc["background"];
  inkCutoff?: number;
  keptDraftAs: number | null;
  copiedCards: number;
  copiedPlugins: number;
};

/**
 * Loads a version into the draft. The sign is not touched. A draft that no
 * version holds yet is saved as a version first, so nothing is lost.
 */
export async function restoreToDraft(device: DeviceDoc, version: VersionDoc): Promise<RestoreResult> {
  device = await ensureVersions(device);
  const kept = await keepUnsavedDraft(device, `Draft before going back to version ${version.number}`);
  const made = await layoutAsItWas(version, `${device.name} v${version.number}`);
  const set: Record<string, unknown> = { draftLayout: made.layout };
  // Text weight and background are part of how the version looked. They are
  // only put back on screens with a stored live image, where changing them
  // cannot alter what the sign shows before the next promote.
  if (device.published) {
    if (version.screen.background) set.background = version.screen.background;
    if (version.screen.inkCutoff != null) set.inkCutoff = version.screen.inkCutoff;
  }
  const after = await (await devices()).findOneAndUpdate(
    { _id: device._id },
    { $set: set, $inc: { draftRev: 1 } },
    { returnDocument: "after" }
  );
  if (!after) throw new Error("device not found");
  await tidy(String(device._id));
  return {
    draftLayout: made.layout,
    draftRev: after.draftRev ?? 0,
    background: after.background,
    inkCutoff: after.inkCutoff,
    keptDraftAs: kept?.number ?? null,
    copiedCards: made.copiedCards,
    copiedPlugins: made.copiedPlugins,
  };
}

/**
 * Puts a version back on the sign. It is drawn again with today's plugin
 * data and becomes a new version; the list of versions is never rewritten.
 */
export async function makeLive(device: DeviceDoc, version: VersionDoc): Promise<PromoteResult | { status: "legacy"; version: number }> {
  device = await ensureVersions(device);
  if (version.legacy) {
    // A screen from before the crisp renderer: put it back as it was, drawn
    // by the old renderer on each pull.
    await keepUnsavedDraft(device, `Draft before going back to version ${version.number}`);
    const v = await createVersion(device, {
      kind: "promoted",
      layout: version.layout,
      legacy: true,
      restoredFrom: version.number,
      promotedAt: new Date(),
    });
    await (await devices()).updateOne(
      { _id: device._id },
      {
        $set: { layout: version.layout, liveVersion: { id: String(v._id), number: v.number }, updatedAt: new Date() },
        $unset: { published: "", beforeCalibration: "", draftLayout: "" },
        $inc: { draftRev: 1 },
      }
    );
    await tidy(String(device._id));
    return { status: "legacy", version: v.number };
  }
  await restoreToDraft(device, version);
  return promoteDevice(await reload(device), { restoredFrom: version.number });
}

/**
 * Copies a screen onto another device's draft: either a saved version or the
 * source's current draft. The target's sign is not touched.
 */
export async function copyToDevice(
  source: DeviceDoc,
  from: VersionDoc | "draft",
  target: DeviceDoc
): Promise<{ blocks: number; sizeDiffers: boolean; keptDraftAs: number | null }> {
  const what = from === "draft" ? source.name : `${source.name} version ${from.number}`;
  const layout =
    from === "draft" ? draftOf(source) : (await layoutAsItWas(from, `${source.name} v${from.number}`)).layout;
  const done = await replaceDraft(target, layout, `Draft before copying ${what}`);
  const a = editorDims(from === "draft" ? source : from.screen);
  const b = editorDims(target);
  return { ...done, sizeDiffers: a.w !== b.w || a.h !== b.h };
}

/**
 * Replaces a device's draft with a layout from somewhere else (another
 * screen, a template). A draft that no version holds yet is saved as a
 * version first. Blocks get fresh ids so the copy never shares ids with where
 * it came from.
 */
export async function replaceDraft(
  target: DeviceDoc,
  layout: Block[],
  keepLabel: string
): Promise<{ blocks: number; keptDraftAs: number | null }> {
  target = await ensureVersions(target);
  const kept = await keepUnsavedDraft(target, keepLabel);
  const copied = layout.map((b) => ({ ...b, id: Math.random().toString(36).slice(2, 10) }));
  await (await devices()).updateOne(
    { _id: target._id },
    { $set: { draftLayout: copied, updatedAt: new Date() }, $inc: { draftRev: 1 } }
  );
  await tidy(String(target._id));
  return { blocks: copied.length, keptDraftAs: kept?.number ?? null };
}

// ---- upkeep ----

/** Versions that still need a media item, so it must not be deleted. */
export async function versionsUsingMedia(mediaId: string): Promise<Array<{ deviceId: string; number: number }>> {
  const docs = await (await versions())
    .find({ mediaIds: mediaId }, { projection: { deviceId: 1, number: 1 } })
    .limit(20)
    .toArray();
  return docs.map((d) => ({ deviceId: d.deviceId, number: d.number }));
}

/** Removes everything kept for a device that is being deleted. */
export async function forgetDevice(deviceId: string) {
  await (await versions()).deleteMany({ deviceId });
  await (await frames()).deleteMany({ deviceId });
  await (await liveBackups()).deleteMany({ deviceId });
}
