import { NextRequest, NextResponse } from "next/server";
import { modelFiles } from "@/lib/mongo";
import { slugify } from "@/lib/slug";

const MAX_BYTES = 200_000;

export async function GET(_req: NextRequest, { params }: { params: { model: string } }) {
  const file = await (await modelFiles()).findOne({ model: slugify(params.model) });
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ model: file.model, content: file.content, updatedAt: file.updatedAt });
}

// Replaces the settings file for a screen model. Body: { content: string }.
export async function PUT(req: NextRequest, { params }: { params: { model: string } }) {
  const model = slugify(params.model);
  if (!model) return NextResponse.json({ error: "bad model name" }, { status: 400 });
  const body = await req.json();
  const content = typeof body.content === "string" ? body.content : "";
  if (!content.trim()) return NextResponse.json({ error: "file is empty" }, { status: 400 });
  if (content.length > MAX_BYTES) return NextResponse.json({ error: "file is too large" }, { status: 400 });
  const updatedAt = new Date();
  await (await modelFiles()).updateOne(
    { model },
    { $set: { model, content, updatedAt } },
    { upsert: true }
  );
  return NextResponse.json({ ok: true, model, updatedAt });
}
