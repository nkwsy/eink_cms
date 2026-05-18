"use client";

import { useState } from "react";

type Device = { _id: string; name: string; slug: string; width: number; height: number };

export default function ApplyToDevice({ layoutId, devices }: { layoutId: string; devices: Device[] }) {
  const [deviceId, setDeviceId] = useState(devices[0]?._id ?? "");
  const [target, setTarget] = useState<"draft" | "live">("draft");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function apply() {
    if (!deviceId) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/layouts/${layoutId}/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId, target }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "apply failed");
      setMsg(`Applied ${j.blocks} blocks to ${target}`);
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    }
    setBusy(false);
  }

  if (devices.length === 0) {
    return <div className="card text-neutral-400">Create a device first to apply a layout.</div>;
  }

  return (
    <div className="card space-y-3 max-w-xl">
      <div className="text-sm text-neutral-400">Apply this template to a device. Draft is invisible to the device until you click Publish.</div>
      <label className="block">
        <span className="text-sm text-neutral-400">Device</span>
        <select className="block w-full mt-1 bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
                value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
          {devices.map((d) => (
            <option key={d._id} value={d._id}>{d.name} ({d.width}×{d.height})</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm text-neutral-400">Target</span>
        <select className="block w-full mt-1 bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
                value={target} onChange={(e) => setTarget(e.target.value as "draft" | "live")}>
          <option value="draft">Draft (safe — won't affect the device yet)</option>
          <option value="live">Live (replaces the device's current layout)</option>
        </select>
      </label>
      <div className="flex gap-2">
        <button onClick={apply} disabled={busy} className="btn btn-primary">{busy ? "Applying…" : "Apply"}</button>
      </div>
      {msg && <div className="text-sm">{msg}</div>}
    </div>
  );
}
