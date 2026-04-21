import { NextRequest, NextResponse } from "next/server";
import { assets, devices } from "@/lib/mongo";
import { PRESET_FACTORIES } from "@/lib/presets";
import { wildMileDeviceDoc, type AssetIds } from "@/lib/seed-wildmile";

// Seeds the full legacy "Wild Mile" banner:
//   1. Ensures the preset assets exist (event, activity, activity-dated,
//      callout, title-bar).
//   2. Upserts the "wild-mile" device, wiring asset-instance blocks to the
//      preset asset _ids.
export async function POST(_req: NextRequest) {
  const col = await assets();
  const now = new Date();
  const keyToId: Record<string, string> = {};
  const created: string[] = [];

  for (const f of PRESET_FACTORIES) {
    const doc = f.make();
    let existing = await col.findOne({ name: doc.name });
    if (!existing) {
      const r = await col.insertOne({ ...doc, createdAt: now, updatedAt: now } as any);
      keyToId[f.key] = String(r.insertedId);
      created.push(doc.name);
    } else {
      keyToId[f.key] = String(existing._id);
    }
  }

  const ids: AssetIds = {
    event: keyToId["event"],
    activity: keyToId["activity"],
    activityDated: keyToId["activity_dated"],
    callout: keyToId["callout"],
    titleBar: keyToId["title_bar"],
  };

  const dcol = await devices();
  const device = wildMileDeviceDoc(ids);
  const existingDevice = await dcol.findOne({ slug: device.slug });
  let deviceId: string;
  if (existingDevice) {
    await dcol.updateOne(
      { _id: existingDevice._id },
      { $set: { ...device, updatedAt: now } as any }
    );
    deviceId = String(existingDevice._id);
  } else {
    const r = await dcol.insertOne({ ...device, createdAt: now, updatedAt: now } as any);
    deviceId = String(r.insertedId);
  }

  return NextResponse.json({
    assetsCreated: created,
    assetIds: ids,
    deviceId,
    slug: device.slug,
  });
}
