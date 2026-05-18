"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Block, DeviceDoc, AssetDoc } from "@/lib/mongo";
import { editorDims } from "@/lib/dims";
import LayoutEditor from "./LayoutEditor";

type Props = {
  device: any;
  assets: any[];
  plugins?: any[];
};

export default function DeviceEditor({ device, assets, plugins = [] }: Props) {
  const router = useRouter();
  const [name, setName] = useState(device.name);
  const [slug, setSlug] = useState(device.slug);
  const [width, setWidth] = useState(device.width);
  const [height, setHeight] = useState(device.height);
  const [rotation, setRotation] = useState(device.rotation ?? 0);
  const [bitDepth, setBitDepth] = useState<1 | 24>(device.bitDepth === 24 ? 24 : 1);
  const [background, setBackground] = useState<"white" | "black">(device.background === "white" ? "white" : "black");
  // We edit a "working" layout that the user sees. If a draft exists, we
  // load that — otherwise the live layout. Saving writes back to draft
  // when one exists or the user has clicked "Edit as draft", else live.
  const initialIsDraft = Array.isArray(device.draftLayout) && device.draftLayout.length > 0;
  const [isDraftMode, setIsDraftMode] = useState<boolean>(initialIsDraft);
  const [layout, setLayout] = useState<Block[]>(initialIsDraft ? device.draftLayout : (device.layout ?? []));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<null | Date>(null);
  const [err, setErr] = useState<string | null>(null);
  const [previewBust, setPreviewBust] = useState(Date.now());

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function save() {
    setSaving(true);
    setErr(null);
    const body: Record<string, unknown> = { name, slug, width, height, rotation, bitDepth, background };
    // Draft mode writes to draftLayout and leaves the live layout alone —
    // so the device in the field keeps serving the old image until publish.
    if (isDraftMode) body.draftLayout = layout;
    else body.layout = layout;
    const res = await fetch(`/api/devices/${device._id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      setErr("Save failed");
      return;
    }
    setSaved(new Date());
    setPreviewBust(Date.now());
  }

  async function publishDraft() {
    if (!confirm("Publish the draft? The live device will start serving this layout on its next pull.")) return;
    setSaving(true);
    setErr(null);
    const res = await fetch(`/api/devices/${device._id}/publish`, { method: "POST" });
    setSaving(false);
    if (!res.ok) {
      setErr("Publish failed");
      return;
    }
    setIsDraftMode(false);
    setPreviewBust(Date.now());
    router.refresh();
  }

  async function saveAsTemplate() {
    const tplName = prompt("Template name?", `${name} template`);
    if (!tplName) return;
    setSaving(true);
    const res = await fetch("/api/layouts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: tplName, width, height, background, layout }),
    });
    setSaving(false);
    if (!res.ok) {
      setErr("Save-as-template failed");
      return;
    }
    setSaved(new Date());
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
        <div className="flex gap-2 items-center">
          <Link href="/" className="btn">Back</Link>
          <button className="btn btn-danger" onClick={del}>Delete</button>
          <button className="btn" onClick={saveAsTemplate} disabled={saving}>Save as template</button>
          <label className="flex items-center gap-1 text-xs text-neutral-400">
            <input type="checkbox" checked={isDraftMode} onChange={(e) => setIsDraftMode(e.target.checked)} />
            Draft mode
          </label>
          {isDraftMode && (
            <button className="btn" onClick={publishDraft} disabled={saving}>Publish</button>
          )}
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : isDraftMode ? "Save draft" : "Save"}
          </button>
        </div>
      </div>

      {err && <div className="card border-red-700 text-red-300">{err}</div>}
      {saved && <div className="text-xs text-emerald-400">Saved {saved.toLocaleTimeString()}.</div>}

      <div className="grid grid-cols-6 gap-3">
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
        <div><label className="label">BMP format</label>
          <select className="input" value={bitDepth} onChange={(e) => setBitDepth(Number(e.target.value) === 24 ? 24 : 1)}>
            <option value={1}>1-bit mono</option>
            <option value={24}>24-bit BGR</option>
          </select>
        </div>
        <div><label className="label">Background</label>
          <select className="input" value={background} onChange={(e) => setBackground(e.target.value === "white" ? "white" : "black")}>
            <option value="black">Black</option>
            <option value="white">White</option>
          </select>
        </div>
      </div>

      {(() => {
        const { w: editW, h: editH } = editorDims({ width, height, rotation });
        const rotated = rotation === 90 || rotation === 270;
        return (
        <div className="grid grid-cols-[1fr_360px] gap-4">
        <div>
          {rotated && (
            <p className="text-xs text-neutral-500 mb-2">
              Rotated mount ({rotation}°): editing at {editW}×{editH}; saved image is rotated to the device's native {width}×{height}.
            </p>
          )}
          <LayoutEditor
            width={editW}
            height={editH}
            initialLayout={layout}
            assets={assets}
            plugins={plugins}
            onChange={setLayout}
          />
        </div>
        <aside className="space-y-3">
          <div className="card">
            <h4 className="font-medium mb-2">Rendered preview (1-bit)</h4>
            <div className="bg-white border border-neutral-700 max-h-[420px] overflow-hidden flex items-center justify-center">
              <img
                src={`/api/devices/${device._id}/render?format=png&t=${previewBust}`}
                alt=""
                className="max-w-full max-h-[420px] w-auto h-auto pixelated object-contain"
              />
            </div>
            <p className="text-xs text-neutral-500 mt-2">Shows the actual 1-bit output ({width}×{height}). Click <em>Save</em> to refresh.</p>
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
        );
      })()}
    </div>
  );
}
