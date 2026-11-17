import { NextRequest, NextResponse } from "next/server";
import { devices } from "@/lib/mongo";
import { loadAssetMap } from "@/lib/fetch-assets";
import { renderDevice } from "@/lib/render";
import { frameToBmp } from "@/lib/frame";
import { liveFrame, notePull } from "@/lib/published";
import { applyDueSchedule } from "@/lib/versions";

// Public — no auth. A sign fetches this once each time it is powered on.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const col = await devices();
  let doc = await col.findOne({ slug: params.slug });
  if (!doc) return new NextResponse("not found", { status: 404 });
  // A timed promote whose time has come goes live now. Its image was stored
  // when it was set up, so this only moves a pointer.
  try {
    doc = await applyDueSchedule(doc);
  } catch (e) {
    console.error("[pull] could not apply timed promote", params.slug, e);
  }

  const headers: Record<string, string> = {
    "Content-Type": "image/bmp",
    "Cache-Control": "no-store, max-age=0",
    "X-Updated-At": new Date(doc.updatedAt).toISOString(),
  };

  let bmp: Buffer;
  // Promoted screens: hand over the stored image without drawing anything.
  const frame = await liveFrame(doc);
  if (frame) {
    bmp = frameToBmp(frame, doc.bitDepth);
    headers["X-Promoted-At"] = new Date(doc.published!.at).toISOString();
    headers["ETag"] = `"${doc.published!.sha256}"`;
  } else {
    // Not promoted since the crisp renderer shipped: draw as before.
    const assetMap = await loadAssetMap(doc);
    bmp = (await renderDevice(doc, assetMap)).bmp;
  }

  await notePull(doc, req.headers.get("user-agent"));
  headers["Content-Length"] = String(bmp.length);
  return new NextResponse(new Uint8Array(bmp), { headers });
}
