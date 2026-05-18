"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Instance editor. Settings are edited as raw JSON for v1 — a generated
// schema-form is a Phase 2.5 improvement. The runner validates settings
// server-side anyway, so we just need a way to get JSON in.
export default function PluginEditor({
  inst,
  typeDescription,
  defaults,
}: {
  inst: any;
  typeDescription: string;
  defaults: { ttlSec: number; w: number; h: number };
}) {
  const router = useRouter();
  const [name, setName] = useState<string>(inst.name);
  const [width, setWidth] = useState<number>(inst.width);
  const [height, setHeight] = useState<number>(inst.height);
  const [ttlSec, setTtlSec] = useState<number>(inst.ttlSec ?? defaults.ttlSec);
  const [settingsText, setSettingsText] = useState<string>(JSON.stringify(inst.settings ?? {}, null, 2));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<number>(Date.now());
  const [lastError, setLastError] = useState<any>(inst.lastError ?? null);

  async function save() {
    setBusy(true);
    setErr(null);
    let settings: unknown;
    try {
      settings = JSON.parse(settingsText);
    } catch (e: any) {
      setErr(`Settings JSON: ${e.message}`);
      setBusy(false);
      return;
    }
    try {
      const r = await fetch(`/api/plugins/instances/${inst._id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, width, height, ttlSec, settings }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "save failed");
      setPreview(Date.now());
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  }

  async function refresh() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/plugins/instances/${inst._id}/refresh`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).error ?? "refresh failed");
      const d = await r.json();
      setLastError(d.lastError ?? null);
      setPreview(Date.now());
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  }

  async function destroy() {
    if (!confirm("Delete this plugin instance? Devices that reference it will render nothing where it lived.")) return;
    setBusy(true);
    try {
      await fetch(`/api/plugins/instances/${inst._id}`, { method: "DELETE" });
      router.push("/plugins");
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="text-sm text-neutral-400">{typeDescription}</div>
        <label className="block">
          <span className="text-sm text-neutral-400">Name</span>
          <input className="block w-full mt-1 bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
                 value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="text-sm text-neutral-400">Width</span>
            <input type="number" className="block w-full mt-1 bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
                   value={width} onChange={(e) => setWidth(Number(e.target.value))} />
          </label>
          <label className="block">
            <span className="text-sm text-neutral-400">Height</span>
            <input type="number" className="block w-full mt-1 bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
                   value={height} onChange={(e) => setHeight(Number(e.target.value))} />
          </label>
          <label className="block">
            <span className="text-sm text-neutral-400">TTL (sec)</span>
            <input type="number" className="block w-full mt-1 bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
                   value={ttlSec} onChange={(e) => setTtlSec(Number(e.target.value))} />
          </label>
        </div>
        <label className="block">
          <span className="text-sm text-neutral-400">Settings (JSON)</span>
          <textarea
            className="block w-full mt-1 bg-neutral-900 border border-neutral-700 rounded px-3 py-2 font-mono text-xs"
            rows={18}
            value={settingsText}
            onChange={(e) => setSettingsText(e.target.value)}
          />
        </label>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <div className="flex gap-2">
          <button onClick={save} disabled={busy} className="btn btn-primary">Save</button>
          <button onClick={refresh} disabled={busy} className="btn">Refresh now</button>
          <button onClick={destroy} disabled={busy} className="btn text-red-400">Delete</button>
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-sm text-neutral-400">Latest render ({width}×{height})</div>
        <div className="border border-neutral-800 bg-white inline-block">
          <img
            src={`/api/plugins/instances/${inst._id}/preview.png?t=${preview}`}
            alt=""
            style={{ width: "100%", maxWidth: 600 }}
            className="pixelated"
          />
        </div>
        {lastError && (
          <div className="card border-red-700 text-red-300 text-sm">
            <div className="font-medium">Last error</div>
            <div className="font-mono text-xs mt-1">{lastError.message}</div>
            <div className="text-xs text-neutral-500 mt-1">{new Date(lastError.at).toLocaleString()}</div>
          </div>
        )}
        <div className="text-xs text-neutral-500">
          To use this plugin, open a device's layout editor and add a <em>plugin</em> block pointing at this instance.
        </div>
      </div>
    </div>
  );
}
