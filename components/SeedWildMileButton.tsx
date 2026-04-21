"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SeedWildMileButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function seed() {
    if (!confirm("Seed / reset the 'Wild Mile Banner' demo device and its preset assets?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/seed/wildmile", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Seed failed: ${json?.error || res.statusText}`);
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <button className="btn" onClick={seed} disabled={busy} title="Creates preset cards + the Wild Mile 2560×1440 banner device">
      {busy ? "Seeding…" : "Seed Wild Mile demo"}
    </button>
  );
}
