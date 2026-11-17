import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { layouts, devices } from "@/lib/mongo";
import { replaceDraft } from "@/lib/versions";

// POST /api/layouts/<id>/apply  body: { deviceId }
// Copies a template's blocks onto the device's draft. Templates always land
// in the draft: the live image only changes through a promote, which is what
// draws and stores it. A draft that no version holds yet is saved as a
// version first.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "bad layout id" }, { status: 400 });
  const body = await req.json();
  const deviceId = String(body.deviceId ?? "");
  if (!ObjectId.isValid(deviceId)) return NextResponse.json({ error: "bad deviceId" }, { status: 400 });

  const lay = await (await layouts()).findOne({ _id: new ObjectId(params.id) });
  if (!lay) return NextResponse.json({ error: "layout not found" }, { status: 404 });
  const device = await (await devices()).findOne({ _id: new ObjectId(deviceId) });
  if (!device) return NextResponse.json({ error: "device not found" }, { status: 404 });

  const done = await replaceDraft(device, lay.layout ?? [], `Draft before applying template ${lay.name}`);
  return NextResponse.json({ ok: true, target: "draft", ...done });
}
