import { NextRequest, NextResponse } from "next/server";
import { ObjectId, devices } from "@/lib/mongo";
import { promoteDevice } from "@/lib/published";

// Draws the draft with the crisp renderer, stores the finished image and makes
// it live. From this moment the pull URL serves the stored image, so the sign
// can be powered on straight away.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const col = await devices();
  const doc = await col.findOne({ _id: new ObjectId(params.id) });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const published = await promoteDevice(doc);
    return NextResponse.json({ ok: true, published });
  } catch (e: any) {
    console.error("[promote] failed", params.id, e);
    return NextResponse.json({ error: e?.message ?? "promote failed" }, { status: 500 });
  }
}
