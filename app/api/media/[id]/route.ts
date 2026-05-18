import { NextRequest, NextResponse } from "next/server";
import { deleteMedia, getMedia, dataUrlToBuffer } from "@/lib/media";

// GET /api/media/<id>  → image bytes (use as <img src>)
// GET /api/media/<id>?meta=1 → JSON record only
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const m = await getMedia(params.id);
  if (!m) return new NextResponse("not found", { status: 404 });
  const url = new URL(req.url);
  if (url.searchParams.get("meta")) {
    return NextResponse.json({ ...m, _id: String(m._id) });
  }
  if (!m.dataUrl) return new NextResponse("no bytes", { status: 404 });
  const buf = dataUrlToBuffer(m.dataUrl);
  // Wrap in a fresh Uint8Array so we satisfy NextResponse's BodyInit typing
  // — TS doesn't yet model node Buffers as compatible.
  return new NextResponse(new Uint8Array(buf), {
    headers: { "content-type": m.mimeType, "cache-control": "no-store" },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await deleteMedia(params.id);
  return NextResponse.json({ ok: true });
}
