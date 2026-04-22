"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Block, FontFamily } from "@/lib/mongo";
import { PRESET_BLOCKS, gridBlocks, newBlock } from "@/lib/block";
import ImageProcessor from "./ImageProcessor";

type Asset = { _id: string; name: string; width: number; height: number; variables?: { key: string; label?: string; type: string; default?: string }[] };

type Props = {
  width: number;
  height: number;
  initialLayout: Block[];
  assets: Asset[];
  onChange: (blocks: Block[]) => void;
};

const SNAP = 2;
const MAX_DISPLAY = 900;

export default function LayoutEditor({ width, height, initialLayout, assets, onChange }: Props) {
  const [blocks, setBlocks] = useState<Block[]>(initialLayout);
  const [selected, setSelected] = useState<string | null>(null);
  const [showImage, setShowImage] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { onChange(blocks); /* eslint-disable-next-line */ }, [blocks]);

  const scale = useMemo(() => Math.min(1, MAX_DISPLAY / width), [width]);
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
          {assets.length > 0 && (
            <select className="input max-w-[200px]" onChange={(e) => { if (e.target.value) addAssetInstance(e.target.value); e.target.value = ""; }} defaultValue="">
              <option value="">+ Asset…</option>
              {assets.map((a) => <option key={a._id} value={a._id}>{a.name} ({a.width}×{a.height})</option>)}
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
            canvasW={width}
            canvasH={height}
            onUpdate={(p) => update(selectedBlock.id, p)}
            onRemove={() => remove(selectedBlock.id)}
            onDuplicate={() => duplicate(selectedBlock.id)}
            onEditImage={() => setShowImage(true)}
          />
        )}

        {showImage && selectedBlock && selectedBlock.type === "image" && (
          <div className="card">
            <h4 className="font-medium mb-2">Image</h4>
            <ImageProcessor
              targetW={selectedBlock.w}
              targetH={selectedBlock.h}
              onConfirm={(url) => { update(selectedBlock.id, { imageData: url }); setShowImage(false); }}
              onCancel={() => setShowImage(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function BlockView({
  block, scale, canvasW, canvasH, selected, onSelect, onUpdate, assets,
}: {
  block: Block; scale: number; canvasW: number; canvasH: number;
  selected: boolean; onSelect: () => void;
  onUpdate: (p: Partial<Block>) => void;
  assets: Asset[];
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
      nw = Math.max(8, Math.min(canvasW - block.x, nw));
      nh = Math.max(8, Math.min(canvasH - block.y, nh));
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
        <div className={`bg-black ${block.lineDirection === "vertical" ? "w-[2px] h-full mx-auto" : "h-[2px] w-full my-auto"}`} />
      ) : block.type === "shape" ? (
        <div className={`w-full h-full ${block.shapeKind === "filled" ? "bg-black" : "border-2 border-black"}`} />
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
  block, assets, canvasW, canvasH, onUpdate, onRemove, onDuplicate, onEditImage,
}: {
  block: Block; assets: Asset[]; canvasW: number; canvasH: number;
  onUpdate: (p: Partial<Block>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onEditImage: () => void;
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
        <label className="label">Type</label>
        <select className="input" value={block.type} onChange={(e) => onUpdate({ type: e.target.value as Block["type"] })}>
          <option value="text">Text</option>
          <option value="image">Image</option>
          <option value="asset">Asset</option>
          <option value="qr">QR code</option>
          <option value="date">Date / time</option>
          <option value="line">Line</option>
          <option value="shape">Shape</option>
        </select>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <NumField label="X" value={block.x} onChange={(v) => onUpdate({ x: v })} />
        <NumField label="Y" value={block.y} onChange={(v) => onUpdate({ y: v })} />
        <NumField label="W" value={block.w} onChange={(v) => onUpdate({ w: v })} />
        <NumField label="H" value={block.h} onChange={(v) => onUpdate({ h: v })} />
      </div>

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
  } as const)[b.type] ?? "Block";
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
  return (
    <>
      <div>
        <label className="label">Text {block.maxChars ? `(${block.text?.length ?? 0}/${block.maxChars})` : ""}</label>
        <textarea className={`input h-24 ${over ? "border-red-500" : ""}`} value={block.text ?? ""} onChange={(e) => onUpdate({ text: e.target.value })} />
        <p className="text-xs text-neutral-500 mt-1">Use <code>{`{{key}}`}</code> to bind to asset variables.</p>
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
      </div>
      {over && <p className="text-xs text-red-400">Over soft char limit.</p>}
    </>
  );
}

function QrFields({ block, onUpdate }: { block: Block; onUpdate: (p: Partial<Block>) => void }) {
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
      </div>
      <p className="text-xs text-neutral-500">Right-aligned inside the block, integer nearest-neighbor scale. Use a square block for best results.</p>
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
    <div className="grid grid-cols-2 gap-2">
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
