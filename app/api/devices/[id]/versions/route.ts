import { NextRequest, NextResponse } from "next/server";
import { ObjectId, devices } from "@/lib/mongo";
import { applyDueSchedule, ensureVersions, listVersions, saveCheckpoint } from "@/lib/versions";

export const dynamic = "force-dynamic";

// GET: this device's versions, newest first, without their layouts.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  let doc = await (await devices()).findOne({ _id: new ObjectId(params.id) });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  doc = await applyDueSchedule(await ensureVersions(doc));
  return NextResponse.json({ versions: await listVersions(doc) });
}

// POST { label? }: save the draft as a version ("save version").
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const doc = await (await devices()).findOne({ _id: new ObjectId(params.id) });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const v = await saveCheckpoint(doc, body?.label ? String(body.label) : undefined);
  return NextResponse.json({ ok: true, number: v.number, _id: String(v._id) });
}
