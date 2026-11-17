"use client";
import { useCallback, useEffect, useState } from "react";

export type VersionRow = {
  _id: string;
  number: number;
  kind: "promoted" | "saved" | "scheduled";
  label?: string;
  createdAt: string;
  promotedAt?: string;
  restoredFrom?: number;
  legacy: boolean;
  width: number;
  height: number;
  isLive: boolean;
  scheduledFor?: string;
};

type OtherDevice = { _id: string; name: string; width: number; height: number };

type Props = {
  deviceId: string;
  otherDevices: OtherDevice[];
  // Changes whenever the list may be out of date.
  refreshKey: number;
  disabled: boolean;
  // Saves anything unsaved first; false means it could not and the action should stop.
  beforeAction: () => Promise<boolean>;
  // The draft (and possibly the live screen) was replaced on the server.
  onReplaced: (result: any, what: "draft" | "live") => void;
  onMessage: (text: string, bad?: boolean) => void;
};

function when(d: string | undefined | null): string {
  if (!d) return "";
  return new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export default function VersionsPanel({ deviceId, otherDevices, refreshKey, disabled, beforeAction, onReplaced, onMessage }: Props) {
  const [rows, setRows] = useState<VersionRow[] | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/devices/${deviceId}/versions`, { cache: "no-store" });
      if (res.ok) setRows((await res.json()).versions);
    } catch {
      // Keep showing the last list; the next refresh tries again.
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function act(v: VersionRow, action: "draft" | "live" | "copy", extra: Record<string, unknown> = {}) {
    setWorking(v._id);
    try {
      if (action !== "copy" && !(await beforeAction())) return;
      const res = await fetch(`/api/devices/${deviceId}/versions/${v._id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        onMessage(j.error ?? "That did not work.", true);
        return;
      }
      if (action === "copy") {
        onMessage(
          `Copied version ${v.number} to the draft of ${j.targetName}.` +
          (j.sizeDiffers ? " That screen is a different size, so the layout will need adjusting." : "") +
          (j.keptDraftAs ? ` Its previous draft was kept as version ${j.keptDraftAs}.` : "")
        );
      } else {
        onReplaced(j, action);
      }
      await load();
    } finally {
      setWorking(null);
    }
  }

  function toDraft(v: VersionRow) {
    if (!confirm(`Start the draft from version ${v.number}?\n\nThe sign is not changed. If your current draft is not saved as a version yet, it is saved as one first.`)) return;
    act(v, "draft");
  }

  function toLive(v: VersionRow) {
    const how = v.legacy
      ? "It goes back to being drawn by the old renderer, as it was."
      : "It is drawn again with today's plugin data and becomes a new version.";
    if (!confirm(`Put version ${v.number} back on the sign?\n\n${how} The sign shows it the next time it is powered on. If your current draft is not saved as a version yet, it is saved as one first.`)) return;
    act(v, "live");
  }

  function copyTo(v: VersionRow, targetDeviceId: string) {
    const target = otherDevices.find((d) => d._id === targetDeviceId);
    if (!target) return;
    if (!confirm(`Copy version ${v.number} to the draft of "${target.name}"?\n\nThat sign is not changed until its draft is promoted.`)) return;
    act(v, "copy", { targetDeviceId });
  }

  async function rename(v: VersionRow) {
    const label = prompt(`Name for version ${v.number} (leave empty for none)`, v.label ?? "");
    if (label === null) return;
    const res = await fetch(`/api/devices/${deviceId}/versions/${v._id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (!res.ok) onMessage("Could not rename the version.", true);
    await load();
  }

  if (rows === null) return <div className="card text-sm text-neutral-500">Loading versions…</div>;

  const shown = showAll ? rows : rows.slice(0, 8);

  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-medium">Versions</h3>
        <span className="text-xs text-neutral-500">{rows.length} kept (the newest 50 are kept)</span>
      </div>
      <p className="text-xs text-neutral-500 mb-3">
        Every promote makes a numbered version, and <em>Save version</em> keeps a checkpoint of the draft. Going back never removes anything: it makes a new draft or a new version.
      </p>
      {rows.length === 0 && (
        <p className="text-sm text-neutral-400">No versions yet. The first promote makes version 1.</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {shown.map((v) => {
          const img = `/api/devices/${deviceId}/versions/${v._id}/image.png`;
          const isWorking = working === v._id;
          return (
            <div key={v._id} className={`rounded-md border p-2 text-sm ${v.isLive ? "border-emerald-600" : "border-neutral-800"}`}>
              <a href={img} target="_blank" className="block bg-black border border-neutral-800 overflow-hidden" style={{ aspectRatio: `${v.width} / ${v.height}`, maxHeight: 220 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${img}?w=480`} alt={`Version ${v.number}`} loading="lazy" className="w-full h-full object-contain" />
              </a>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="font-medium">Version {v.number}</span>
                {v.isLive
                  ? <span className="text-xs text-emerald-400">Live now</span>
                  : v.scheduledFor
                    ? <span className="text-xs text-amber-400">Goes live {when(v.scheduledFor)}</span>
                    : v.kind === "promoted"
                      ? <span className="text-xs text-neutral-500">Was live</span>
                      : <span className="text-xs text-neutral-500">Checkpoint</span>}
              </div>
              <div className="text-xs text-neutral-500">
                {v.kind === "promoted" ? `Promoted ${when(v.promotedAt ?? v.createdAt)}` : `Saved ${when(v.createdAt)}`}
                {v.restoredFrom != null && ` · from version ${v.restoredFrom}`}
                {v.legacy && " · old renderer"}
              </div>
              <button className="text-xs text-left mt-1 text-neutral-300 hover:text-emerald-400" onClick={() => rename(v)} title="Rename">
                {v.label ? v.label : <span className="text-neutral-600">Add a name…</span>}
              </button>
              <div className="flex flex-wrap gap-1 mt-2">
                <button className="btn !px-2 !py-1 text-xs" disabled={disabled || isWorking} onClick={() => toDraft(v)}>
                  {isWorking ? "Working…" : "Edit from this"}
                </button>
                {!v.isLive && !v.scheduledFor && (
                  <button className="btn !px-2 !py-1 text-xs" disabled={disabled || isWorking} onClick={() => toLive(v)}>Make live</button>
                )}
                {otherDevices.length > 0 && (
                  <select className="input !w-auto !py-1 text-xs" value="" disabled={disabled || isWorking}
                    onChange={(e) => { const id = e.target.value; e.target.value = ""; if (id) copyTo(v, id); }}>
                    <option value="">Copy to…</option>
                    {otherDevices.map((d) => <option key={d._id} value={d._id}>{d.name} ({d.width}×{d.height})</option>)}
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {rows.length > 8 && (
        <button className="btn mt-3" onClick={() => setShowAll((s) => !s)}>
          {showAll ? "Show fewer" : `Show all ${rows.length} versions`}
        </button>
      )}
    </div>
  );
}
