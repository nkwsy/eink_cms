import path from "node:path";
import fs from "node:fs";
import { GlobalFonts } from "@napi-rs/canvas";

let registered = false;

export function ensureFontsRegistered() {
  if (registered) return;
  const dir = path.join(process.cwd(), "public", "fonts");
  const tryReg = (file: string, family: string) => {
    const p = path.join(dir, file);
    if (fs.existsSync(p)) {
      try {
        GlobalFonts.registerFromPath(p, family);
      } catch (e) {
        console.warn("[fonts] failed to register", file, e);
      }
    }
  };
  tryReg("HouschkaPro-Medium.ttf", "HouschkaPro");
  tryReg("HouschkaPro-DemiBold.ttf", "HouschkaPro-DemiBold");
  tryReg("HouschkaPro-Bold.ttf", "HouschkaPro-Bold");
  tryReg("HouschkaPro-ExtraBold.ttf", "HouschkaPro-ExtraBold");
  tryReg("Pixelva.ttf", "Pixelva");
  tryReg("ChiKareGo2.ttf", "ChiKareGo");
  registered = true;
}

// Maps our FontFamily enum to canvas font strings.
export function fontString(family: string | undefined, size: number, bold: boolean, italic: boolean): string {
  const weight = bold ? "bold" : "normal";
  const style = italic ? "italic" : "normal";
  let stack = "monospace";
  switch (family) {
    case "sans": stack = "sans-serif"; break;
    case "mono": stack = "monospace"; break;
    case "houschka": stack = `"HouschkaPro", sans-serif`; break;
    case "houschka-demibold": stack = `"HouschkaPro-DemiBold", "HouschkaPro", sans-serif`; break;
    case "houschka-bold": stack = `"HouschkaPro-Bold", "HouschkaPro", sans-serif`; break;
    case "houschka-extrabold": stack = `"HouschkaPro-ExtraBold", "HouschkaPro", sans-serif`; break;
    case "pixelva": stack = `"Pixelva", monospace`; break;
    case "chikarego": stack = `"ChiKareGo", monospace`; break;
  }
  return `${style} ${weight} ${size}px ${stack}`;
}

// Helper matching the legacy font_size scale: 16 * 1.25^n
export function fontScaleSize(level: number): number {
  return Math.round(16 * Math.pow(1.25, level));
}
