import Link from "next/link";
import { assets } from "@/lib/mongo";
import SeedPresetsButton from "@/components/SeedPresetsButton";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  let list: any[] = [];
  let error: string | null = null;
  try {
    const col = await assets();
    list = (await col.find({}).sort({ updatedAt: -1 }).toArray()).map((d) => ({ ...d, _id: String(d._id) }));
  } catch (e: any) { error = e.message; }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Assets (reusable blocks)</h1>
        <div className="flex gap-2">
          <SeedPresetsButton />
          <Link href="/assets/new" className="btn btn-primary">+ New asset</Link>
        </div>
      </div>
      <p className="text-sm text-neutral-400 mb-4">
        Assets are reusable building blocks — e.g. an "event card" or "weather block" with its own internal text + image layout.
        Drop them into devices from the device editor.
      </p>
      {error && <div className="card border-red-700 text-red-300">{error}</div>}
      {list.length === 0 && !error && <div className="card text-neutral-400">No assets yet. Click “Seed presets” to install the event / activity / callout card templates.</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((a) => (
          <Link key={a._id} href={`/assets/${a._id}`} className="card hover:border-emerald-500">
            <div className="flex items-baseline justify-between">
              <div className="font-medium">{a.name}</div>
              <div className="text-xs text-neutral-500">{a.width}×{a.height}</div>
            </div>
            <div className="text-xs text-neutral-500 mt-1">
              {a.layout?.length ?? 0} blocks
              {a.variables?.length ? ` • ${a.variables.length} vars` : ""}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
