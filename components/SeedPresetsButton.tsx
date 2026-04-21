"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SeedPresetsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function seed() {
    setBusy(true);
    try {
      const res = await fetch("/api/assets/seed", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      const n = Array.isArray(json?.created) ? json.created.length : 0;
      if (!res.ok) {
        alert(`Seed failed: ${json?.error || res.statusText}`);
      } else if (n === 0) {
        alert("Presets already exist. Nothing to seed.");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <button className="btn" onClick={seed} disabled={busy} title="Install event / activity / callout card templates">
      {busy ? "Seeding…" : "Seed presets"}
    </button>
  );
}
