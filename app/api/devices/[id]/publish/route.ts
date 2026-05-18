import { NextRequest, NextResponse } from "next/server";
import { ObjectId, devices } from "@/lib/mongo";

// Copy draftLayout → layout. The public pull endpoint always serves the
// live `layout` field, so until you publish, drafts are invisible to
// devices in the field.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const col = await devices();
  const doc = await col.findOne({ _id: new ObjectId(params.id) });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!doc.draftLayout || doc.draftLayout.length === 0) {
    return NextResponse.json({ error: "no draft to publish" }, { status: 400 });
  }
  const now = new Date();
  await col.updateOne(
    { _id: doc._id },
    { $set: { layout: doc.draftLayout, draftLayout: undefined, updatedAt: now } }
  );
  return NextResponse.json({ ok: true });
}
