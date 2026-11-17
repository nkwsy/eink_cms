import { NextRequest, NextResponse } from "next/server";
import { ObjectId, devices, versions } from "@/lib/mongo";
import { copyToDevice, getVersion, makeLive, restoreToDraft } from "@/lib/versions";

type Ctx = { params: { id: string; vid: string } };

// PATCH { label }: name or rename a version.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const version = await getVersion(params.id, params.vid);
  if (!version) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const label = String(body?.label ?? "").trim().slice(0, 120);
  await (await versions()).updateOne({ _id: version._id }, label ? { $set: { label } } : { $unset: { label: "" } });
  return NextResponse.json({ ok: true, label });
}

// POST { action }
//   "draft" — load this version into the draft; the sign is not touched.
//   "live"  — put this version back on the sign (drawn again, new version).
//   "copy"  — copy it onto another device's draft: { targetDeviceId }.
// params.vid may be "draft" for "copy": the current draft is copied.
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const col = await devices();
  const device = await col.findOne({ _id: new ObjectId(params.id) });
  if (!device) return NextResponse.json({ error: "not found" }, { status: 404 });
  const version = params.vid === "draft" ? null : await getVersion(params.id, params.vid);
  if (params.vid !== "draft" && !version) return NextResponse.json({ error: "version not found" }, { status: 404 });

  try {
    if (body?.action === "copy") {
      const targetId = String(body.targetDeviceId ?? "");
      if (!ObjectId.isValid(targetId) || targetId === params.id) {
        return NextResponse.json({ error: "Choose another device to copy to." }, { status: 400 });
      }
      const target = await col.findOne({ _id: new ObjectId(targetId) });
      if (!target) return NextResponse.json({ error: "target device not found" }, { status: 404 });
      const done = await copyToDevice(device, version ?? "draft", target);
      return NextResponse.json({ ok: true, ...done, targetName: target.name });
    }
    if (!version) return NextResponse.json({ error: "version not found" }, { status: 404 });
    if (body?.action === "draft") return NextResponse.json({ ok: true, ...(await restoreToDraft(device, version)) });
    if (body?.action === "live") {
      const result = await makeLive(device, version);
      // The editor shows the draft, which is now the same as the live screen.
      const after = await col.findOne({ _id: device._id });
      return NextResponse.json({
        ok: true,
        ...result,
        draftLayout: after?.layout ?? [],
        draftRev: after?.draftRev ?? 0,
        background: after?.background,
        inkCutoff: after?.inkCutoff,
      });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e: any) {
    console.error("[versions] action failed", params.id, params.vid, e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}
