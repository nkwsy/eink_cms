import { NextRequest, NextResponse } from "next/server";
import { assets } from "@/lib/mongo";

export async function GET() {
  const col = await assets();
  const docs = await col.find({}).sort({ updatedAt: -1 }).toArray();
  return NextResponse.json(docs.map((d) => ({ ...d, _id: String(d._id) })));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const col = await assets();
  const now = new Date();
  const doc = {
    name: String(body.name ?? "Untitled asset"),
    width: Number(body.width ?? 200),
    height: Number(body.height ?? 100),
    layout: body.layout ?? [],
    createdAt: now, updatedAt: now,
  };
  const r = await col.insertOne(doc as any);
  return NextResponse.json({ ...doc, _id: String(r.insertedId) });
}
