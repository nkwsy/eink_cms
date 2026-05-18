import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { layouts } from "@/lib/mongo";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const col = await layouts();
  const d = await col.findOne({ _id: new ObjectId(params.id) });
  if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ...d, _id: String(d._id) });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const body = await req.json();
  const col = await layouts();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["name", "width", "height", "background", "layout"] as const) {
    if (k in body) patch[k] = body[k];
  }
  const r = await col.findOneAndUpdate(
    { _id: new ObjectId(params.id) },
    { $set: patch },
    { returnDocument: "after" }
  );
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ...r, _id: String(r._id) });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const col = await layouts();
  await col.deleteOne({ _id: new ObjectId(params.id) });
  return NextResponse.json({ ok: true });
}
