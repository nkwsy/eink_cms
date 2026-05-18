import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { layouts, devices } from "@/lib/mongo";

// POST /api/layouts/<id>/apply  body: { deviceId, target: "draft" | "live" }
// Copies a template's blocks onto the device's draft (default) or live
// layout. Default is draft so the user can review on /devices/<id> before
// publishing to the field.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "bad layout id" }, { status: 400 });
  const body = await req.json();
  const deviceId = String(body.deviceId ?? "");
  if (!ObjectId.isValid(deviceId)) return NextResponse.json({ error: "bad deviceId" }, { status: 400 });
  const target = body.target === "live" ? "live" : "draft";

  const lcol = await layouts();
  const lay = await lcol.findOne({ _id: new ObjectId(params.id) });
  if (!lay) return NextResponse.json({ error: "layout not found" }, { status: 404 });

  const dcol = await devices();
  const update: Record<string, unknown> = { updatedAt: new Date() };
  // Deep-clone block ids so duplicated blocks don't share keys with the
  // template (matters for the editor's selection model).
  const cloned = (lay.layout as any[]).map((b) => ({ ...b, id: Math.random().toString(36).slice(2, 10) }));
  if (target === "live") update.layout = cloned;
  else update.draftLayout = cloned;

  const r = await dcol.findOneAndUpdate(
    { _id: new ObjectId(deviceId) },
    { $set: update },
    { returnDocument: "after" }
  );
  if (!r) return NextResponse.json({ error: "device not found" }, { status: 404 });
  return NextResponse.json({ ok: true, target, blocks: cloned.length });
}
