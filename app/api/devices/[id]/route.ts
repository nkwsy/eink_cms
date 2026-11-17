import { NextRequest, NextResponse } from "next/server";
import { ObjectId, devices } from "@/lib/mongo";
import { slugify } from "@/lib/slug";
import { clampCutoff } from "@/lib/render-crisp";
import { forgetDevice } from "@/lib/versions";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const col = await devices();
  const doc = await col.findOne({ _id: new ObjectId(params.id) });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ...doc, _id: String(doc._id) });
}

// Saves device settings and/or the draft. The editor autosaves the draft and
// sends `baseDraftRev`, the draft number it last saw: if the draft has been
// written from somewhere else since, the save is refused (409) instead of
// overwriting it.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const body = await req.json();
  const col = await devices();
  const update: any = { updatedAt: new Date() };
  if (body.name != null) update.name = String(body.name);
  if (body.slug != null) update.slug = slugify(String(body.slug));
  if (body.width != null) update.width = Number(body.width);
  if (body.height != null) update.height = Number(body.height);
  if (body.rotation != null) update.rotation = Number(body.rotation);
  if (body.bitDepth != null) update.bitDepth = Number(body.bitDepth) === 24 ? 24 : 1;
  if (body.layout != null) update.layout = body.layout;
  if (body.background != null) update.background = body.background === "black" ? "black" : "white";
  if (body.inkCutoff != null) update.inkCutoff = clampCutoff(Number(body.inkCutoff));
  if (body.model != null) update.model = slugify(String(body.model));

  const _id = new ObjectId(params.id);
  const filter: any = { _id };
  const change: any = { $set: update };
  if (body.draftLayout !== undefined) {
    if (!Array.isArray(body.draftLayout)) return NextResponse.json({ error: "draftLayout must be a list" }, { status: 400 });
    update.draftLayout = body.draftLayout;
    change.$inc = { draftRev: 1 };
    if (body.baseDraftRev != null) {
      const base = Number(body.baseDraftRev);
      if (base === 0) filter.$or = [{ draftRev: { $exists: false } }, { draftRev: 0 }];
      else filter.draftRev = base;
    }
  }
  if (update.slug) {
    const taken = await col.findOne({ slug: update.slug, _id: { $ne: _id } }, { projection: { _id: 1 } });
    if (taken) return NextResponse.json({ error: "Another device already uses that slug." }, { status: 409 });
  }

  const r = await col.findOneAndUpdate(filter, change, {
    returnDocument: "after",
    projection: { layout: 0, draftLayout: 0 },
  });
  if (!r) {
    const current = await col.findOne({ _id }, { projection: { draftRev: 1 } });
    if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(
      { error: "The draft was changed somewhere else.", conflict: true, draftRev: current.draftRev ?? 0 },
      { status: 409 }
    );
  }
  return NextResponse.json({ ...r, _id: String(r._id), draftRev: r.draftRev ?? 0 });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const col = await devices();
  await col.deleteOne({ _id: new ObjectId(params.id) });
  await forgetDevice(params.id);
  return NextResponse.json({ ok: true });
}
