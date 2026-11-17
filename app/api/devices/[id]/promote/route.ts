import { NextRequest, NextResponse } from "next/server";
import { ObjectId, devices } from "@/lib/mongo";
import { promoteDevice } from "@/lib/versions";
import { parsePromoteAt } from "@/lib/version-core";

// Draws the draft with the crisp renderer, stores the finished image and
// writes a numbered version. Without a time it is live from this moment: the
// pull URL serves the stored image, so the sign can be powered on straight
// away. With body { at: <ISO time> } the stored image goes live at that time.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const when = parsePromoteAt(body?.at, new Date());
  if (when.error) return NextResponse.json({ error: when.error }, { status: 400 });
  const col = await devices();
  const doc = await col.findOne({ _id: new ObjectId(params.id) });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const result = await promoteDevice(doc, { at: when.at, label: body?.label ? String(body.label) : undefined });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[promote] failed", params.id, e);
    return NextResponse.json({ error: e?.message ?? "promote failed" }, { status: 500 });
  }
}
