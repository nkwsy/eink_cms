import { NextRequest, NextResponse } from "next/server";
import { assets } from "@/lib/mongo";
import { PRESET_FACTORIES } from "@/lib/presets";

export async function POST(_req: NextRequest) {
  const col = await assets();
  const now = new Date();
  const created: any[] = [];
  for (const f of PRESET_FACTORIES) {
    const doc = f.make();
    const existing = await col.findOne({ name: doc.name });
    if (existing) continue;
    const r = await col.insertOne({ ...doc, createdAt: now, updatedAt: now } as any);
    created.push({ _id: String(r.insertedId), name: doc.name });
  }
  return NextResponse.json({ created });
}
