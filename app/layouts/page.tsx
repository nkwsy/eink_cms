import Link from "next/link";
import { layouts } from "@/lib/mongo";

export const dynamic = "force-dynamic";

export default async function LayoutsPage() {
  let list: any[] = [];
  let error: string | null = null;
  try {
    const col = await layouts();
    list = (await col.find({}).sort({ updatedAt: -1 }).toArray()).map((d) => ({ ...d, _id: String(d._id) }));
  } catch (e: any) {
    error = e.message;
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Layout templates</h1>
      </div>
      <p className="text-sm text-neutral-400 mb-4">
        Save a device's layout as a reusable template, then apply it to any device's draft. Useful for designing on a staging device, then rolling out to real signage.
      </p>
      {error && <div className="card border-red-700 text-red-300">{error}</div>}
      {list.length === 0 && !error && (
        <div className="card text-neutral-400">
          No templates yet. From a device editor, click "Save layout as template".
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((l) => (
          <Link key={l._id} href={`/layouts/${l._id}`} className="card hover:border-emerald-500">
            <div className="flex items-baseline justify-between">
              <div className="font-medium">{l.name}</div>
              <div className="text-xs text-neutral-500">{l.width}×{l.height}</div>
            </div>
            <div className="text-xs text-neutral-500 mt-1">{l.layout?.length ?? 0} blocks</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
