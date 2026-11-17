"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Block, PublishedRef } from "@/lib/mongo";
import { editorDims } from "@/lib/dims";
import LayoutEditor from "./LayoutEditor";

type Props = {
  device: any;
  assets: any[];
  plugins?: any[];
};

type Status = {
  published: PublishedRef | null;
  lastPull: { at: string; userAgent?: string } | null;
  pullCount: number;
  draftDiffers: boolean;
  canUndoPromote: boolean;
  sizeMatches: boolean;
};

// Text weight choices map to how much of a pixel a letter must cover to be inked.
const TEXT_WEIGHTS = [
  { label: "Light", cutoff: 160 },
  { label: "Normal", cutoff: 128 },
  { label: "Heavy", cutoff: 96 },
];

function when(d: string | Date | undefined | null): string {
  if (!d) return "";
  return new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function puller(userAgent?: string): string {
  if (!userAgent) return "an unknown client";
  if (/python-requests|curl|wget/i.test(userAgent)) return "the sign";
  if (/mozilla/i.test(userAgent)) return "a web browser";
  return userAgent.slice(0, 40);
}

export default function DeviceEditor({ device, assets, plugins = [] }: Props) {
  const router = useRouter();
  const [name, setName] = useState(device.name);
  const [slug, setSlug] = useState(device.slug);
  const [width, setWidth] = useState(device.width);
  const [height, setHeight] = useState(device.height);
  const [rotation, setRotation] = useState(device.rotation ?? 0);
  const [bitDepth, setBitDepth] = useState<1 | 24>(device.bitDepth === 24 ? 24 : 1);
  const [background, setBackground] = useState<"white" | "black">(device.background === "white" ? "white" : "black");
  const [inkCutoff, setInkCutoff] = useState<number>(device.inkCutoff ?? 128);
  const [model, setModel] = useState<string>(device.model ?? "");
  // The editor always works on the draft. With no draft saved, it starts
  // from the live layout.
  const hasSavedDraft = Array.isArray(device.draftLayout) && device.draftLayout.length > 0;
  const [layout, setLayout] = useState<Block[]>(hasSavedDraft ? device.draftLayout : (device.layout ?? []));
  const [busy, setBusy] = useState<null | "save" | "promote" | "other">(null);
  const [saved, setSaved] = useState<null | Date>(null);
  const [err, setErr] = useState<string | null>(null);
  // Changes after each save or promote so the preview images reload. Starts at
  // a fixed value so the server-rendered page and the browser agree.
  const [previewBust, setPreviewBust] = useState(0);
  const [status, setStatus] = useState<Status>({
    published: device.published ?? null,
    lastPull: device.lastPull ?? null,
    pullCount: device.pullCount ?? 0,
    draftDiffers: hasSavedDraft,
    canUndoPromote: false,
    sizeMatches: true,
  });

  // Filled in after mount so the server-rendered page and the browser agree.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  // Everything a save would write, as one string, to tell whether there are
  // unsaved edits.
  const snapshot = useMemo(
    () => JSON.stringify({ name, slug, width, height, rotation, bitDepth, background, inkCutoff, model, layout }),
    [name, slug, width, height, rotation, bitDepth, background, inkCutoff, model, layout]
  );
  const savedSnapshot = useRef<string | null>(null);
  if (savedSnapshot.current === null) savedSnapshot.current = snapshot;
  const unsaved = snapshot !== savedSnapshot.current;

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/devices/${device._id}/status`, { cache: "no-store" });
      if (res.ok) setStatus(await res.json());
    } catch {
      // Status is a convenience; the next poll will try again.
    }
  }, [device._id]);

  // Keep "last pulled" current while the page is open, so whoever powered the
  // sign on can be told it took.
  useEffect(() => {
    refreshStatus();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refreshStatus();
    }, 15000);
    return () => clearInterval(t);
  }, [refreshStatus]);

  async function saveDraft(): Promise<boolean> {
    setErr(null);
    const res = await fetch(`/api/devices/${device._id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, slug, width, height, rotation, bitDepth, background, inkCutoff, model, draftLayout: layout }),
    });
    if (!res.ok) {
      setErr("Save failed");
      return false;
    }
    savedSnapshot.current = snapshot;
    setSaved(new Date());
    setPreviewBust(Date.now());
    return true;
  }

  async function onSave() {
    setBusy("save");
    await saveDraft();
    await refreshStatus();
    setBusy(null);
  }

  async function promote() {
    if (!confirm("Promote this screen to live?\n\nThe finished image is stored now, and the sign will show it the next time it is powered on.")) return;
    setBusy("promote");
    if (await saveDraft()) {
      const res = await fetch(`/api/devices/${device._id}/promote`, { method: "POST" });
      if (!res.ok) setErr("Promote failed");
      setPreviewBust(Date.now());
      await refreshStatus();
      router.refresh();
    }
    setBusy(null);
  }

  async function post(path: string, question: string, failed: string) {
    if (!confirm(question)) return;
    setBusy("other");
    setErr(null);
    const res = await fetch(`/api/devices/${device._id}/${path}`, { method: "POST" });
    if (!res.ok) setErr(failed);
    setPreviewBust(Date.now());
    await refreshStatus();
    router.refresh();
    setBusy(null);
  }

  async function showCalibration() {
    setBusy("other");
    const ok = await saveDraft();
    setBusy(null);
    if (!ok) return;
    await post(
      "calibration",
      "Show the calibration chart on this sign?\n\nIt replaces the live image until you put the previous one back. Your layout is not changed.",
      "Could not show the calibration chart"
    );
  }

  async function saveAsTemplate() {
    const tplName = prompt("Template name?", `${name} template`);
    if (!tplName) return;
    setBusy("other");
    const res = await fetch("/api/layouts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: tplName, width, height, background, layout }),
    });
    setBusy(null);
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

  const { published, lastPull } = status;
  const pulledCurrent = !!published && !!lastPull && new Date(lastPull.at) >= new Date(published.at);
  const draftPreview = `/api/devices/${device._id}/render?renderer=crisp&source=draft&format=png&t=${previewBust}`;

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
          <button className="btn" onClick={saveAsTemplate} disabled={!!busy}>Save as template</button>
          <button className="btn" onClick={onSave} disabled={!!busy}>
            {busy === "save" ? "Saving…" : "Save draft"}
          </button>
          <button className="btn btn-primary" onClick={promote} disabled={!!busy}>
            {busy === "promote" ? "Promoting…" : "Promote to live"}
          </button>
        </div>
      </div>

      {err && <div className="card border-red-700 text-red-300">{err}</div>}
      <div className="text-xs">
        {unsaved
          ? <span className="text-amber-400">Unsaved changes.</span>
          : saved
            ? <span className="text-emerald-400">Draft saved {saved.toLocaleTimeString()}.</span>
            : <span className="text-neutral-500">No unsaved changes.</span>}
        {!unsaved && status.draftDiffers && <span className="text-amber-400"> The draft differs from the live screen — promote to make it live.</span>}
      </div>

      <div className="grid grid-cols-4 lg:grid-cols-8 gap-3">
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
        <div><label className="label">Text weight</label>
          <select className="input" value={inkCutoff} onChange={(e) => setInkCutoff(Number(e.target.value))}>
            {TEXT_WEIGHTS.map((w) => <option key={w.cutoff} value={w.cutoff}>{w.label}</option>)}
            {!TEXT_WEIGHTS.some((w) => w.cutoff === inkCutoff) && <option value={inkCutoff}>Custom ({inkCutoff})</option>}
          </select>
        </div>
        <div><label className="label">Screen model</label>
          <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. 28in-mono" />
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
            <h4 className="font-medium mb-2">Draft preview</h4>
            <a href={draftPreview} target="_blank" className="block bg-black border border-neutral-700 max-h-[420px] overflow-hidden flex items-center justify-center">
              <img src={draftPreview} alt="Draft preview" className="max-w-full max-h-[420px] w-auto h-auto object-contain" />
            </a>
            <p className="text-xs text-neutral-500 mt-2">
              Exactly what Promote will store: pure black and white, {width}×{height}. Shows the saved draft — click <em>Save draft</em> to update it, and click the picture to open it full size.
            </p>
            <button className="btn w-full mt-2" onClick={() => setPreviewBust(Date.now())}>Refresh preview</button>
          </div>

          <div className="card text-sm">
            <h4 className="font-medium mb-2">Live on the sign</h4>
            <a href={`/${slug}/current.png`} target="_blank" className="block bg-black border border-neutral-700 max-h-[200px] overflow-hidden flex items-center justify-center">
              <img src={`/${slug}/current.png?t=${previewBust}`} alt="Live image" className="max-w-full max-h-[200px] w-auto h-auto object-contain" />
            </a>
            <div className="mt-2 space-y-1">
              {!published && (
                <p className="text-neutral-400">
                  Not promoted yet. This screen still uses the old renderer and looks as it always has; it is drawn each time the sign pulls. Promote to switch it to the crisp image.
                </p>
              )}
              {published?.kind === "screen" && (
                <p className="text-emerald-400 font-medium">Ready to pull. Promoted {when(published.at)}.</p>
              )}
              {published?.kind === "calibration" && (
                <p className="text-amber-400 font-medium">Calibration chart is showing since {when(published.at)}.</p>
              )}
              {published && !status.sizeMatches && (
                <p className="text-amber-400">The stored image is {published.width}×{published.height}, but the device is now {width}×{height}. Promote again.</p>
              )}
              {lastPull
                ? (
                  <p className={pulledCurrent ? "text-emerald-400" : "text-neutral-400"}>
                    Last pulled {when(lastPull.at)} by {puller(lastPull.userAgent)}
                    {published ? (pulledCurrent ? " — it has this image." : " — before this image was promoted.") : "."}
                  </p>
                )
                : <p className="text-neutral-400">Never pulled.</p>}
            </div>
            {published?.kind === "calibration" && (
              <button className="btn w-full mt-2" disabled={!!busy}
                onClick={() => post("restore", "Put the previous live image back?", "Could not restore the previous image")}>
                Put the previous image back
              </button>
            )}
            {status.canUndoPromote && (
              <button className="btn w-full mt-2" disabled={!!busy}
                onClick={() => post("restore", "Undo the last promote?\n\nThe sign goes back to the screen that was live before it. Your draft is kept.", "Could not undo the promote")}>
                Undo last promote
              </button>
            )}
          </div>

          <div className="card text-sm">
            <h4 className="font-medium mb-2">Calibration chart</h4>
            <p className="text-xs text-neutral-500">
              A test chart for this panel: grey levels, line weights, text weights and picture treatments. Show it on the sign once to decide how screens should be drawn.
            </p>
            <div className="flex gap-2 mt-2">
              <a className="btn flex-1 text-center" href={`/api/devices/${device._id}/calibration`} target="_blank">Preview</a>
              <button className="btn flex-1" disabled={!!busy} onClick={showCalibration}>Show on this sign</button>
            </div>
          </div>

          <SettingsFileCard model={model} slug={slug} />

          <div className="card text-sm">
            <h4 className="font-medium mb-2">Device pull URLs</h4>
            <div className="space-y-1 font-mono text-xs">
              <div>BMP: <a className="text-emerald-400" href={`/${slug}/current.bmp`} target="_blank">/{slug}/current.bmp</a></div>
              <div>PNG: <a className="text-emerald-400" href={`/${slug}/current.png`} target="_blank">/{slug}/current.png</a></div>
            </div>
            <p className="text-xs text-neutral-500 mt-2">Opening the BMP link counts as a pull; the PNG link does not.</p>
          </div>
        </aside>
      </div>
        );
      })()}
    </div>
  );
}

