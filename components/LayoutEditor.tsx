"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Block, FontFamily } from "@/lib/mongo";
import { PRESET_BLOCKS, gridBlocks, newBlock } from "@/lib/block";
import ImageProcessor from "./ImageProcessor";

type Asset = { _id: string; name: string; width: number; height: number; variables?: { key: string; label?: string; type: string; default?: string }[] };
type PluginInstance = { _id: string; name: string; typeId: string; width: number; height: number };

type Props = {
  width: number;
  height: number;
  initialLayout: Block[];
  assets: Asset[];
  plugins?: PluginInstance[];
  onChange: (blocks: Block[]) => void;
};

const SNAP = 2;
const MAX_DISPLAY_W = 900;
const MAX_DISPLAY_H = 700;

export default function LayoutEditor({ width, height, initialLayout, assets, plugins = [], onChange }: Props) {
  const [blocks, setBlocks] = useState<Block[]>(initialLayout);
  const [selected, setSelected] = useState<string | null>(null);
  const [showImage, setShowImage] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { onChange(blocks); /* eslint-disable-next-line */ }, [blocks]);

  const scale = useMemo(
    () => Math.min(1, MAX_DISPLAY_W / width, MAX_DISPLAY_H / height),
    [width, height]
  );
  const selectedBlock = blocks.find((b) => b.id === selected) ?? null;

  function update(id: string, patch: Partial<Block>) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  function remove(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    if (selected === id) setSelected(null);
  }
  function duplicate(id: string) {
    const src = blocks.find((b) => b.id === id);
    if (!src) return;
    const copy: Block = { ...src, id: Math.random().toString(36).slice(2, 10), x: src.x + 10, y: src.y + 10 };
    setBlocks((prev) => [...prev, copy]);
    setSelected(copy.id);
  }
  function add(block: Block) {
    setBlocks((prev) => [...prev, block]);
    setSelected(block.id);
  }
  function addGrid(cols: number, rows: number) {
    const pad = 4;
    const rect = { x: pad, y: pad, w: width - pad * 2, h: height - pad * 2 };
    const grid = gridBlocks(rect, cols, rows, 2);
    setBlocks((prev) => [...prev, ...grid]);
  }
  function addAssetInstance(assetId: string) {
    const a = assets.find((x) => x._id === assetId);
    if (!a) return;
    add(newBlock({ type: "asset", assetId, x: 10, y: 10, w: a.width, h: a.height, text: undefined }));
  }
  function addPluginInstance(pluginInstanceId: string) {
    const p = plugins.find((x) => x._id === pluginInstanceId);
    if (!p) return;
    // Default the block to the instance's native pixel size so its image
    // doesn't get resampled. Designers can resize after.
    add(newBlock({ type: "plugin", pluginInstanceId, x: 10, y: 10, w: p.width, h: p.height, text: undefined }));
  }
  function addFullFill() {
    // Solid block covering the whole canvas, dropped at the back of the
    // layer stack so it acts as a background.
    const fill = newBlock({ type: "shape", shapeKind: "filled", x: 0, y: 0, w: width, h: height, text: undefined });
    setBlocks((prev) => [fill, ...prev]);
    setSelected(fill.id);
  }
  function reorder(id: string, action: "back" | "backward" | "forward" | "front") {
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      if (i < 0) return prev;
      const next = prev.slice();
      const [item] = next.splice(i, 1);
      const j =
        action === "back" ? 0 :
        action === "front" ? next.length :
        action === "backward" ? Math.max(0, i - 1) :
        Math.min(next.length, i + 1);
      next.splice(j, 0, item);
      return next;
    });
  }

  return (
    <div className="grid grid-cols-[1fr_360px] gap-4">
      <div>
        <div className="flex items-center gap-2 mb-2 flex-wrap text-sm">
          <button className="btn" onClick={() => add(PRESET_BLOCKS.text())}>+ Text</button>
          <button className="btn" onClick={() => add(PRESET_BLOCKS.heading())}>+ Heading</button>
          <button className="btn" onClick={() => { const b = PRESET_BLOCKS.image(); add(b); setShowImage(true); }}>+ Image</button>
          <button className="btn" onClick={() => add(PRESET_BLOCKS.qr())}>+ QR</button>
          <button className="btn" onClick={() => add(PRESET_BLOCKS.date())}>+ Date</button>
          <button className="btn" onClick={() => add(PRESET_BLOCKS.lineH())}>+ ─ Line</button>
          <button className="btn" onClick={() => add(PRESET_BLOCKS.lineV())}>+ │ Line</button>
          <button className="btn" onClick={() => add(PRESET_BLOCKS.shape())}>+ □ Box</button>
          <button className="btn" onClick={() => add(PRESET_BLOCKS.fill())}>+ ■ Fill</button>
          <button className="btn" onClick={addFullFill}>+ ■ Fill screen</button>
          {assets.length > 0 && (
            <select className="input max-w-[200px]" onChange={(e) => { if (e.target.value) addAssetInstance(e.target.value); e.target.value = ""; }} defaultValue="">
              <option value="">+ Asset…</option>
              {assets.map((a) => <option key={a._id} value={a._id}>{a.name} ({a.width}×{a.height})</option>)}
            </select>
          )}
          {plugins.length > 0 && (
            <select className="input max-w-[220px]" onChange={(e) => { if (e.target.value) addPluginInstance(e.target.value); e.target.value = ""; }} defaultValue="">
              <option value="">+ Plugin…</option>
              {plugins.map((p) => <option key={p._id} value={p._id}>{p.name} ({p.typeId})</option>)}
            </select>
          )}
          <span className="mx-2 text-neutral-600">|</span>
          <button className="btn" onClick={() => addGrid(2, 2)}>Grid 2×2</button>
          <button className="btn" onClick={() => addGrid(3, 2)}>Grid 3×2</button>
          <button className="btn" onClick={() => addGrid(4, 1)}>4 blocks</button>
          <span className="mx-2 text-neutral-600">|</span>
          <label className="flex items-center gap-1"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> grid</label>
        </div>

        <div
          ref={containerRef}
          className="relative border border-neutral-700 bg-white text-black overflow-hidden"
          style={{
            width: width * scale,
            height: height * scale,
            backgroundImage: showGrid ? `repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0 1px, transparent 1px ${10 * scale}px), repeating-linear-gradient(90deg, rgba(0,0,0,0.1) 0 1px, transparent 1px ${10 * scale}px)` : undefined,
          }}
          onMouseDown={(e) => { if (e.target === containerRef.current) setSelected(null); }}
        >
          {blocks.map((b) => (
            <BlockView
              key={b.id}
              block={b}
              scale={scale}
              canvasW={width}
              canvasH={height}
              selected={selected === b.id}
              onSelect={() => setSelected(b.id)}
              onUpdate={(patch) => update(b.id, patch)}
              assets={assets}
              plugins={plugins}
            />
          ))}
        </div>
        <p className="text-xs text-neutral-500 mt-2">
          Preview at {Math.round(scale * 100)}% of actual ({width}×{height} px). Rendered BMP is byte-accurate; this editor is approximate (e.g. QR rendered at preview time by the server).
        </p>
      </div>

      <div className="space-y-3">
        {!selectedBlock ? (
          <div className="card text-sm text-neutral-400">Select a block to edit, or add one from above.</div>
        ) : (
          <BlockInspector
            block={selectedBlock}
            assets={assets}
            plugins={plugins}
            canvasW={width}
            canvasH={height}
            onUpdate={(p) => update(selectedBlock.id, p)}
            onRemove={() => remove(selectedBlock.id)}
            onDuplicate={() => duplicate(selectedBlock.id)}
            onEditImage={() => setShowImage(true)}
            onReorder={(action) => reorder(selectedBlock.id, action)}
          />
        )}

        {showImage && selectedBlock && selectedBlock.type === "image" && (
          <div className="card">
            <h4 className="font-medium mb-2">Image</h4>
            <ImageProcessor
              targetW={selectedBlock.w}
              targetH={selectedBlock.h}
              onConfirm={(url, w, h) => {
                // Snap the block to the output dimensions and lock the
                // aspect so future scaling stays proportional — the user
                // expects "upload image" to never stretch.
                update(selectedBlock.id, { imageData: url, w, h, lockAspect: true });
                setShowImage(false);
              }}
              onCancel={() => setShowImage(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function BlockView({
  block, scale, canvasW, canvasH, selected, onSelect, onUpdate, assets, plugins,
}: {
  block: Block; scale: number; canvasW: number; canvasH: number;
  selected: boolean; onSelect: () => void;
  onUpdate: (p: Partial<Block>) => void;
  assets: Asset[];
  plugins: PluginInstance[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mode = useRef<"move" | "resize" | null>(null);
  const origin = useRef<{ mx: number; my: number; x: number; y: number; w: number; h: number }>({ mx: 0, my: 0, x: 0, y: 0, w: 0, h: 0 });

  function startMove(e: React.MouseEvent) {
    e.stopPropagation();
    onSelect();
    mode.current = "move";
    origin.current = { mx: e.clientX, my: e.clientY, x: block.x, y: block.y, w: block.w, h: block.h };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", endMove);
  }
  function startResize(e: React.MouseEvent) {
    e.stopPropagation();
    onSelect();
    mode.current = "resize";
    origin.current = { mx: e.clientX, my: e.clientY, x: block.x, y: block.y, w: block.w, h: block.h };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", endMove);
  }
  function onMove(e: MouseEvent) {
    const dx = (e.clientX - origin.current.mx) / scale;
    const dy = (e.clientY - origin.current.my) / scale;
    if (mode.current === "move") {
      let nx = Math.round((origin.current.x + dx) / SNAP) * SNAP;
      let ny = Math.round((origin.current.y + dy) / SNAP) * SNAP;
      nx = Math.max(0, Math.min(canvasW - block.w, nx));
      ny = Math.max(0, Math.min(canvasH - block.h, ny));
      onUpdate({ x: nx, y: ny });
    } else if (mode.current === "resize") {
      let nw = Math.round((origin.current.w + dx) / SNAP) * SNAP;
      let nh = Math.round((origin.current.h + dy) / SNAP) * SNAP;
      if (block.lockAspect && origin.current.w > 0 && origin.current.h > 0) {
        // Pick the axis with the larger relative drag and derive the other.
        const ratio = origin.current.w / origin.current.h;
        const rw = nw / origin.current.w;
        const rh = nh / origin.current.h;
        if (Math.abs(rw - 1) >= Math.abs(rh - 1)) {
          nh = Math.max(8, Math.round((nw / ratio) / SNAP) * SNAP);
        } else {
          nw = Math.max(8, Math.round((nh * ratio) / SNAP) * SNAP);
        }
      }
      nw = Math.max(8, Math.min(canvasW - block.x, nw));
      nh = Math.max(8, Math.min(canvasH - block.y, nh));
      if (block.lockAspect && origin.current.w > 0 && origin.current.h > 0) {
        // Re-clamp the dependent axis after the bounds clamp above.
        const ratio = origin.current.w / origin.current.h;
        if (nw / ratio > canvasH - block.y) nw = Math.floor((canvasH - block.y) * ratio);
        if (nh * ratio > canvasW - block.x) nh = Math.floor((canvasW - block.x) / ratio);
        nh = Math.max(8, Math.round((nw / ratio) / SNAP) * SNAP);
      }
      onUpdate({ w: nw, h: nh });
    }
  }
  function endMove() {
    mode.current = null;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", endMove);
  }

  const style: React.CSSProperties = {
    left: block.x * scale,
    top: block.y * scale,
    width: block.w * scale,
    height: block.h * scale,
    fontSize: (block.fontSize ?? 16) * scale,
    fontFamily: cssFontFamily(block.fontFamily),
    fontWeight: block.bold ? 700 : 400,
    fontStyle: block.italic ? "italic" : "normal",
    textAlign: block.align ?? "left",
    padding: (block.padding ?? 4) * scale,
    color: block.background === "black" ? "#fff" : "#000",
    background: block.background === "black" ? "#000" : "transparent",
    border: block.border ? "1px solid black" : "none",
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    lineHeight: block.lineHeight ?? 1.15,
  };
  const assetName = block.type === "asset" && block.assetId ? assets.find((a) => a._id === block.assetId)?.name : null;

  return (
    <div
      ref={ref}
      className={`absolute select-none ${selected ? "ring-2 ring-emerald-500 z-10" : ""}`}
      style={style}
      onMouseDown={startMove}
    >
      {block.type === "image" ? (
        block.imageData
          ? <img src={block.imageData} alt="" className="w-full h-full pixelated" />
          : <div className="w-full h-full flex items-center justify-center text-[10px] bg-neutral-200 text-neutral-500">image</div>
      ) : block.type === "asset" ? (
        <div className="w-full h-full flex items-center justify-center text-[10px] bg-neutral-200 border border-neutral-400 px-1">
          <span>⟨ {assetName ?? "asset"} ⟩</span>
        </div>
      ) : block.type === "qr" ? (
        <div className="w-full h-full flex items-center justify-center text-[10px] bg-neutral-200 text-neutral-600">
          <span>QR · {block.qrUrl || "no url"}</span>
        </div>
      ) : block.type === "date" ? (
        <div className="w-full h-full flex items-center justify-center text-[10px] bg-neutral-100 text-neutral-600 font-mono">
          <span>📅 {block.dateISO?.slice(0, 10) || "date"}</span>
        </div>
      ) : block.type === "line" ? (
        <div className={`${block.lineColor === "white" ? "bg-white border border-neutral-400" : "bg-black"} ${block.lineDirection === "vertical" ? "w-[2px] h-full mx-auto" : "h-[2px] w-full my-auto"}`} />
      ) : block.type === "shape" ? (
        <div className={`w-full h-full ${block.shapeKind === "filled" ? "bg-black" : "border-2 border-black"}`} />
      ) : block.type === "plugin" ? (
        block.pluginInstanceId
          ? <img
              src={`/api/plugins/instances/${block.pluginInstanceId}/preview.png?t=${block.id}`}
              alt=""
              className="w-full h-full pixelated object-contain bg-white"
            />
          : <div className="w-full h-full flex items-center justify-center text-[10px] bg-neutral-200 text-neutral-500">no plugin selected</div>
      ) : (
        <div>{block.text}</div>
      )}
      {selected && (
        <div
          className="absolute bottom-0 right-0 h-3 w-3 bg-emerald-500 cursor-nwse-resize"
          onMouseDown={startResize}
        />
      )}
    </div>
  );
}

function cssFontFamily(family: FontFamily | undefined): string {
  switch (family) {
    case "sans": return "sans-serif";
    case "houschka":
    case "houschka-demibold":
    case "houschka-bold":
    case "houschka-extrabold": return `"HouschkaPro", sans-serif`;
    case "pixelva": return `"Pixelva", monospace`;
    case "chikarego": return `"ChiKareGo", monospace`;
    default: return "ui-monospace, monospace";
  }
}

function BlockInspector({
  block, assets, plugins, canvasW, canvasH, onUpdate, onRemove, onDuplicate, onEditImage, onReorder,
}: {
  block: Block; assets: Asset[]; plugins: PluginInstance[]; canvasW: number; canvasH: number;
  onUpdate: (p: Partial<Block>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onEditImage: () => void;
  onReorder: (action: "back" | "backward" | "forward" | "front") => void;
}) {
  const pickedAsset = block.type === "asset" && block.assetId ? assets.find((a) => a._id === block.assetId) : null;

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">{titleFor(block)}</h4>
        <div className="flex gap-1">
          <button className="btn text-xs" onClick={onDuplicate}>Duplicate</button>
          <button className="btn btn-danger text-xs" onClick={onRemove}>Delete</button>
        </div>
      </div>

      <div>
        <label className="label">Layer</label>
        <div className="flex gap-1">
          <button className="btn text-xs" onClick={() => onReorder("back")} title="Send to back">⤓⤓</button>
          <button className="btn text-xs" onClick={() => onReorder("backward")} title="Send backward">⤓</button>
          <button className="btn text-xs" onClick={() => onReorder("forward")} title="Bring forward">⤒</button>
          <button className="btn text-xs" onClick={() => onReorder("front")} title="Bring to front">⤒⤒</button>
        </div>
      </div>

      <div>
        <label className="label">Type</label>
        <select className="input" value={block.type} onChange={(e) => onUpdate({ type: e.target.value as Block["type"] })}>
          <option value="text">Text</option>
          <option value="image">Image</option>
          <option value="asset">Asset</option>
          <option value="qr">QR code</option>
          <option value="date">Date / time</option>
          <option value="line">Line</option>
          <option value="shape">Shape</option>
          <option value="plugin">Plugin</option>
        </select>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <NumField label="X" value={block.x} onChange={(v) => onUpdate({ x: v })} />
        <NumField label="Y" value={block.y} onChange={(v) => onUpdate({ y: v })} />
        <NumField label="W" value={block.w} onChange={(v) => {
          if (block.lockAspect && block.w > 0) {
            const ratio = block.w / block.h;
            onUpdate({ w: v, h: Math.max(1, Math.round(v / ratio)) });
          } else {
            onUpdate({ w: v });
          }
        }} />
        <NumField label="H" value={block.h} onChange={(v) => {
          if (block.lockAspect && block.h > 0) {
            const ratio = block.w / block.h;
            onUpdate({ h: v, w: Math.max(1, Math.round(v * ratio)) });
          } else {
            onUpdate({ h: v });
          }
        }} />
      </div>
      {(block.type === "image" || block.type === "asset") && (
        <label className="text-sm flex items-center gap-1">
          <input type="checkbox" checked={!!block.lockAspect} onChange={(e) => onUpdate({ lockAspect: e.target.checked || undefined })} />
          Lock aspect ratio
        </label>
      )}

      {block.type === "text" && <TextFields block={block} onUpdate={onUpdate} />}
      {block.type === "image" && (
        <div>
          {block.imageData
            ? <img src={block.imageData} alt="" className="w-full border border-neutral-700 pixelated" />
            : <p className="text-xs text-neutral-500">No image — click below to upload + crop + convert to 1-bit.</p>}
          <button className="btn w-full mt-2" onClick={onEditImage}>{block.imageData ? "Replace image" : "Upload image"}</button>
          <p className="text-xs text-neutral-500 mt-2">Or bind to an asset variable: set the field to <code>{`{{varname}}`}</code>.</p>
          <input className="input mt-1" placeholder="e.g. {{photo}}" value={typeof block.imageData === "string" && block.imageData.startsWith("{{") ? block.imageData : ""} onChange={(e) => onUpdate({ imageData: e.target.value })} />
        </div>
      )}
      {block.type === "asset" && (
        <AssetInstanceFields block={block} assets={assets} onUpdate={onUpdate} pickedAsset={pickedAsset} />
      )}
      {block.type === "qr" && <QrFields block={block} onUpdate={onUpdate} />}
      {block.type === "date" && <DateFields block={block} onUpdate={onUpdate} />}
      {block.type === "line" && <LineFields block={block} onUpdate={onUpdate} />}
      {block.type === "shape" && <ShapeFields block={block} onUpdate={onUpdate} />}
      {block.type === "plugin" && <PluginFields block={block} plugins={plugins} onUpdate={onUpdate} />}

      {block.type !== "line" && block.type !== "shape" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={!!block.border} onChange={(e) => onUpdate({ border: e.target.checked })} /> Border</label>
          <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={block.background === "black"} onChange={(e) => onUpdate({ background: e.target.checked ? "black" : undefined })} /> Inverted</label>
        </div>
      )}
    </div>
  );
}

function titleFor(b: Block): string {
  return ({
    text: "Text block",
    image: "Image block",
    asset: "Asset instance",
    qr: "QR block",
    date: "Date / time",
    line: "Line",
    shape: "Shape",
    plugin: "Plugin block",
  } as const)[b.type] ?? "Block";
}

function PluginFields({ block, plugins, onUpdate }: { block: Block; plugins: PluginInstance[]; onUpdate: (p: Partial<Block>) => void }) {
  const current = plugins.find((p) => p._id === block.pluginInstanceId);
  return (
    <div className="space-y-2">
      <div>
        <label className="label">Plugin instance</label>
        <select
          className="input"
          value={block.pluginInstanceId ?? ""}
          onChange={(e) => {
            const id = e.target.value || undefined;
            const p = plugins.find((x) => x._id === id);
            // Snapping w/h to the plugin's native size avoids resampling the cached PNG.
            onUpdate(p ? { pluginInstanceId: id, w: p.width, h: p.height } : { pluginInstanceId: undefined });
          }}
        >
          <option value="">— pick one —</option>
          {plugins.map((p) => <option key={p._id} value={p._id}>{p.name} ({p.typeId})</option>)}
        </select>
      </div>
      {current && (
        <div className="text-xs text-neutral-500">
          Native size {current.width}×{current.height}.{" "}
          <a className="text-emerald-400 underline" href={`/plugins/${current._id}`} target="_blank">Edit plugin →</a>
        </div>
      )}
      {!plugins.length && (
        <div className="text-xs text-neutral-500">
          No plugins yet. <a className="text-emerald-400 underline" href="/plugins/new" target="_blank">Create one →</a>
        </div>
      )}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type="number" className="input" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function TextFields({ block, onUpdate }: { block: Block; onUpdate: (p: Partial<Block>) => void }) {
  const over = block.maxChars && block.text && block.text.length > block.maxChars;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Wrap the current selection in `marker` on each side; if no selection,
  // insert a placeholder. Inserts plain markdown so the textarea remains the
  // source of truth.
  function wrapSelection(marker: string, placeholder: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const value = block.text ?? "";
    const selected = value.slice(start, end) || placeholder;
    const next = value.slice(0, start) + marker + selected + marker + value.slice(end);
    onUpdate({ text: next });
    // Restore selection over the inserted text so further toggles work.
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      const a = start + marker.length;
      const b = a + selected.length;
      textareaRef.current.setSelectionRange(a, b);
    });
  }
  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label !mb-0">Text {block.maxChars ? `(${block.text?.length ?? 0}/${block.maxChars})` : ""}</label>
          {block.rich && (
            <div className="flex gap-1">
              <button type="button" className="btn text-xs font-bold" title="Wrap selection in **bold**" onClick={() => wrapSelection("**", "bold")}>B</button>
              <button type="button" className="btn text-xs italic" title="Wrap selection in *italic*" onClick={() => wrapSelection("*", "italic")}>I</button>
            </div>
          )}
        </div>
        <textarea ref={textareaRef} className={`input h-24 ${over ? "border-red-500" : ""}`} value={block.text ?? ""} onChange={(e) => onUpdate({ text: e.target.value })} />
        <p className="text-xs text-neutral-500 mt-1">
          Use <code>{`{{key}}`}</code> to bind to asset variables.
          {block.rich && <> Inline: <code>**bold**</code>, <code>*italic*</code>, <code>***both***</code>.</>}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Font size</label>
          <input type="number" className="input" value={block.fontSize ?? 16} onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label">Family</label>
          <select className="input" value={block.fontFamily ?? "mono"} onChange={(e) => onUpdate({ fontFamily: e.target.value as any })}>
            <option value="mono">Monospace</option>
            <option value="sans">Sans-serif</option>
            <option value="houschka">HouschkaPro Regular</option>
            <option value="houschka-demibold">HouschkaPro DemiBold</option>
            <option value="houschka-bold">HouschkaPro Bold</option>
            <option value="houschka-extrabold">HouschkaPro ExtraBold</option>
            <option value="pixelva">Pixelva (pixel)</option>
            <option value="chikarego">ChiKareGo (pixel)</option>
          </select>
        </div>
        <div>
          <label className="label">Align</label>
          <select className="input" value={block.align ?? "left"} onChange={(e) => onUpdate({ align: e.target.value as any })}>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
        <div>
          <label className="label">Vertical</label>
          <select className="input" value={block.vAlign ?? "top"} onChange={(e) => onUpdate({ vAlign: e.target.value as any })}>
            <option value="top">Top</option>
            <option value="middle">Middle</option>
            <option value="bottom">Bottom</option>
          </select>
        </div>
        <div>
          <label className="label">Char limit</label>
          <input type="number" className="input" value={block.maxChars ?? ""} onChange={(e) => onUpdate({ maxChars: e.target.value ? Number(e.target.value) : undefined })} />
        </div>
        <div>
          <label className="label">Line height</label>
          <input type="number" step="0.05" className="input" value={block.lineHeight ?? 1.15} onChange={(e) => onUpdate({ lineHeight: Number(e.target.value) })} />
        </div>
        <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={!!block.bold} onChange={(e) => onUpdate({ bold: e.target.checked })} /> Bold</label>
        <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={!!block.italic} onChange={(e) => onUpdate({ italic: e.target.checked })} /> Italic</label>
        <label className="text-sm flex items-center gap-1 col-span-2"><input type="checkbox" checked={!!block.rich} onChange={(e) => onUpdate({ rich: e.target.checked })} /> Rich text (markdown <code>**bold**</code> / <code>*italic*</code>)</label>
      </div>
      {over && <p className="text-xs text-red-400">Over soft char limit.</p>}
    </>
  );
}

function QrFields({ block, onUpdate }: { block: Block; onUpdate: (p: Partial<Block>) => void }) {
  const style = block.qrStyle ?? "square";
  return (
    <div className="space-y-2">
      <div>
        <label className="label">URL (or {`{{var}}`})</label>
        <input className="input" value={block.qrUrl ?? ""} onChange={(e) => onUpdate({ qrUrl: e.target.value })} placeholder="https://example.com" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Margin (px)</label>
          <input type="number" className="input" value={block.qrMargin ?? 0} onChange={(e) => onUpdate({ qrMargin: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label">Error correction</label>
          <select className="input" value={block.qrErrorLevel ?? "L"} onChange={(e) => onUpdate({ qrErrorLevel: e.target.value as any })}>
            <option value="L">Low (7%)</option>
            <option value="M">Medium (15%)</option>
            <option value="Q">Quartile (25%)</option>
            <option value="H">High (30%)</option>
          </select>
        </div>
        <div>
          <label className="label">Style</label>
          <select className="input" value={style} onChange={(e) => onUpdate({ qrStyle: e.target.value as "square" | "bars" })}>
            <option value="square">Square (classic)</option>
            <option value="bars">Horizontal bars</option>
          </select>
        </div>
        {style === "bars" && (
          <div>
            <label className="label">Vertical shrink ({(block.qrVerticalShrink ?? 0.8).toFixed(2)})</label>
            <input type="range" min={0.2} max={1} step={0.05} value={block.qrVerticalShrink ?? 0.8} onChange={(e) => onUpdate({ qrVerticalShrink: Number(e.target.value) })} className="w-full" />
          </div>
        )}
      </div>
      <label className="text-sm flex items-center gap-1">
        <input type="checkbox" checked={block.qrInvert ?? true} onChange={(e) => onUpdate({ qrInvert: e.target.checked })} />
        Invert (black quiet zone, white modules)
      </label>
      <p className="text-xs text-neutral-500">Right-aligned inside the block, integer module size for crispness. Bars style keeps the three finder patterns solid; everywhere else, horizontally-adjacent active modules merge into a bar. Keep error correction ≥ M for reliable scanning.</p>
    </div>
  );
}

function DateFields({ block, onUpdate }: { block: Block; onUpdate: (p: Partial<Block>) => void }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={(block.dateISO ?? "").slice(0, 10)} onChange={(e) => onUpdate({ dateISO: e.target.value })} />
        </div>
        <div>
          <label className="label">Layout</label>
          <select className="input" value={block.dateLayout ?? "stacked"} onChange={(e) => onUpdate({ dateLayout: e.target.value as any })}>
            <option value="stacked">Stacked (legacy style)</option>
            <option value="row">Single row</option>
          </select>
        </div>
        <div>
          <label className="label">Start time</label>
          <input type="time" className="input" value={block.startTime ?? ""} onChange={(e) => onUpdate({ startTime: e.target.value })} />
        </div>
        <div>
          <label className="label">End time</label>
          <input type="time" className="input" value={block.endTime ?? ""} onChange={(e) => onUpdate({ endTime: e.target.value })} />
        </div>
        <div>
          <label className="label">Font size</label>
          <input type="number" className="input" value={block.fontSize ?? 16} onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label">Family</label>
          <select className="input" value={block.fontFamily ?? "houschka-demibold"} onChange={(e) => onUpdate({ fontFamily: e.target.value as any })}>
            <option value="houschka-demibold">HouschkaPro DemiBold</option>
            <option value="houschka-bold">HouschkaPro Bold</option>
            <option value="houschka">HouschkaPro Regular</option>
            <option value="sans">Sans</option>
            <option value="mono">Monospace</option>
            <option value="pixelva">Pixelva</option>
            <option value="chikarego">ChiKareGo</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 text-sm">
        <label className="flex items-center gap-1"><input type="checkbox" checked={block.dateShowDayOfWeek !== false} onChange={(e) => onUpdate({ dateShowDayOfWeek: e.target.checked })} /> Day of week</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={block.dateShowDay !== false} onChange={(e) => onUpdate({ dateShowDay: e.target.checked })} /> Day of month</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={block.dateShowMonth !== false} onChange={(e) => onUpdate({ dateShowMonth: e.target.checked })} /> Month</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={!!block.dateShowTime} onChange={(e) => onUpdate({ dateShowTime: e.target.checked })} /> Show time</label>
      </div>
      <p className="text-xs text-neutral-500">Bind in asset: set Date to <code>{`{{date}}`}</code>, times to <code>{`{{start_time}}`}</code> / <code>{`{{end_time}}`}</code>.</p>
      <div className="grid grid-cols-1 gap-2">
        <div>
          <label className="label">Date binding token (optional)</label>
          <input className="input" placeholder="{{date}}" value={block.dateISO ?? ""} onChange={(e) => onUpdate({ dateISO: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

function LineFields({ block, onUpdate }: { block: Block; onUpdate: (p: Partial<Block>) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div>
        <label className="label">Direction</label>
        <select className="input" value={block.lineDirection ?? "horizontal"} onChange={(e) => onUpdate({ lineDirection: e.target.value as any })}>
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </div>
      <div>
        <label className="label">Thickness (px)</label>
        <input type="number" className="input" value={block.lineThickness ?? 1} onChange={(e) => onUpdate({ lineThickness: Number(e.target.value) })} />
      </div>
      <div>
        <label className="label">Color</label>
        <select className="input" value={block.lineColor ?? "auto"} onChange={(e) => onUpdate({ lineColor: e.target.value === "auto" ? undefined : (e.target.value as "white" | "black") })}>
          <option value="auto">Auto (contrast bg)</option>
          <option value="black">Black</option>
          <option value="white">White</option>
        </select>
      </div>
    </div>
  );
}

function ShapeFields({ block, onUpdate }: { block: Block; onUpdate: (p: Partial<Block>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="label">Style</label>
        <select className="input" value={block.shapeKind ?? "outlined"} onChange={(e) => onUpdate({ shapeKind: e.target.value as any })}>
          <option value="outlined">Outlined</option>
          <option value="filled">Filled</option>
        </select>
      </div>
      {block.shapeKind === "outlined" && (
        <div>
          <label className="label">Thickness</label>
          <input type="number" className="input" value={block.lineThickness ?? 1} onChange={(e) => onUpdate({ lineThickness: Number(e.target.value) })} />
        </div>
      )}
    </div>
  );
}

function AssetInstanceFields({
  block, assets, onUpdate, pickedAsset,
}: { block: Block; assets: Asset[]; onUpdate: (p: Partial<Block>) => void; pickedAsset: Asset | null | undefined }) {
  const bindings = block.variableBindings ?? {};
  return (
    <div className="space-y-2">
      <div>
        <label className="label">Asset</label>
        <select className="input" value={block.assetId ?? ""} onChange={(e) => onUpdate({ assetId: e.target.value, variableBindings: {} })}>
          <option value="">— pick —</option>
          {assets.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
        </select>
      </div>
      {pickedAsset?.variables && pickedAsset.variables.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-neutral-400">Asset fields</div>
          {pickedAsset.variables.map((v) => {
            const val = bindings[v.key] ?? "";
            const set = (x: string) => onUpdate({ variableBindings: { ...bindings, [v.key]: x } });
            return (
              <div key={v.key}>
                <label className="label">{v.label || v.key} <span className="text-neutral-600">({v.type})</span></label>
                {v.type === "date" ? (
                  <input type="date" className="input" value={val} onChange={(e) => set(e.target.value)} placeholder={v.default} />
                ) : (
                  <input className="input" value={val} onChange={(e) => set(e.target.value)} placeholder={v.default} />
                )}
              </div>
            );
          })}
        </div>
      )}
      {(!pickedAsset?.variables || pickedAsset.variables.length === 0) && pickedAsset && (
        <p className="text-xs text-neutral-500">This asset has no variables — open the asset to add some for instance-level control.</p>
      )}
    </div>
  );
}
