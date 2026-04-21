"use client";
import { useEffect, useRef, useState } from "react";

type Props = {
  targetW: number;
  targetH: number;
  onConfirm: (dataUrl: string) => void;
  onCancel: () => void;
};

// Client-side: upload image → crop selection → resize to target → threshold to 1-bit → data URL PNG.
export default function ImageProcessor({ targetW, targetH, onConfirm, onCancel }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [threshold, setThreshold] = useState(128);
  const [dither, setDither] = useState(false);
  const [invert, setInvert] = useState(false);
  const [drag, setDrag] = useState<{ startX: number; startY: number } | null>(null);

  useEffect(() => { redraw(); }, [img, crop, threshold, dither, invert]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const i = new Image();
    i.onload = () => {
      setImg(i);
      // Default crop matches target aspect, centered
      const aspect = targetW / targetH;
      let cw = i.width, ch = i.height;
      if (cw / ch > aspect) cw = Math.floor(ch * aspect);
      else ch = Math.floor(cw / aspect);
      setCrop({ x: Math.floor((i.width - cw) / 2), y: Math.floor((i.height - ch) / 2), w: cw, h: ch });
    };
    i.src = url;
  }

  function startDrag(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!img) return;
    const canvas = sourceCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (img.width / rect.width);
    const sy = (e.clientY - rect.top) * (img.height / rect.height);
    setDrag({ startX: sx, startY: sy });
    setCrop({ x: sx, y: sy, w: 1, h: 1 });
  }

  function moveDrag(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!img || !drag) return;
    const canvas = sourceCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (img.width / rect.width);
    const sy = (e.clientY - rect.top) * (img.height / rect.height);
    const aspect = targetW / targetH;
    let w = Math.abs(sx - drag.startX);
    let h = Math.abs(sy - drag.startY);
    // Lock aspect
    if (w / h > aspect) w = h * aspect; else h = w / aspect;
    const x = Math.min(drag.startX, sx);
    const y = Math.min(drag.startY, sy);
    setCrop({ x, y, w, h });
  }

  function endDrag() { setDrag(null); }

  function redraw() {
    if (!img || !sourceCanvasRef.current || !previewRef.current) return;
    const src = sourceCanvasRef.current;
    const maxDim = 600;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    src.width = Math.floor(img.width * scale);
    src.height = Math.floor(img.height * scale);
    const sctx = src.getContext("2d")!;
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(img, 0, 0, src.width, src.height);
    if (crop) {
      sctx.strokeStyle = "#10b981";
      sctx.lineWidth = 2;
      sctx.strokeRect(crop.x * scale, crop.y * scale, crop.w * scale, crop.h * scale);
    }

    // Preview: extract crop → resize → threshold
    const p = previewRef.current;
    p.width = targetW;
    p.height = targetH;
    const pctx = p.getContext("2d")!;
    pctx.imageSmoothingEnabled = false;
    pctx.fillStyle = "#ffffff";
    pctx.fillRect(0, 0, targetW, targetH);
    if (!crop || crop.w < 2 || crop.h < 2) return;
    pctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, targetW, targetH);
    const imageData = pctx.getImageData(0, 0, targetW, targetH);
    const d = imageData.data;
    if (dither) floydSteinberg(d, targetW, targetH, threshold, invert);
    else thresholdApply(d, threshold, invert);
    pctx.putImageData(imageData, 0, 0);
  }

  function confirm() {
    if (!previewRef.current) return;
    const url = previewRef.current.toDataURL("image/png");
    onConfirm(url);
  }

  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="text-sm" />
      <p className="text-xs text-neutral-400">Drag on the source image to reselect a crop. Aspect locked to {targetW}×{targetH}.</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-neutral-400 mb-1">Source</div>
          <canvas
            ref={sourceCanvasRef}
            onMouseDown={startDrag}
            onMouseMove={moveDrag}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            className="border border-neutral-700 bg-black max-w-full cursor-crosshair"
          />
        </div>
        <div>
          <div className="text-xs text-neutral-400 mb-1">Preview ({targetW}×{targetH}, 1-bit)</div>
          <canvas ref={previewRef} className="border border-neutral-700 bg-white pixelated" style={{ width: Math.min(300, targetW) + "px" }} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <label className="text-sm">
          <span className="label">Threshold: {threshold}</span>
          <input type="range" min={1} max={254} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full" />
        </label>
        <label className="text-sm flex items-center gap-2 mt-5">
          <input type="checkbox" checked={dither} onChange={(e) => setDither(e.target.checked)} />
          Floyd–Steinberg dither
        </label>
        <label className="text-sm flex items-center gap-2 mt-5">
          <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />
          Invert
        </label>
      </div>
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={!img} onClick={confirm}>Use this image</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function thresholdApply(data: Uint8ClampedArray, threshold: number, invert: boolean) {
  for (let i = 0; i < data.length; i += 4) {
    const g = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    let v = g >= threshold ? 255 : 0;
    if (invert) v = 255 - v;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
}

function floydSteinberg(data: Uint8ClampedArray, w: number, h: number, threshold: number, invert: boolean) {
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = gray[i];
      let neu = old >= threshold ? 255 : 0;
      const err = old - neu;
      if (invert) neu = 255 - neu;
      const off = i * 4;
      data[off] = data[off + 1] = data[off + 2] = neu; data[off + 3] = 255;
      if (x + 1 < w) gray[i + 1] += (err * 7) / 16;
      if (y + 1 < h) {
        if (x > 0) gray[i + w - 1] += (err * 3) / 16;
        gray[i + w] += (err * 5) / 16;
        if (x + 1 < w) gray[i + w + 1] += (err * 1) / 16;
      }
    }
  }
}