// The device settings file (dv_signage.xml) is shared by every screen of the
// same model, so it is stored per model, not per device.
function SettingsFileCard({ model, slug }: { model: string; slug: string }) {
  const key = model.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setUpdatedAt(null);
    setMsg(null);
    if (!key) return;
    let cancelled = false;
    fetch(`/api/models/${key}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setUpdatedAt(j?.updatedAt ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [key]);

  async function upload(file: File | undefined) {
    if (!file || !key) return;
    const content = await file.text();
    const res = await fetch(`/api/models/${key}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(j.error ?? "Upload failed");
      return;
    }
    setUpdatedAt(j.updatedAt);
    setMsg("Settings file replaced.");
  }

  return (
    <div className="card text-sm">
      <h4 className="font-medium mb-2">Device settings file</h4>
      {!key ? (
        <p className="text-xs text-neutral-500">
          Set a screen model above (for example <code>28in-mono</code>) and save. Every screen of that model then shares one <code>dv_signage.xml</code>.
        </p>
      ) : (
        <>
          <p className="text-xs text-neutral-500">
            Model <code>{key}</code>: {updatedAt ? `dv_signage.xml uploaded ${when(updatedAt)}.` : "no dv_signage.xml uploaded yet."}
          </p>
          <label className="btn w-full mt-2 text-center cursor-pointer block">
            {updatedAt ? "Replace dv_signage.xml" : "Upload dv_signage.xml"}
            <input type="file" accept=".xml,text/xml,application/xml" className="hidden"
              onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {updatedAt && (
            <div className="font-mono text-xs mt-2">
              <a className="text-emerald-400" href={`/${slug}/dv_signage.xml`} target="_blank">/{slug}/dv_signage.xml</a>
            </div>
          )}
          {msg && <p className="text-xs mt-1">{msg}</p>}
        </>
      )}
    </div>
  );
}
