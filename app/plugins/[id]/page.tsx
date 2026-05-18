import Link from "next/link";
import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { pluginInstances } from "@/lib/mongo";
import { getPluginType } from "@/lib/plugins/registry";
import PluginEditor from "./PluginEditor";

export const dynamic = "force-dynamic";

export default async function PluginInstancePage({ params }: { params: { id: string } }) {
  if (!ObjectId.isValid(params.id)) notFound();
  const col = await pluginInstances();
  const doc = await col.findOne({ _id: new ObjectId(params.id) });
  if (!doc) notFound();
  const type = getPluginType(doc.typeId);
  const inst = { ...doc, _id: String(doc._id) };
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">{inst.name}</h1>
          <div className="text-xs text-neutral-500 font-mono">{inst.typeId}</div>
        </div>
        <Link href="/plugins" className="text-sm text-neutral-400 hover:text-emerald-400">← All plugins</Link>
      </div>
      {!type && (
        <div className="card border-red-700 text-red-300">
          Unknown plugin type "{inst.typeId}". The code that defines it may have been removed.
        </div>
      )}
      {type && (
        <PluginEditor
          inst={inst}
          typeDescription={type.description}
          defaults={{ ttlSec: type.defaultTtlSec, ...type.defaultSize }}
        />
      )}
    </div>
  );
}
