import { NextRequest, NextResponse } from "next/server";
import { ObjectId, devices } from "@/lib/mongo";
import { restorePrevious } from "@/lib/published";

// Undoes the last change to the live image: removes the calibration screen,
// or swaps back to the layout and image the last promote replaced.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const col = await devices();
  const doc = await col.findOne({ _id: new ObjectId(params.id) });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const result = await restorePrevious(doc);
  if (result === "nothing-to-restore") {
    return NextResponse.json({ error: "nothing to restore" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, result });
}
