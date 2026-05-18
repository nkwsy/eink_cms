"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Direct uploader for the library — uses the existing crop/dither pipeline
// from the device editor only when invoked from a block, so this path
// just stores the source image as-is. The block editor handles 1-bit
// preparation itself.
export default function MediaUploadButton() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const dims = await loadDims(dataUrl);
      const res = await fetch("/api/media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: file.name, dataUrl, width: dims.w, height: dims.h }),
      });
      if (!res.ok) throw new Error("upload failed");
      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <button onClick={() => input.current?.click()} disabled={busy} className="btn btn-primary">
        {busy ? "Uploading…" : "+ Upload"}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function loadDims(src: string): Promise<{ w: number; h: number }> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => res({ w: 0, h: 0 });
    img.src = src;
  });
}
