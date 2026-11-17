import { NextResponse } from "next/server";
import { modelFiles } from "@/lib/mongo";

// Screen models that have a settings file, newest first.
export async function GET() {
  const docs = await (await modelFiles())
    .find({}, { projection: { model: 1, updatedAt: 1 } })
    .sort({ updatedAt: -1 })
    .toArray();
  return NextResponse.json(docs.map((d) => ({ model: d.model, updatedAt: d.updatedAt })));
}
