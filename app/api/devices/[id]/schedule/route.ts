import { NextRequest, NextResponse } from "next/server";
import { ObjectId, devices } from "@/lib/mongo";
import { cancelSchedule } from "@/lib/versions";

// DELETE: call off a timed promote. Its version stays in the list.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const doc = await (await devices()).findOne({ _id: new ObjectId(params.id) });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await cancelSchedule(doc))) return NextResponse.json({ error: "Nothing is scheduled." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
