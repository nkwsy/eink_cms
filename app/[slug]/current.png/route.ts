import { NextRequest, NextResponse } from "next/server";
import { devices } from "@/lib/mongo";
import { loadAssetMap } from "@/lib/fetch-assets";
import { renderDevice } from "@/lib/render";
import { frameToPng } from "@/lib/frame";
import { liveFrame } from "@/lib/published";
import { applyDueSchedule } from "@/lib/versions";
import { createCanvas } from "@napi-rs/canvas";

// Same image as current.bmp, as a PNG for looking at in a browser. Not counted
// as a pull.
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const col = await devices();
  let doc = await col.findOne({ slug: params.slug });
  if (!doc) return new NextResponse("not found", { status: 404 });
  try {
    doc = await applyDueSchedule(doc);
  } catch (e) {
    console.error("[png] could not apply timed promote", params.slug, e);
  }

  const frame = await liveFrame(doc);
  if (frame) {
    return new NextResponse(new Uint8Array(await frameToPng(frame)), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  }

  const assetMap = await loadAssetMap(doc);
  const { pixels1, rgba, width, height } = await renderDevice(doc, assetMap);
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
