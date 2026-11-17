import { NextRequest, NextResponse } from "next/server";
import { devices, modelFiles } from "@/lib/mongo";

// Public — no auth. The device settings file for this screen's model. Every
// screen of the same model gets the same file.
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const doc = await (await devices()).findOne({ slug: params.slug });
  if (!doc) return new NextResponse("not found", { status: 404 });
  if (!doc.model) return new NextResponse("no screen model set for this device", { status: 404 });
  const file = await (await modelFiles()).findOne({ model: doc.model });
  if (!file) return new NextResponse("no settings file uploaded for this model", { status: 404 });
  return new NextResponse(file.content, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store, max-age=0" },
  });
}
