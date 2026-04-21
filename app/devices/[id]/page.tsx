import { notFound } from "next/navigation";
import { ObjectId, devices, assets as assetsColl } from "@/lib/mongo";
import DeviceEditor from "@/components/DeviceEditor";

export const dynamic = "force-dynamic";

export default async function DevicePage({ params }: { params: { id: string } }) {
  let device: any, assets: any[];
  try {
    const col = await devices();
    device = await col.findOne({ _id: new ObjectId(params.id) });
    if (!device) notFound();
    const acol = await assetsColl();
    assets = (await acol.find({}).sort({ name: 1 }).toArray()).map((a) => ({ ...a, _id: String(a._id) }));
  } catch (e: any) {
    return <div className="card border-red-700 text-red-300">DB error: {e.message}</div>;
  }
  return <DeviceEditor device={{ ...device, _id: String(device._id) }} assets={assets} />;
}
