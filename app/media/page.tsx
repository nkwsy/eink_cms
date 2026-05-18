import Link from "next/link";
import { listMedia } from "@/lib/media";
import MediaUploadButton from "./MediaUploadButton";

export const dynamic = "force-dynamic";

export default async function MediaPage({ searchParams }: { searchParams: { kind?: string } }) {
  const kind = (searchParams.kind === "upload" || searchParams.kind === "generated")
    ? searchParams.kind as "upload" | "generated"
    : undefined;
  let items: any[] = [];
  let error: string | null = null;
  try {
    items = (await listMedia({ kind, limit: 200 })).map((m) => ({ ...m, _id: String(m._id) }));
  } catch (e: any) {
    error = e.message;
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Media library</h1>
        <MediaUploadButton />
      </div>
      <div className="flex gap-3 mb-4 text-sm">
        <Link href="/media" className={!kind ? "text-emerald-400" : "text-neutral-400"}>All</Link>
        <Link href="/media?kind=upload" className={kind === "upload" ? "text-emerald-400" : "text-neutral-400"}>Uploads</Link>
        <Link href="/media?kind=generated" className={kind === "generated" ? "text-emerald-400" : "text-neutral-400"}>Generated</Link>
      </div>
      {error && <div className="card border-red-700 text-red-300">{error}</div>}
      {items.length === 0 && !error && <div className="card text-neutral-400">Empty. Upload an image or run a plugin.</div>}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {items.map((m) => (
          <div key={m._id} className="card">
            <div className="border border-neutral-800 bg-white">
              <img src={`/api/media/${m._id}`} alt={m.name ?? ""} className="w-full h-auto pixelated" />
            </div>
            <div className="text-xs mt-2">
              <div className="font-medium truncate">{m.name ?? m._id}</div>
              <div className="text-neutral-500">{m.kind} · {m.width}×{m.height}</div>
              <div className="text-neutral-600 font-mono mt-1">{m._id}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
