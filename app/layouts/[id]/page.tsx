import Link from "next/link";
import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { layouts, devices } from "@/lib/mongo";
import ApplyToDevice from "./ApplyToDevice";

export const dynamic = "force-dynamic";

export default async function LayoutDetailPage({ params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) notFound();
  const lcol = await layouts();
  const doc = await lcol.findOne({ _id: new ObjectId(params.id) });
  if (!doc) notFound();
  const dcol = await devices();
  const deviceList = (await dcol.find({}, { projection: { name: 1, slug: 1, width: 1, height: 1 } }).toArray())
    .map((d) => ({ _id: String(d._id), name: d.name, slug: d.slug, width: d.width, height: d.height }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">{doc.name}</h1>
          <div className="text-xs text-neutral-500">{doc.width}×{doc.height} · {doc.layout?.length ?? 0} blocks</div>
        </div>
        <Link href="/layouts" className="text-sm text-neutral-400 hover:text-emerald-400">← All layouts</Link>
      </div>
      <ApplyToDevice layoutId={String(doc._id)} devices={deviceList} />
    </div>
  );
}
