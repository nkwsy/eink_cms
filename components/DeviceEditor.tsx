"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Block, PublishedRef } from "@/lib/mongo";
import { editorDims } from "@/lib/dims";
import LayoutEditor from "./LayoutEditor";
import VersionsPanel from "./VersionsPanel";

type OtherDevice = { _id: string; name: string; width: number; height: number; rotation?: number };

type Props = {
  device: any;
  assets: any[];
  plugins?: any[];
  otherDevices?: OtherDevice[];
};

type Status = {
  published: PublishedRef | null;
  lastPull: { at: string; userAgent?: string } | null;
  pullCount: number;
  draftDiffers: boolean;
  sizeMatches: boolean;
  draftRev: number;
  liveVersion: number | null;
  scheduled: { number: number; at: string } | null;
};

// Where the draft stands against what the server holds.
type DraftState = "saved" | "waiting" | "saving" | "failed" | "conflict";

// Text weight choices map to how much of a pixel a letter must cover to be inked.
const TEXT_WEIGHTS = [
  { label: "Light", cutoff: 160 },
  { label: "Normal", cutoff: 128 },
  { label: "Heavy", cutoff: 96 },
];

const AUTOSAVE_MS = 1500;

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

export default function DeviceEditor({ device, assets, plugins = [], otherDevices = [] }: Props) {
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
  // Changing this rebuilds the layout editor around a layout that was
  // replaced from outside it (going back to a version).
  const [editorKey, setEditorKey] = useState(0);
  const [busy, setBusy] = useState<null | "settings" | "promote" | "other">(null);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  // Changes after each save or promote so the preview images reload. Starts at
  // a fixed value so the server-rendered page and the browser agree.
  const [previewBust, setPreviewBust] = useState(0);
  const [versionsKey, setVersionsKey] = useState(0);
  const [promoteAt, setPromoteAt] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [status, setStatus] = useState<Status>({
    published: device.published ?? null,
    lastPull: device.lastPull ?? null,
    pullCount: device.pullCount ?? 0,
    draftDiffers: hasSavedDraft,
    sizeMatches: true,
    draftRev: device.draftRev ?? 0,
    liveVersion: device.liveVersion?.number ?? null,
    scheduled: device.scheduled ? { number: device.scheduled.number, at: String(device.scheduled.at) } : null,
  });

  // Filled in after mount so the server-rendered page and the browser agree.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  // ---- draft autosave ----
  // The draft is saved a moment after each change. `layoutRef` is always the
  // newest layout; `savedLayout` is the one the server has.
  const [draftState, setDraftState] = useState<DraftState>("saved");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const layoutRef = useRef<Block[]>(layout);
  const savedLayout = useRef<Block[]>(layout);
  const draftRev = useRef<number>(device.draftRev ?? 0);
  const saving = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conflict = useRef(false);
  layoutRef.current = layout;

  const saveDraftNow = useCallback(async (opts: { overwrite?: boolean } = {}): Promise<boolean> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    // One save at a time; a change made meanwhile is picked up by the loop.
    if (saving.current) await saving.current;
    const run = (async () => {
      while (layoutRef.current !== savedLayout.current) {
        const sending = layoutRef.current;
        setDraftState("saving");
        let res: Response;
        try {
          res = await fetch(`/api/devices/${device._id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(
              opts.overwrite ? { draftLayout: sending } : { draftLayout: sending, baseDraftRev: draftRev.current }
            ),
          });
        } catch {
          setDraftState("failed");
          return false;
        }
        const j = await res.json().catch(() => ({}));
        if (res.status === 409 && j.conflict) {
          conflict.current = true;
          setDraftState("conflict");
          return false;
        }
        if (!res.ok) {
          setDraftState("failed");
          return false;
        }
        draftRev.current = j.draftRev ?? draftRev.current + 1;
        savedLayout.current = sending;
        setSavedAt(new Date());
        setPreviewBust(Date.now());
      }
      setDraftState("saved");
      return true;
    })();
    saving.current = run;
    try {
      return await run;
    } finally {
      if (saving.current === run) saving.current = null;
    }
  }, [device._id]);

  useEffect(() => {
    if (layout === savedLayout.current) return;
    // While another window's change is unresolved, do not keep trying.
    if (conflict.current) return;
    setDraftState("waiting");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (!conflict.current) saveDraftNow();
    }, AUTOSAVE_MS);
  }, [layout, saveDraftNow]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Leaving with a change that has not reached the server yet: ask first.
  useEffect(() => {
    function onLeave(e: BeforeUnloadEvent) {
      if (layoutRef.current === savedLayout.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  // Puts a layout that came from the server (a version) into the editor.
  function adoptLayout(j: any) {
    const next: Block[] = Array.isArray(j.draftLayout) ? j.draftLayout : [];
    savedLayout.current = next;
    layoutRef.current = next;
    draftRev.current = j.draftRev ?? draftRev.current;
    setLayout(next);
    // A version brings its background and text weight with it; the server
    // has already stored them.
    const bg = j.background === "white" || j.background === "black" ? j.background : background;
    const ink = typeof j.inkCutoff === "number" ? j.inkCutoff : inkCutoff;
    setBackground(bg);
    setInkCutoff(ink);
    savedSettings.current = settingsJson({ background: bg, inkCutoff: ink });
    setEditorKey((k) => k + 1);
    conflict.current = false;
    setDraftState("saved");
  }

  // ---- device settings (saved with their own button) ----
  function settingsJson(over: Record<string, unknown> = {}): string {
    return JSON.stringify({ name, slug, width, height, rotation, bitDepth, background, inkCutoff, model, ...over });
  }
  const settings = useMemo(
    () => JSON.stringify({ name, slug, width, height, rotation, bitDepth, background, inkCutoff, model }),
    [name, slug, width, height, rotation, bitDepth, background, inkCutoff, model]
  );
  const savedSettings = useRef<string | null>(null);
  if (savedSettings.current === null) savedSettings.current = settings;
  const settingsChanged = settings !== savedSettings.current;

  async function saveSettings(): Promise<boolean> {
    const res = await fetch(`/api/devices/${device._id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, slug, width, height, rotation, bitDepth, background, inkCutoff, model }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNote({ text: j.error ?? "Could not save the settings.", bad: true });
      return false;
    }
    // The server tidies the slug and model name; show what it stored.
    const storedSlug = typeof j.slug === "string" ? j.slug : slug;
    const storedModel = typeof j.model === "string" ? j.model : model;
    setSlug(storedSlug);
    setModel(storedModel);
    savedSettings.current = settingsJson({ slug: storedSlug, model: storedModel });
    setPreviewBust(Date.now());
    return true;
  }

  async function onSaveSettings() {
    setBusy("settings");
    setNote(null);
    if (await saveSettings()) setNote({ text: "Settings saved." });
    await refreshStatus();
    setBusy(null);
  }

  /** Gets everything onto the server before an action that reads it there. */
  async function saveEverything(): Promise<boolean> {
    if (draftState === "conflict") {
      setNote({ text: "Sort out the draft that was changed somewhere else first (see above).", bad: true });
      return false;
    }
    if (settingsChanged && !(await saveSettings())) return false;
    if (!(await saveDraftNow())) {
      setNote({ text: "The draft could not be saved, so nothing was done.", bad: true });
      return false;
    }
    return true;
  }

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

  // A timed promote that goes live while the page is open adds to the list.
  useEffect(() => { setVersionsKey((k) => k + 1); }, [status.liveVersion]);

  async function promote(at?: Date) {
    const question = at
      ? `Promote this screen at ${when(at)}?\n\nThe finished image is drawn and stored now. From that time on, the sign shows it the next time it is powered on.`
      : "Promote this screen to live?\n\nThe finished image is stored now, and the sign will show it the next time it is powered on.";
    if (!confirm(question)) return;
    setBusy("promote");
    setNote(null);
    if (await saveEverything()) {
      const res = await fetch(`/api/devices/${device._id}/promote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(at ? { at: at.toISOString() } : {}),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setNote({ text: j.error ?? "Promote failed", bad: true });
      else if (j.status === "scheduled") {
        setNote({ text: `Version ${j.version} is stored and goes live ${when(j.at)}.` });
        setShowSchedule(false);
        setPromoteAt("");
      } else setNote({ text: `Version ${j.version} is live.` });
      setPreviewBust(Date.now());
      setVersionsKey((k) => k + 1);
      await refreshStatus();
      router.refresh();
    }
    setBusy(null);
  }

  function promoteLater() {
    const at = promoteAt ? new Date(promoteAt) : null;
    if (!at || Number.isNaN(at.getTime())) {
      setNote({ text: "Choose a date and time first.", bad: true });
      return;
    }
    if (at.getTime() <= Date.now()) {
      setNote({ text: "That time has already passed. Use Promote to live instead.", bad: true });
      return;
    }
    promote(at);
  }

  async function cancelSchedule() {
    if (!confirm("Call off the timed promote?\n\nIts version stays in the list as a checkpoint.")) return;
    setBusy("other");
    const res = await fetch(`/api/devices/${device._id}/schedule`, { method: "DELETE" });
    if (!res.ok) setNote({ text: "Could not call off the timed promote.", bad: true });
    setVersionsKey((k) => k + 1);
    await refreshStatus();
    setBusy(null);
  }

  async function saveVersion() {
    const label = prompt("Name for this version (optional)", "");
    if (label === null) return;
    setBusy("other");
    setNote(null);
    if (await saveEverything()) {
      const res = await fetch(`/api/devices/${device._id}/versions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const j = await res.json().catch(() => ({}));
      setNote(res.ok ? { text: `Saved as version ${j.number}.` } : { text: j.error ?? "Could not save a version.", bad: true });
      setVersionsKey((k) => k + 1);
    }
    setBusy(null);
  }

  async function copyDraftTo(targetDeviceId: string) {
    const target = otherDevices.find((d) => d._id === targetDeviceId);
    if (!target) return;
    if (!confirm(`Copy this draft to the draft of "${target.name}"?\n\nThat sign is not changed until its draft is promoted.`)) return;
    setBusy("other");
    setNote(null);
    if (await saveEverything()) {
      const res = await fetch(`/api/devices/${device._id}/versions/draft`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "copy", targetDeviceId }),
      });
      const j = await res.json().catch(() => ({}));
      setNote(res.ok
        ? {
            text: `Copied to the draft of ${j.targetName}.` +
              (j.sizeDiffers ? " That screen is a different size, so the layout will need adjusting." : "") +
              (j.keptDraftAs ? ` Its previous draft was kept as version ${j.keptDraftAs}.` : ""),
          }
        : { text: j.error ?? "Could not copy the draft.", bad: true });
    }
    setBusy(null);
  }

  async function post(path: string, question: string, failed: string) {
    if (!confirm(question)) return;
    setBusy("other");
    setNote(null);
    const res = await fetch(`/api/devices/${device._id}/${path}`, { method: "POST" });
    if (!res.ok) setNote({ text: failed, bad: true });
    setPreviewBust(Date.now());
    await refreshStatus();
    router.refresh();
    setBusy(null);
  }

  async function showCalibration() {
    setBusy("other");
    const ok = await saveEverything();
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
    setNote(res.ok ? { text: `Saved as template "${tplName}".` } : { text: "Save-as-template failed", bad: true });
  }

  async function del() {
    if (!confirm(`Delete device "${name}"? Its versions are deleted too. This cannot be undone.`)) return;
    savedLayout.current = layoutRef.current; // nothing left to save
    await fetch(`/api/devices/${device._id}`, { method: "DELETE" });
    router.push("/");
  }

  function onVersionReplaced(j: any, what: "draft" | "live") {
    adoptLayout(j);
    const extras =
      (j.keptDraftAs ? ` Your previous draft was kept as version ${j.keptDraftAs}.` : "") +
      (j.copiedCards || j.copiedPlugins
        ? ` ${(j.copiedCards ?? 0) + (j.copiedPlugins ?? 0)} card or plugin had changed since, so a copy as it was then is used.`
        : "");
    setNote({
      text: what === "live"
        ? `Version ${j.version} is live.${extras}`
        : `The draft now starts from that version. The sign is not changed until you promote.${extras}`,
    });
    setPreviewBust(Date.now());
    setVersionsKey((k) => k + 1);
    refreshStatus();
    router.refresh();
  }

  const { published, lastPull, scheduled } = status;
  // The server's draft is newer than the one this page last saw or wrote.
  const changedElsewhere = draftState === "saved" && status.draftRev > draftRev.current;
  const pulledCurrent =!!published && !!lastPull && new Date(lastPull.at) >= new Date(published.at);
  const draftPreview = `/api/devices/${device._id}/render?renderer=crisp&source=draft&format=png&t=${previewBust}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{name}</h1>
          <div className="text-sm text-neutral-500 font-mono">{origin}/{slug}/current.bmp</div>
        </div>
        <div className="flex gap-2 items-center flex-wrap justify-end">
          <Link href="/" className="btn">Back</Link>
          <button className="btn btn-danger" onClick={del}>Delete</button>
          <button className="btn" onClick={saveAsTemplate} disabled={!!busy}>Save as template</button>
          {otherDevices.length > 0 && (
            <select className="input !w-auto" value="" disabled={!!busy}
              onChange={(e) => { const id = e.target.value; e.target.value = ""; if (id) copyDraftTo(id); }}>
              <option value="">Copy draft to…</option>
              {otherDevices.map((d) => <option key={d._id} value={d._id}>{d.name} ({d.width}×{d.height})</option>)}
            </select>
          )}
          <button className="btn" onClick={saveVersion} disabled={!!busy}>Save version</button>
          <button className="btn btn-primary" onClick={() => promote()} disabled={!!busy}>
            {busy === "promote" ? "Promoting…" : "Promote to live"}
          </button>
        </div>
      </div>

      {(draftState === "conflict" || changedElsewhere) && (
        <div className="card border-amber-600 text-amber-200 text-sm">
          <p>
            This screen's draft was changed somewhere else — another window, a template or a copy from another screen — after you opened it here.
            {draftState === "conflict" ? " Your changes here have not been saved." : " What you see here is the older draft."}
          </p>
          <div className="flex gap-2 mt-2">
            <button className="btn" onClick={() => { savedLayout.current = layoutRef.current; window.location.reload(); }}>Load the other draft</button>
            {draftState === "conflict" && (
              <button className="btn" onClick={async () => { conflict.current = false; setDraftState("waiting"); await saveDraftNow({ overwrite: true }); }}>Keep mine and overwrite it</button>
            )}
          </div>
        </div>
      )}
      {note && <div className={`card text-sm ${note.bad ? "border-red-700 text-red-300" : "border-emerald-800 text-emerald-300"}`}>{note.text}</div>}
      <div className="text-xs">
        {draftState === "saving" && <span className="text-neutral-400">Saving draft…</span>}
        {draftState === "waiting" && <span className="text-neutral-400">Draft changed — saving in a moment…</span>}
        {draftState === "failed" && (
          <span className="text-red-400">The draft could not be saved. <button className="underline" onClick={() => saveDraftNow()}>Try again</button></span>
        )}
        {draftState === "conflict" && <span className="text-amber-400">Draft not saved.</span>}
        {draftState === "saved" && (
          savedAt
            ? <span className="text-emerald-400">Draft saved {savedAt.toLocaleTimeString()}.</span>
            : <span className="text-neutral-500">The draft saves itself as you work.</span>
        )}
        {draftState === "saved" && status.draftDiffers && <span className="text-amber-400"> It differs from the live screen — promote to make it live.</span>}
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
      {settingsChanged && (
        <div className="flex items-center gap-3 text-xs">
          <span className="text-amber-400">These settings are not saved yet. Unlike the layout, they are only saved when you say so.</span>
          <button className="btn" onClick={onSaveSettings} disabled={!!busy}>{busy === "settings" ? "Saving…" : "Save settings"}</button>
        </div>
      )}

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
            key={editorKey}
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
              Exactly what Promote will store: pure black and white, {width}×{height}. It updates each time the draft saves; click the picture to open it full size.
            </p>
            <button className="btn w-full mt-2" onClick={() => setPreviewBust(Date.now())}>Refresh preview</button>
          </div>

          <div className="card text-sm">
            <h4 className="font-medium mb-2">Live on the sign{status.liveVersion ? ` — version ${status.liveVersion}` : ""}</h4>
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

            <div className="mt-3 pt-3 border-t border-neutral-800">
              {scheduled ? (
                <>
                  <p className="text-amber-400">Version {scheduled.number} goes live {when(scheduled.at)}.</p>
                  <p className="text-xs text-neutral-500 mt-1">Its image is already stored. A sign powered on after that time gets it.</p>
                  <button className="btn w-full mt-2" disabled={!!busy} onClick={cancelSchedule}>Call it off</button>
                </>
              ) : showSchedule ? (
                <>
                  <label className="label">Promote the draft at</label>
                  <input type="datetime-local" className="input" value={promoteAt} onChange={(e) => setPromoteAt(e.target.value)} />
                  <p className="text-xs text-neutral-500 mt-1">The image is drawn and stored now. A sign powered on after this time gets it; one powered on before keeps the current screen.</p>
                  <div className="flex gap-2 mt-2">
                    <button className="btn flex-1" disabled={!!busy} onClick={promoteLater}>Promote at this time</button>
                    <button className="btn" onClick={() => setShowSchedule(false)}>Cancel</button>
                  </div>
                </>
              ) : (
                <button className="text-xs text-emerald-400" onClick={() => setShowSchedule(true)}>Promote at a set time instead…</button>
              )}
            </div>
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

      <VersionsPanel
        deviceId={device._id}
        otherDevices={otherDevices}
        refreshKey={versionsKey}
        disabled={!!busy}
        beforeAction={saveEverything}
        onReplaced={onVersionReplaced}
        onMessage={(text, bad) => setNote({ text, bad })}
      />
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
