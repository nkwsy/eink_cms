import { NextRequest, NextResponse } from "next/server";
import { devices } from "@/lib/mongo";
import { loadAssetMap } from "@/lib/fetch-assets";
import { renderDevice } from "@/lib/render";
import { createCanvas } from "@napi-rs/canvas";

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const col = await devices();
  const doc = await col.findOne({ slug: params.slug });
  if (!doc) return new NextResponse("not found", { status: 404 });
  const assetMap = await loadAssetMap(doc);
  const { pixels1, width, height } = await renderDevice(doc, assetMap);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(width, height);
  for (let i = 0, p = 0; i < pixels1.length; i++, p += 4) {
    const v = pixels1[i] ? 255 : 0;
    img.data[p] = v; img.data[p + 1] = v; img.data[p + 2] = v; img.data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const png = await canvas.encode("png");
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
