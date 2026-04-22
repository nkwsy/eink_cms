import { NextRequest, NextResponse } from "next/server";
import { ObjectId, devices } from "@/lib/mongo";
import { loadAssetMap } from "@/lib/fetch-assets";
import { renderDevice } from "@/lib/render";
import { createCanvas } from "@napi-rs/canvas";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "png";
  const dither = url.searchParams.get("dither") === "1";
  const threshold = Number(url.searchParams.get("threshold") ?? 160);

  const col = await devices();
  const doc = await col.findOne({ _id: new ObjectId(params.id) });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const assetMap = await loadAssetMap(doc);
  const { bmp, pixels1, width, height } = await renderDevice(doc, assetMap, { dither, threshold });

  if (format === "bmp") {
    return new NextResponse(new Uint8Array(bmp), {
      headers: { "Content-Type": "image/bmp", "Cache-Control": "no-store" },
    });
  }

  // Render the 1-bit buffer back to a PNG so the preview matches the device output byte-for-byte.
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
