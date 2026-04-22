import { NextRequest, NextResponse } from "next/server";
import { ObjectId, assets } from "@/lib/mongo";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const col = await assets();
  const doc = await col.findOne({ _id: new ObjectId(params.id) });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ...doc, _id: String(doc._id) });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const col = await assets();
  const update: any = { updatedAt: new Date() };
  for (const k of ["name", "width", "height", "layout", "variables", "background"] as const) {
    if (body[k] != null) update[k] = k === "name" ? String(body[k]) : body[k];
    if (k === "width" || k === "height") if (body[k] != null) update[k] = Number(body[k]);
  }
  const r = await col.findOneAndUpdate(
    { _id: new ObjectId(params.id) },
    { $set: update },
    { returnDocument: "after" }
  );
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ...r, _id: String(r._id) });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const col = await assets();
  await col.deleteOne({ _id: new ObjectId(params.id) });
  return NextResponse.json({ ok: true });
}
