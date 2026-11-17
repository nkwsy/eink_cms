import { notFound } from "next/navigation";
import { ObjectId, devices, assets as assetsColl, pluginInstances } from "@/lib/mongo";
import DeviceEditor from "@/components/DeviceEditor";
import { applyDueSchedule, ensureVersions } from "@/lib/versions";

export const dynamic = "force-dynamic";

export default async function DevicePage({ params }: { params: { id: string } }) {
  let device: any, assets: any[], plugins: any[], others: any[];
  try {
    const col = await devices();
    device = await col.findOne({ _id: new ObjectId(params.id) });
    if (!device) notFound();
    // First visit since versions shipped: the live screen becomes version 1.
    device = await applyDueSchedule(await ensureVersions(device));
    others = (await col.find({ _id: { $ne: device._id } }, { projection: { name: 1, width: 1, height: 1, rotation: 1 } }).sort({ name: 1 }).toArray())
      .map((d) => ({ _id: String(d._id), name: d.name, width: d.width, height: d.height, rotation: d.rotation ?? 0 }));
    const acol = await assetsColl();
    assets = (await acol.find({}).sort({ name: 1 }).toArray()).map((a) => ({ ...a, _id: String(a._id) }));
    const pcol = await pluginInstances();
    plugins = (await pcol.find({}, { projection: { name: 1, typeId: 1, width: 1, height: 1 } }).sort({ name: 1 }).toArray())
      .map((p) => ({ ...p, _id: String(p._id) }));
  } catch (e: any) {
    return <div className="card border-red-700 text-red-300">DB error: {e.message}</div>;
  }
  return <DeviceEditor device={{ ...device, _id: String(device._id) }} assets={assets} plugins={plugins} otherDevices={others} />;
}
