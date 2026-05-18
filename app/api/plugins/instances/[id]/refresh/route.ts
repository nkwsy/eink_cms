import { NextRequest, NextResponse } from "next/server";
import { forceRefresh } from "@/lib/plugins/runner";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const inst = await forceRefresh(params.id);
  if (!inst) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ...inst, _id: String(inst._id) });
}
