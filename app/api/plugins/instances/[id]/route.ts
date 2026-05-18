import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { pluginInstances } from "@/lib/mongo";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const col = await pluginInstances();
  const d = await col.findOne({ _id: new ObjectId(params.id) });
  if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ...d, _id: String(d._id) });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const body = await req.json();
  const col = await pluginInstances();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["name", "width", "height", "settings", "ttlSec"] as const) {
    if (k in body) patch[k] = body[k];
  }
  // A settings change invalidates the cache — clear lastDataHash so the
  // next pull regenerates even within TTL.
  if ("settings" in body) patch.lastDataHash = null;
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
  const col = await pluginInstances();
  await col.deleteOne({ _id: new ObjectId(params.id) });
  return NextResponse.json({ ok: true });
}
