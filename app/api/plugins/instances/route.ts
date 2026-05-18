import { NextRequest, NextResponse } from "next/server";
import { pluginInstances } from "@/lib/mongo";
import { getPluginType } from "@/lib/plugins/registry";

export async function GET() {
  const col = await pluginInstances();
  const docs = await col.find({}).sort({ updatedAt: -1 }).toArray();
  return NextResponse.json(docs.map(serialize));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const typeId = String(body.typeId ?? "");
  const type = getPluginType(typeId);
  if (!type) return NextResponse.json({ error: `unknown plugin typeId ${typeId}` }, { status: 400 });

  const col = await pluginInstances();
  const now = new Date();
  const doc = {
    typeId,
    name: String(body.name ?? `${type.name} instance`),
    width: Number(body.width ?? type.defaultSize.w),
    height: Number(body.height ?? type.defaultSize.h),
    settings: body.settings ?? {},
    ttlSec: Number(body.ttlSec ?? type.defaultTtlSec),
    createdAt: now,
    updatedAt: now,
  };
  const r = await col.insertOne(doc as any);
  return NextResponse.json(serialize({ ...doc, _id: r.insertedId }));
}

function serialize(d: any) {
  return { ...d, _id: String(d._id) };
}
