import { NextRequest, NextResponse } from "next/server";
import { ObjectId, devices } from "@/lib/mongo";
import { slugify } from "@/lib/slug";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const col = await devices();
  const doc = await col.findOne({ _id: new ObjectId(params.id) });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ...doc, _id: String(doc._id) });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const col = await devices();
  const update: any = { updatedAt: new Date() };
  if (body.name != null) update.name = String(body.name);
  if (body.slug != null) update.slug = slugify(String(body.slug));
  if (body.width != null) update.width = Number(body.width);
  if (body.height != null) update.height = Number(body.height);
  if (body.rotation != null) update.rotation = Number(body.rotation);
  if (body.layout != null) update.layout = body.layout;
  if (body.background != null) update.background = body.background === "black" ? "black" : "white";

  const r = await col.findOneAndUpdate(
    { _id: new ObjectId(params.id) },
    { $set: update },
    { returnDocument: "after" }
  );
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ...r, _id: String(r._id) });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const col = await devices();
  await col.deleteOne({ _id: new ObjectId(params.id) });
  return NextResponse.json({ ok: true });
}
