import { NextRequest, NextResponse } from "next/server";
import { ObjectId, devices } from "@/lib/mongo";
import { renderCalibration } from "@/lib/calibration";
import { frameToPng } from "@/lib/frame";
import { showCalibration } from "@/lib/published";

// GET: preview of the calibration chart for this device, as a PNG.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const doc = await (await devices()).findOne({ _id: new ObjectId(params.id) });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const frame = await renderCalibration(doc);
  return new NextResponse(new Uint8Array(await frameToPng(frame)), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}

// POST: put the chart on the pull URL. The layout is not touched; the restore
// route puts the previous live image back.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const doc = await (await devices()).findOne({ _id: new ObjectId(params.id) });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const frame = await renderCalibration(doc);
  const published = await showCalibration(doc, frame);
  return NextResponse.json({ ok: true, published });
}
