import { NextRequest, NextResponse } from "next/server";
import { ObjectId, devices } from "@/lib/mongo";
import { removeCalibration } from "@/lib/published";

// Takes the calibration chart off the sign and puts back what it covered.
// Going back to an earlier screen is done through versions instead.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const col = await devices();
  const doc = await col.findOne({ _id: new ObjectId(params.id) });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await removeCalibration(doc))) {
    return NextResponse.json({ error: "The calibration chart is not showing." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, result: "calibration-removed" });
}
