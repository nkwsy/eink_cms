"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import type { Block, AssetVariable } from "@/lib/mongo";
import LayoutEditor from "./LayoutEditor";

export default function AssetEditor({ asset, otherAssets }: { asset: any; otherAssets: any[] }) {
  const router = useRouter();
  const [name, setName] = useState(asset.name);
  const [width, setWidth] = useState(asset.width);
  const [height, setHeight] = useState(asset.height);
  const [layout, setLayout] = useState<Block[]>(asset.layout ?? []);
  const [variables, setVariables] = useState<AssetVariable[]>(asset.variables ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<null | Date>(null);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/assets/${asset._id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, width, height, layout, variables }),
    });
    setSaving(false);
    if (res.ok) setSaved(new Date());
  }

  async function del() {
    if (!confirm(`Delete asset "${name}"?`)) return;
    await fetch(`/api/assets/${asset._id}`, { method: "DELETE" });
    router.push("/assets");
  }

  function updateVar(i: number, patch: Partial<AssetVariable>) {
    setVariables((vs) => vs.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  }
  function addVar() {
    const n = variables.length + 1;
    setVariables((vs) => [...vs, { key: `var${n}`, label: `Variable ${n}`, type: "text", default: "" }]);
  }
  function removeVar(i: number) {
    setVariables((vs) => vs.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{name}</h1>
        <div className="flex gap-2">
          <Link href="/assets" className="btn">Back</Link>
          <button className="btn btn-danger" onClick={del}>Delete</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
      {saved && <div className="text-xs text-emerald-400">Saved {saved.toLocaleTimeString()}.</div>}

      <div className="grid grid-cols-3 gap-3">
        <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label">Width</label><input type="number" className="input" value={width} onChange={(e) => setWidth(Number(e.target.value))} /></div>
        <div><label className="label">Height</label><input type="number" className="input" value={height} onChange={(e) => setHeight(Number(e.target.value))} /></div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-medium">Variables</div>
            <div className="text-xs text-neutral-500">
              Declare inputs that instances of this asset can override. Use <code>{`{{key}}`}</code> in text / QR URL / date fields inside the layout.
            </div>
          </div>
          <button className="btn" onClick={addVar}>+ Variable</button>
        </div>
        {variables.length === 0 && <div className="text-xs text-neutral-500">No variables. Add one to let devices customize this asset per-instance.</div>}
        {variables.length > 0 && (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_140px_1fr_40px] gap-2 text-xs text-neutral-500 px-1">
              <div>Key</div><div>Label</div><div>Type</div><div>Default</div><div></div>
            </div>
            {variables.map((v, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_140px_1fr_40px] gap-2 items-center">
                <input className="input" value={v.key} onChange={(e) => updateVar(i, { key: e.target.value })} placeholder="key" />
                <input className="input" value={v.label ?? ""} onChange={(e) => updateVar(i, { label: e.target.value })} placeholder="label" />
                <select className="input" value={v.type} onChange={(e) => updateVar(i, { type: e.target.value as AssetVariable["type"] })}>
                  <option value="text">text</option>
                  <option value="image">image</option>
                  <option value="url">url</option>
                  <option value="date">date</option>
                </select>
                <input className="input" value={v.default ?? ""} onChange={(e) => updateVar(i, { default: e.target.value })} placeholder="default" />
                <button className="btn btn-danger" onClick={() => removeVar(i)} title="Remove">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <LayoutEditor
        width={width}
        height={height}
        initialLayout={layout}
        assets={otherAssets}
        onChange={setLayout}
      />
    </div>
  );
}
