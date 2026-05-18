import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { pluginInstances } from "@/lib/mongo";
import { ensureFreshOutput } from "@/lib/plugins/runner";
import { getMedia, dataUrlToBuffer } from "@/lib/media";

// GET /api/plugins/instances/<id>/preview.png
// Serves the latest generated PNG for an instance. The CMS instance page
// hits this with a cache-buster query string after each refresh.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) return new NextResponse("bad id", { status: 400 });
  await ensureFreshOutput(params.id);
  const col = await pluginInstances();
  const inst = await col.findOne({ _id: new ObjectId(params.id) });
  if (!inst?.latestMediaId) return new NextResponse("no output yet", { status: 404 });
  const m = await getMedia(inst.latestMediaId);
  if (!m?.dataUrl) return new NextResponse("no media", { status: 404 });
  const buf = dataUrlToBuffer(m.dataUrl);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": m.mimeType,
      "cache-control": "no-store",
    },
  });
}
