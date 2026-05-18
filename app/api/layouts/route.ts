import { NextRequest, NextResponse } from "next/server";
import { layouts } from "@/lib/mongo";

export async function GET() {
  const col = await layouts();
  const docs = await col.find({}).sort({ updatedAt: -1 }).toArray();
  return NextResponse.json(docs.map((d) => ({ ...d, _id: String(d._id) })));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const col = await layouts();
  const now = new Date();
  const doc = {
    name: String(body.name ?? "Untitled layout"),
    width: Number(body.width ?? 800),
    height: Number(body.height ?? 480),
    background: body.background === "white" ? "white" : "black",
    layout: body.layout ?? [],
    createdAt: now,
    updatedAt: now,
  };
  const r = await col.insertOne(doc as any);
  return NextResponse.json({ ...doc, _id: String(r.insertedId) });
}
