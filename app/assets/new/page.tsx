"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewAssetPage() {
  const router = useRouter();
  const [name, setName] = useState("Event card");
  const [width, setWidth] = useState(200);
  const [height, setHeight] = useState(100);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, width, height }),
    });
    setBusy(false);
    if (!res.ok) { setErr("Failed"); return; }
    const d = await res.json();
    router.push(`/assets/${d._id}`);
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold mb-4">New asset</h1>
      <form onSubmit={submit} className="card space-y-3">
        <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Width</label><input type="number" className="input" value={width} onChange={(e) => setWidth(Number(e.target.value))} /></div>
          <div><label className="label">Height</label><input type="number" className="input" value={height} onChange={(e) => setHeight(Number(e.target.value))} /></div>
        </div>
        {err && <p className="text-sm text-red-400">{err}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
      </form>
    </div>
  );
}
