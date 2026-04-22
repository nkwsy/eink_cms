import { NextRequest, NextResponse } from "next/server";
import { devices } from "@/lib/mongo";
import { loadAssetMap } from "@/lib/fetch-assets";
import { renderDevice } from "@/lib/render";

// Public — no auth. Devices pull this on a schedule.
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const col = await devices();
  const doc = await col.findOne({ slug: params.slug });
  if (!doc) return new NextResponse("not found", { status: 404 });
  const assetMap = await loadAssetMap(doc);
  const { bmp } = await renderDevice(doc, assetMap);
  return new NextResponse(new Uint8Array(bmp), {
    headers: {
      "Content-Type": "image/bmp",
      "Cache-Control": "no-store, max-age=0",
      "X-Updated-At": new Date(doc.updatedAt).toISOString(),
    },
  });
}
