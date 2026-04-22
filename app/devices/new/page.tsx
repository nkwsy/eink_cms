"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const PRESETS = [
  { name: "Waveshare 7.5\" (800×480)", width: 800, height: 480 },
  { name: "Waveshare 4.2\" (400×300)", width: 400, height: 300 },
  { name: "Waveshare 2.9\" (296×128)", width: 296, height: 128 },
  { name: "Waveshare 2.13\" (250×122)", width: 250, height: 122 },
  { name: "Waveshare 7.5\" HD (880×528)", width: 880, height: 528 },
  { name: "Waveshare 10.3\" (1872×1404)", width: 1872, height: 1404 },
  { name: "Custom", width: 0, height: 0 },
];

export default function NewDevicePage() {
  const router = useRouter();
  const [name, setName] = useState("Lobby sign");
  const [slug, setSlug] = useState("lobby");
  const [preset, setPreset] = useState(0);
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(480);
  const [rotation, setRotation] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onPreset = (i: number) => {
    setPreset(i);
    const p = PRESETS[i];
    if (p.width) setWidth(p.width);
    if (p.height) setHeight(p.height);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, slug, width, height, rotation }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "Failed to create");
      return;
    }
    const d = await res.json();
    router.push(`/devices/${d._id}`);
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-4">New device</h1>
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">URL slug (used in <code>/{"{slug}"}/current.bmp</code>)</label>
          <input className="input" value={slug} onChange={(e) => setSlug(e.target.value)} required />
        </div>
        <div>
          <label className="label">Screen preset</label>
          <select className="input" value={preset} onChange={(e) => onPreset(Number(e.target.value))}>
            {PRESETS.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Width (px)</label>
            <input type="number" className="input" value={width} onChange={(e) => setWidth(Number(e.target.value))} required />
          </div>
          <div>
            <label className="label">Height (px)</label>
            <input type="number" className="input" value={height} onChange={(e) => setHeight(Number(e.target.value))} required />
          </div>
          <div>
            <label className="label">Rotation</label>
            <select className="input" value={rotation} onChange={(e) => setRotation(Number(e.target.value))}>
              <option value={0}>0°</option>
              <option value={90}>90°</option>
              <option value={180}>180°</option>
              <option value={270}>270°</option>
            </select>
          </div>
        </div>

        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
        </div>
      </form>
    </div>
  );
}
