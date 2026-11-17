import { NextRequest, NextResponse } from "next/server";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { frameToPng } from "@/lib/frame";
import { getVersion, versionFrame } from "@/lib/versions";

// A version's picture. ?w=<pixels> gives a smaller one for lists.
export async function GET(req: NextRequest, { params }: { params: { id: string; vid: string } }) {
  const version = await getVersion(params.id, params.vid);
  if (!version) return new NextResponse("not found", { status: 404 });
  const frame = await versionFrame(version);
  let png = await frameToPng(frame);
  const w = Number(new URL(req.url).searchParams.get("w"));
  if (Number.isFinite(w) && w >= 16 && w < frame.width) {
    const h = Math.max(1, Math.round((frame.height * w) / frame.width));
    const canvas = createCanvas(Math.round(w), h);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(await loadImage(png), 0, 0, Math.round(w), h);
    png = await canvas.encode("png");
  }
  // A version never changes, so its picture can be kept by the browser.
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" },
  });
}
