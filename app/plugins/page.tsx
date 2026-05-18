import Link from "next/link";
import { pluginInstances } from "@/lib/mongo";
import { listPluginTypes } from "@/lib/plugins/registry";

export const dynamic = "force-dynamic";

export default async function PluginsPage() {
  let list: any[] = [];
  let error: string | null = null;
  try {
    const col = await pluginInstances();
    list = (await col.find({}).sort({ updatedAt: -1 }).toArray()).map((d) => ({ ...d, _id: String(d._id) }));
  } catch (e: any) {
    error = e.message;
  }
  const types = listPluginTypes();
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Plugins</h1>
        <Link href="/plugins/new" className="btn btn-primary">+ New plugin</Link>
      </div>
      <p className="text-sm text-neutral-400 mb-4">
        Plugins pull data from Wildmile MongoDB, an HTTP API, or Claude, render an SVG, and cache the rasterised result.
        Place a plugin block in any device layout to use one. Refresh respects each instance's TTL.
      </p>
      {error && <div className="card border-red-700 text-red-300 mb-4">{error}</div>}

      {list.length === 0 && !error && (
        <div className="card text-neutral-400 mb-6">
          No plugin instances yet. Pick a type below to create your first one.
        </div>
      )}

      {list.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {list.map((p) => (
            <Link key={p._id} href={`/plugins/${p._id}`} className="card hover:border-emerald-500">
              <div className="flex items-baseline justify-between">
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-neutral-500">{p.width}×{p.height}</div>
              </div>
              <div className="text-xs text-neutral-500 font-mono mt-1">{p.typeId}</div>
              <div className="mt-3 rounded overflow-hidden border border-neutral-800 bg-white">
                <img
                  src={`/api/plugins/instances/${p._id}/preview.png?t=${new Date(p.updatedAt).getTime()}`}
                  alt=""
                  className="w-full h-auto pixelated"
                />
              </div>
              {p.lastError && (
                <div className="mt-2 text-xs text-red-400 line-clamp-2">{p.lastError.message}</div>
              )}
            </Link>
          ))}
        </div>
      )}

      <h2 className="text-lg font-semibold mb-2">Available types</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
        {types.map((t) => (
          <div key={t.id} className="card">
            <div className="font-medium">{t.name}</div>
            <div className="text-xs text-neutral-500 font-mono">{t.id}</div>
            <div className="text-xs text-neutral-400 mt-2">{t.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
