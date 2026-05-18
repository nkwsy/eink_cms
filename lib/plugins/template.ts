// Shared {{var}} interpolation used by template-driven plugin types.
// Mirrors the asset-binding pattern in lib/render.ts (applyVars) but works
// against an arbitrary record. Supports dotted paths into nested data:
// `{{ items.0.title }}`.

import { svgEscape } from "./svg";

export type TemplateValues = Record<string, unknown>;

export function interpolate(template: string, values: TemplateValues, opts: { escape?: boolean } = {}): string {
  const escape = opts.escape !== false;
  return template.replace(/\{\{\s*([\w.-]+)\s*(\|\s*raw)?\s*\}\}/g, (_full, path: string, rawTag: string | undefined) => {
    const raw = lookup(values, path);
    if (raw == null) return "";
    const s = typeof raw === "string" ? raw : JSON.stringify(raw);
    if (rawTag) return s;
    return escape ? svgEscape(s) : s;
  });
}

function lookup(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[/^\d+$/.test(p) ? Number(p) : p];
  }
  return cur;
}

// Render a per-item snippet repeatedly. Used by the list plugin and any
// other type that wants a "for each" loop in user-authored SVG.
export function repeat<T>(items: T[], itemTemplate: string, baseValues: TemplateValues = {}): string {
  return items
    .map((item, i) => interpolate(itemTemplate, { ...baseValues, item, i }))
    .join("");
}
