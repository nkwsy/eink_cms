import { NextRequest, NextResponse } from "next/server";
import { listMedia, saveMedia } from "@/lib/media";

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const kind = u.searchParams.get("kind") as "upload" | "generated" | null;
  const sourcePluginId = u.searchParams.get("sourcePluginId") ?? undefined;
  const items = await listMedia({ kind: kind ?? undefined, sourcePluginId });
  return NextResponse.json(items.map((m) => ({ ...m, _id: String(m._id) })));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const dataUrl = String(body.dataUrl ?? "");
  if (!dataUrl.startsWith("data:")) {
    return NextResponse.json({ error: "dataUrl required" }, { status: 400 });
  }
  const mime = (dataUrl.match(/^data:([^;]+)/) ?? [])[1] ?? "application/octet-stream";
  const saved = await saveMedia({
    kind: "upload",
    name: body.name ?? "Upload",
    mimeType: mime,
    width: Number(body.width ?? 0),
    height: Number(body.height ?? 0),
    dataUrl,
  });
  return NextResponse.json({ ...saved, _id: String(saved._id) });
}
