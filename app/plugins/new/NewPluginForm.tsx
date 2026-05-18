"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PluginTypeMeta } from "@/lib/plugins/types";

export default function NewPluginForm({ types }: { types: PluginTypeMeta[] }) {
  const router = useRouter();
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selected = types.find((t) => t.id === typeId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/plugins/instances", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          typeId,
          name: name || `${selected.name} instance`,
          width: selected.defaultSize.w,
          height: selected.defaultSize.h,
          settings: {},
          ttlSec: selected.defaultTtlSec,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "create failed");
      const created = await res.json();
      router.push(`/plugins/${created._id}`);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-2xl">
      <label className="block">
        <span className="text-sm text-neutral-400">Type</span>
        <select
          className="block w-full mt-1 bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
        >
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} — {t.id}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <div className="text-sm text-neutral-400">
          {selected.description}
          <div className="text-xs text-neutral-500 mt-1">
            Default size: {selected.defaultSize.w}×{selected.defaultSize.h} · default TTL: {selected.defaultTtlSec}s
          </div>
        </div>
      )}
      <label className="block">
        <span className="text-sm text-neutral-400">Name</span>
        <input
          className="block w-full mt-1 bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={selected?.name ?? ""}
        />
      </label>
      {err && <div className="text-sm text-red-400">{err}</div>}
      <button type="submit" disabled={busy} className="btn btn-primary">
        {busy ? "Creating…" : "Create"}
      </button>
    </form>
  );
}
