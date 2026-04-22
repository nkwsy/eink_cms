import { notFound } from "next/navigation";
import { ObjectId, assets } from "@/lib/mongo";
import AssetEditor from "@/components/AssetEditor";

export const dynamic = "force-dynamic";

export default async function AssetPage({ params }: { params: { id: string } }) {
  const col = await assets();
  const doc = await col.findOne({ _id: new ObjectId(params.id) });
  if (!doc) notFound();
  const others = (await col.find({ _id: { $ne: doc._id } }).toArray()).map((a) => ({ ...a, _id: String(a._id) }));
  return <AssetEditor asset={{ ...doc, _id: String(doc._id) }} otherAssets={others} />;
}
