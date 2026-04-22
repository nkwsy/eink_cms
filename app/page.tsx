import Link from "next/link";
import { devices } from "@/lib/mongo";
import SeedWildMileButton from "@/components/SeedWildMileButton";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let list: Awaited<ReturnType<typeof loadList>> = [];
  let error: string | null = null;
  try {
    list = await loadList();
  } catch (e: any) {
    error = e.message ?? String(e);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Devices</h1>
        <div className="flex gap-2">
          <SeedWildMileButton />
          <Link href="/devices/new" className="btn btn-primary">+ New device</Link>
        </div>
      </div>

      {error && (
        <div className="card border-red-700 text-red-300 mb-4">
          <strong>MongoDB error:</strong> {error}
          <p className="text-sm mt-1">Set <code>MONGODB_URI</code> and <code>MONGODB_DB</code> in your environment.</p>
        </div>
      )}

      {list.length === 0 && !error && (
        <div className="card text-neutral-400">
          No devices yet. Create your first one.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((d) => (
          <Link key={d._id} href={`/devices/${d._id}`} className="card hover:border-emerald-500">
            <div className="flex items-baseline justify-between">
              <div className="font-medium">{d.name}</div>
              <div className="text-xs text-neutral-500">{d.width}×{d.height}</div>
            </div>
            <div className="text-xs text-neutral-500 font-mono mt-1">/{d.slug}/current.bmp</div>
            <div className="mt-3 rounded overflow-hidden border border-neutral-800 bg-white">
              <img
                src={`/api/devices/${d._id}/render?format=png&t=${new Date(d.updatedAt).getTime()}`}
                alt=""
                className="w-full h-auto pixelated"
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

async function loadList() {
  const col = await devices();
  const docs = await col.find({}).sort({ updatedAt: -1 }).toArray();
  return docs.map((d) => ({ ...d, _id: String(d._id), updatedAt: d.updatedAt }));
}
