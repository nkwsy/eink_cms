import { NextRequest, NextResponse } from "next/server";
import { ObjectId, devices } from "@/lib/mongo";
import { loadAssetMap, loadAssetMapForLayout } from "@/lib/fetch-assets";
import { renderDevice } from "@/lib/render";
import { renderLayoutCrisp } from "@/lib/render-crisp";
import { frameToBmp, frameToPng } from "@/lib/frame";
import { createCanvas } from "@napi-rs/canvas";

// Editor preview.
//   ?renderer=crisp&source=draft   what a promote would produce right now
//   ?renderer=crisp&source=live    the live layout through the crisp renderer
//   (no renderer)                  the old renderer on the live layout
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "png";

  const col = await devices();
  const doc = await col.findOne({ _id: new ObjectId(params.id) });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (url.searchParams.get("renderer") === "crisp") {
    const useDraft =
      url.searchParams.get("source") !== "live" && !!doc.draftLayout && doc.draftLayout.length > 0;
    const layout = useDraft ? doc.draftLayout! : doc.layout;
    const frame = await renderLayoutCrisp(doc, layout, await loadAssetMapForLayout(layout));
    if (format === "bmp") {
      return new NextResponse(new Uint8Array(frameToBmp(frame, doc.bitDepth)), {
        headers: { "Content-Type": "image/bmp", "Cache-Control": "no-store" },
      });
    }
    return new NextResponse(new Uint8Array(await frameToPng(frame)), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  }

  const dither = url.searchParams.get("dither") === "1";
  const threshold = Number(url.searchParams.get("threshold") ?? 160);
  const assetMap = await loadAssetMap(doc);
  const { bmp, pixels1, rgba, width, height } = await renderDevice(doc, assetMap, { dither, threshold });

  if (format === "bmp") {
    return new NextResponse(new Uint8Array(bmp), {
      headers: { "Content-Type": "image/bmp", "Cache-Control": "no-store" },
    });
  }

  // Preview matches the actual device output: for 1-bit devices show the
  // thresholded buffer; for 24-bit devices show the full-colour rgba.
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(width, height);
  if (doc.bitDepth === 24) {
    img.data.set(rgba);
  } else {
    for (let i = 0, p = 0; i < pixels1.length; i++, p += 4) {
      const v = pixels1[i] ? 255 : 0;
      img.data[p] = v; img.data[p + 1] = v; img.data[p + 2] = v; img.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const png = await canvas.encode("png");
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
