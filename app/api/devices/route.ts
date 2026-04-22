import { NextRequest, NextResponse } from "next/server";
import { devices } from "@/lib/mongo";
import { slugify } from "@/lib/slug";

export async function GET() {
  const col = await devices();
  const docs = await col.find({}).sort({ updatedAt: -1 }).toArray();
  return NextResponse.json(docs.map(serialize));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const col = await devices();
  const name = String(body.name ?? "Untitled");
  const slug = slugify(String(body.slug ?? name));
  const width = Number(body.width ?? 800);
  const height = Number(body.height ?? 480);
  const rotation = Number(body.rotation ?? 0) as 0 | 90 | 180 | 270;
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const existing = await col.findOne({ slug });
  if (existing) return NextResponse.json({ error: "slug already exists" }, { status: 409 });

  const now = new Date();
  const doc = {
    slug, name, width, height, rotation,
    layout: body.layout ?? [],
    createdAt: now, updatedAt: now,
  };
  const r = await col.insertOne(doc as any);
  return NextResponse.json(serialize({ ...doc, _id: r.insertedId }));
}

function serialize(d: any) {
  return { ...d, _id: String(d._id) };
}
