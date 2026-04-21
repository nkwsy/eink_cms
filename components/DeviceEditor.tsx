"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Block, DeviceDoc, AssetDoc } from "@/lib/mongo";
import LayoutEditor from "./LayoutEditor";

type Props = {
  device: any;
  assets: any[];
};

export default function DeviceEditor({ device, assets }: Props) {
  const router = useRouter();
  const [name, setName] = useState(device.name);
  const [slug, setSlug] = useState(device.slug);
  const [width, setWidth] = useState(device.width);
  const [height, setHeight] = useState(device.height);
  const [rotation, setRotation] = useState(device.rotation ?? 0);
  const [layout, setLayout] = useState<Block[]>(device.layout ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<null | Date>(null);
  const [err, setErr] = useState<string | null>(null);
  const [previewBust, setPreviewBust] = useState(Date.now());

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function save() {
    setSaving(true);
    setErr(null);
    const res = await fetch(`/api/devices/${device._id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, slug, width, height, rotation, layout }),
    });
    setSaving(false);
    if (!res.ok) {
      setErr("Save failed");
      return;
    }
    setSaved(new Date());
    setPreviewBust(Date.now());
  }

  async function del() {
    if (!confirm(`Delete device "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/devices/${device._id}`, { method: "DELETE" });
    router.push("/");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{name}</h1>
          <div className="text-sm text-neutral-500 font-mono">{origin}/{slug}/current.bmp</div>
        </div>
        <div className="flex gap-2">
          <Link href="/" className="btn">Back</Link>
          <button className="btn btn-danger" onClick={del}>Delete</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {err && <div className="card border-red-700 text-red-300">{err}</div>}
      {saved && <div className="text-xs text-emerald-400">Saved {saved.toLocaleTimeString()}.</div>}

      <div className="grid grid-cols-4 gap-3">
        <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label">Slug</label><input className="input" value={slug} onChange={(e) => setSlug(e.target.value)} /></div>
        <div><label className="label">Width × Height</label>
          <div className="flex gap-2">
            <input type="number" className="input" value={width} onChange={(e) => setWidth(Number(e.target.value))} />
            <input type="number" className="input" value={height} onChange={(e) => setHeight(Number(e.target.value))} />
          </div>
        </div>
        <div><label className="label">Rotation</label>
          <select className="input" value={rotation} onChange={(e) => setRotation(Number(e.target.value))}>
            <option value={0}>0°</option>
            <option value={90}>90°</option>
            <option value={180}>180°</option>
            <option value={270}>270°</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-4">
        <div>
          <LayoutEditor
            width={width}
            height={height}
            initialLayout={layout}
            assets={assets}
            onChange={setLayout}
          />
        </div>
        <aside className="space-y-3">
          <div className="card">
            <h4 className="font-medium mb-2">Rendered preview (1-bit)</h4>
            <div className="bg-white border border-neutral-700">
              <img
                src={`/api/devices/${device._id}/render?format=png&t=${previewBust}`}
                alt=""
                className="w-full h-auto pixelated"
              />
            </div>
            <p className="text-xs text-neutral-500 mt-2">Shows the actual 1-bit output. Click <em>Save</em> to refresh.</p>
            <button className="btn w-full mt-2" onClick={() => setPreviewBust(Date.now())}>Refresh preview</button>
          </div>

          <div className="card text-sm">
            <h4 className="font-medium mb-2">Device pull URLs</h4>
            <div className="space-y-1 font-mono text-xs">
              <div>BMP: <a className="text-emerald-400" href={`/${slug}/current.bmp`} target="_blank">/{slug}/current.bmp</a></div>
              <div>PNG: <a className="text-emerald-400" href={`/${slug}/current.png`} target="_blank">/{slug}/current.png</a></div>
              <div>Force re-render: <code>?dither=1</code>, <code>?threshold=128</code></div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
