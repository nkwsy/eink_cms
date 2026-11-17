import { NextRequest, NextResponse } from "next/server";
import { ObjectId, devices } from "@/lib/mongo";
import { applyDueSchedule } from "@/lib/versions";

// Small summary of what is live and whether the sign has fetched it. The
// device page polls this, so it must not return the layouts themselves.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  let doc = await (await devices()).findOne({ _id: new ObjectId(params.id) });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  doc = await applyDueSchedule(doc);
  const hasDraft = !!doc.draftLayout && doc.draftLayout.length > 0;
  return NextResponse.json({
    published: doc.published ?? null,
    lastPull: doc.lastPull ?? null,
    pullCount: doc.pullCount ?? 0,
    draftDiffers: hasDraft && JSON.stringify(doc.draftLayout) !== JSON.stringify(doc.layout),
    sizeMatches: !doc.published || (doc.published.width === doc.width && doc.published.height === doc.height),
    draftRev: doc.draftRev ?? 0,
    liveVersion: doc.liveVersion?.number ?? null,
    scheduled: doc.scheduled ? { number: doc.scheduled.number, at: doc.scheduled.at } : null,
  });
}
