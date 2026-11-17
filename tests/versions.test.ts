// Versions against a real database. Needs a MongoDB to talk to: set
// TEST_MONGODB_URI, or run one on 127.0.0.1:27017. Without one these tests are
// skipped. Everything happens in a throwaway database that is dropped at the end.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient } from "mongodb";
import type { Block, DeviceDoc } from "@/lib/mongo";
import { block } from "./helpers";

const uri = process.env.TEST_MONGODB_URI ?? "mongodb://127.0.0.1:27017";
const dbName = `eink_cms_test_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function reachable(): Promise<boolean> {
  const c = new MongoClient(uri, { serverSelectionTimeoutMS: 1500 });
  try {
    await c.connect();
    await c.db(dbName).command({ ping: 1 });
    return true;
  } catch {
    return false;
  } finally {
    await c.close().catch(() => {});
  }
}

const available = await reachable();
if (!available) console.warn(`[versions.test] no MongoDB at ${uri}; skipping`);

type Mongo = typeof import("@/lib/mongo");
type Versions = typeof import("@/lib/versions");
type Published = typeof import("@/lib/published");
let m: Mongo, v: Versions, p: Published;

beforeAll(async () => {
  if (!available) return;
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = dbName;
  m = await import("@/lib/mongo");
  v = await import("@/lib/versions");
  p = await import("@/lib/published");
});

afterAll(async () => {
  if (!available) return;
  const db = await m.getDb();
  await db.dropDatabase();
  await (await global._mongoClient)?.close();
  global._mongoClient = undefined;
});

const text = (t: string): Block =>
  block({ type: "text", x: 4, y: 4, w: 180, h: 40, text: t, fontFamily: "houschka-bold", fontSize: 24 });

let n = 0;
async function newDevice(over: Partial<DeviceDoc> = {}) {
  const now = new Date();
  const doc: DeviceDoc = {
    slug: `test-${++n}`,
    name: `Test ${n}`,
    width: 200,
    height: 100,
    rotation: 0,
    background: "black",
    bitDepth: 24,
    layout: [],
    createdAt: now,
    updatedAt: now,
    ...over,
  };
  const r = await (await m.devices()).insertOne(doc);
  return fresh(String(r.insertedId));
}
async function fresh(id: string) {
  const d = await (await m.devices()).findOne({ _id: new m.ObjectId(id) });
  if (!d) throw new Error("device gone");
  return d;
}
async function setDraft(id: string, layout: Block[]) {
  await (await m.devices()).updateOne({ _id: new m.ObjectId(id) }, { $set: { draftLayout: layout }, $inc: { draftRev: 1 } });
  return fresh(id);
}
async function numbers(id: string) {
  return (await v.listVersions(await fresh(id))).map((x) => x.number);
}
async function versionNo(id: string, number: number) {
  const doc = await (await m.versions()).findOne({ deviceId: id, number });
  if (!doc) throw new Error(`no version ${number}`);
  return doc;
}

describe.skipIf(!available)("versions", () => {
  it("turns a screen that was live before versions into version 1 without changing it", async () => {
    const d = await newDevice({ layout: [text("old")] });
    const id = String(d._id);
    const after = await v.ensureVersions(d);
    expect(after.liveVersion?.number).toBe(1);
    expect(after.published).toBeUndefined();
    expect(after.layout).toEqual(d.layout);
    const v1 = await versionNo(id, 1);
    expect(v1.kind).toBe("promoted");
    expect(v1.legacy).toBe(true);
    // A second call does nothing.
    await v.ensureVersions(await fresh(id));
    expect(await numbers(id)).toEqual([1]);
  });

  it("keeps the 'before the last promote' copy as version 1 and the live screen as version 2", async () => {
    const d = await newDevice({ layout: [text("now")] });
    const id = String(d._id);
    const frame = { width: 200, height: 100, data: new Uint8Array(200 * 100) };
    const ref = await p.storeFrame(id, "screen", frame);
    await (await m.devices()).updateOne({ _id: d._id }, { $set: { published: ref } });
    await (await m.liveBackups()).insertOne({ deviceId: id, layout: [text("before")], published: null, replacedAt: new Date() });
    const after = await v.ensureVersions(await fresh(id));
    expect(await numbers(id)).toEqual([2, 1]);
    expect(after.liveVersion?.number).toBe(2);
    expect(after.published?.frameId).toBe(ref.frameId);
    expect((await versionNo(id, 1)).layout[0].text).toBe("before");
    expect((await versionNo(id, 2)).frame?.frameId).toBe(ref.frameId);
  });

  it("gives an empty new device no versions until its first promote", async () => {
    const d = await newDevice();
    const id = String(d._id);
    await v.ensureVersions(d);
    expect(await numbers(id)).toEqual([]);
    const r = await v.promoteDevice(await setDraft(id, [text("first")]));
    expect(r).toMatchObject({ status: "live", version: 1 });
    const after = await fresh(id);
    expect(after.liveVersion?.number).toBe(1);
    expect(after.published?.kind).toBe("screen");
    expect(after.draftLayout).toBeUndefined();
    expect(after.layout[0].text).toBe("first");
    expect(await p.liveFrame(after)).not.toBeNull();
  });

  it("saves checkpoints, and going back keeps an unsaved draft as a version", async () => {
    const d = await newDevice();
    const id = String(d._id);
    await v.promoteDevice(await setDraft(id, [text("one")]));                      // v1
    const cp = await v.saveCheckpoint(await setDraft(id, [text("two")]), "  Two  "); // v2
    expect(cp.number).toBe(2);
    expect(cp.label).toBe("Two");
    expect(cp.kind).toBe("saved");

    const before = await setDraft(id, [text("three, unsaved")]);
    const r = await v.restoreToDraft(before, await versionNo(id, 1));
    expect(r.keptDraftAs).toBe(3);
    expect(r.draftLayout[0].text).toBe("one");
    expect(r.draftRev).toBe((before.draftRev ?? 0) + 1);
    const after = await fresh(id);
    expect(after.draftLayout?.[0].text).toBe("one");
    expect(after.layout[0].text).toBe("one");
    expect((await versionNo(id, 3)).layout[0].text).toBe("three, unsaved");

    // The draft is now version 1's layout, which a version already holds.
    const again = await v.restoreToDraft(after, await versionNo(id, 2));
    expect(again.keptDraftAs).toBeNull();
    expect(await numbers(id)).toEqual([3, 2, 1]);
  });

  it("puts an earlier version back on the sign as a new version", async () => {
    const d = await newDevice();
    const id = String(d._id);
    await v.promoteDevice(await setDraft(id, [text("A")])); // v1
    await v.promoteDevice(await setDraft(id, [text("B")])); // v2
    const r = await v.makeLive(await fresh(id), await versionNo(id, 1));
    expect(r).toMatchObject({ status: "live", version: 3 });
    const after = await fresh(id);
    expect(after.layout[0].text).toBe("A");
    expect(after.liveVersion?.number).toBe(3);
    expect((await versionNo(id, 3)).restoredFrom).toBe(1);
    // Same layout drawn again gives the same picture.
    expect(after.published?.sha256).toBe((await versionNo(id, 1)).frame?.sha256);
    const list = await v.listVersions(after);
    expect(list.filter((x) => x.isLive).map((x) => x.number)).toEqual([3]);
  });

  it("uses a copy of a card as it was when the card has changed since", async () => {
    const acol = await m.assets();
    const now = new Date();
    const a = await acol.insertOne({
      name: "Event row", width: 180, height: 40, background: "black", layout: [text("card v1")], createdAt: now, updatedAt: now,
    });
    const cardId = String(a.insertedId);
    const useCard = block({ type: "asset", x: 0, y: 0, w: 180, h: 40, assetId: cardId });

    const d = await newDevice();
    const id = String(d._id);
    await v.promoteDevice(await setDraft(id, [useCard])); // v1, card as "card v1"
    const v1 = await versionNo(id, 1);
    expect(v1.assets[cardId].layout[0].text).toBe("card v1");

    // Unchanged card: going back points at the same card.
    const same = await v.restoreToDraft(await fresh(id), v1);
    expect(same.copiedCards).toBe(0);
    expect(same.draftLayout[0].assetId).toBe(cardId);

    await acol.updateOne({ _id: a.insertedId }, { $set: { layout: [text("card v2")] } });
    const r = await v.restoreToDraft(await fresh(id), v1);
    expect(r.copiedCards).toBe(1);
    const copyId = r.draftLayout[0].assetId!;
    expect(copyId).not.toBe(cardId);
    const copy = await acol.findOne({ _id: new m.ObjectId(copyId) });
    expect(copy?.layout[0].text).toBe("card v1");
    expect(copy?.name).toContain("Event row");
    expect(copy?.copiedFrom?.id).toBe(cardId);
    // The shared card is left as it is now.
    expect((await acol.findOne({ _id: a.insertedId }))?.layout[0].text).toBe("card v2");

    // Going back again reuses the copy instead of making another.
    const count = await acol.countDocuments({ "copiedFrom.id": cardId });
    const r2 = await v.restoreToDraft(await fresh(id), v1);
    expect(r2.draftLayout[0].assetId).toBe(copyId);
    expect(await acol.countDocuments({ "copiedFrom.id": cardId })).toBe(count);
  });

  it("stores a timed promote now and makes it live when its time comes", async () => {
    const d = await newDevice();
    const id = String(d._id);
    await v.promoteDevice(await setDraft(id, [text("now")])); // v1
    const at = new Date(Date.now() + 3600_000);
    const r = await v.promoteDevice(await setDraft(id, [text("later")]), { at });
    expect(r).toMatchObject({ status: "scheduled", version: 2 });

    let dev = await fresh(id);
    expect(dev.layout[0].text).toBe("now");
    expect(dev.scheduled?.number).toBe(2);
    expect((await versionNo(id, 2)).frame).toBeTruthy();

    dev = await v.applyDueSchedule(dev, new Date(at.getTime() - 1000));
    expect(dev.liveVersion?.number).toBe(1);

    dev = await v.applyDueSchedule(dev, new Date(at.getTime() + 1000));
    expect(dev.liveVersion?.number).toBe(2);
    expect(dev.layout[0].text).toBe("later");
    expect(dev.scheduled).toBeUndefined();
    expect(dev.draftLayout).toBeUndefined();
    expect(dev.published?.frameId).toBe((await versionNo(id, 2)).frame?.frameId);
    expect(new Date(dev.published!.at).getTime()).toBe(at.getTime());
    expect((await versionNo(id, 2)).kind).toBe("promoted");
  });

  it("calls off a timed promote and keeps its version as a checkpoint", async () => {
    const d = await newDevice();
    const id = String(d._id);
    await v.promoteDevice(await setDraft(id, [text("now")]));
    await v.promoteDevice(await setDraft(id, [text("later")]), { at: new Date(Date.now() + 3600_000) });
    expect(await v.cancelSchedule(await fresh(id))).toBe(true);
    const dev = await v.applyDueSchedule(await fresh(id), new Date(Date.now() + 2 * 3600_000));
    expect(dev.liveVersion?.number).toBe(1);
    expect((await versionNo(id, 2)).kind).toBe("saved");
    expect(await v.cancelSchedule(dev)).toBe(false);
  });

  it("keeps the newest 50 versions and never drops the live one", async () => {
    const d = await newDevice();
    const id = String(d._id);
    await v.promoteDevice(await setDraft(id, [text("live")])); // v1, stays live
    for (let i = 0; i < 52; i++) await v.saveCheckpoint(await setDraft(id, [text(`cp ${i}`)]));
    const kept = await numbers(id);
    expect(kept.length).toBe(50);
    expect(kept).toContain(1);
    expect(kept[0]).toBe(53);
    expect(kept).not.toContain(2);
    // The live picture is still there.
    expect(await p.loadFrame((await fresh(id)).published!.frameId)).not.toBeNull();
  });

  it("copies a version or a draft to another device's draft, keeping what was there", async () => {
    const a = await newDevice();
    const b = await newDevice({ width: 400, height: 100 });
    const aId = String(a._id), bId = String(b._id);
    await v.promoteDevice(await setDraft(aId, [text("from A")]));
    await setDraft(bId, [text("B's own draft")]);

    const r = await v.copyToDevice(await fresh(aId), await versionNo(aId, 1), await fresh(bId));
    expect(r).toMatchObject({ blocks: 1, sizeDiffers: true, keptDraftAs: 1 });
    const bAfter = await fresh(bId);
    expect(bAfter.draftLayout?.[0].text).toBe("from A");
    expect(bAfter.draftLayout?.[0].id).not.toBe((await versionNo(aId, 1)).layout[0].id);
    expect(bAfter.published).toBeUndefined();
    expect((await versionNo(bId, 1)).layout[0].text).toBe("B's own draft");

    const r2 = await v.copyToDevice(await setDraft(aId, [text("A draft")]), "draft", bAfter);
    expect(r2.keptDraftAs).toBe(2);
    expect((await fresh(bId)).draftLayout?.[0].text).toBe("A draft");
  });

  it("knows which media saved versions still need", async () => {
    const d = await newDevice();
    const id = String(d._id);
    const mediaId = new m.ObjectId().toHexString();
    await v.saveCheckpoint(await setDraft(id, [block({ type: "image", x: 0, y: 0, w: 10, h: 10, mediaId })]));
    expect(await v.versionsUsingMedia(mediaId)).toEqual([{ deviceId: id, number: 1 }]);
    expect(await v.versionsUsingMedia(new m.ObjectId().toHexString())).toEqual([]);
  });

  it("draws a checkpoint's picture on demand and keeps it", async () => {
    const d = await newDevice();
    const id = String(d._id);
    const cp = await v.saveCheckpoint(await setDraft(id, [text("picture")]));
    expect(cp.frame).toBeUndefined();
    const frame = await v.versionFrame(cp);
    expect([frame.width, frame.height]).toEqual([200, 100]);
    expect((await versionNo(id, cp.number)).frame?.sha256).toBeTruthy();
  });

  it("removes versions and pictures with their device", async () => {
    const d = await newDevice();
    const id = String(d._id);
    await v.promoteDevice(await setDraft(id, [text("bye")]));
    await v.forgetDevice(id);
    expect(await (await m.versions()).countDocuments({ deviceId: id })).toBe(0);
    expect(await (await m.frames()).countDocuments({ deviceId: id })).toBe(0);
  });
});
