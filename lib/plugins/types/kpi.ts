import { z } from "zod";
import type { PluginType } from "../types";
import { DataSourceConfig, fetchDataSource } from "../data-sources";
import { svgEscape } from "../svg";

const Settings = z.object({
  dataSource: DataSourceConfig,
  // JSON-pointer-ish dotted path into the fetched data to find the metric.
  valuePath: z.string().default("value"),
  label: z.string().default(""),
  // Optional unit suffix, e.g. "lbs", "%".
  unit: z.string().optional(),
  // sprintf-lite: %d → toString, %.1f → 1 decimal, fallback "%s".
  format: z.string().default("%s"),
  // Background polarity. Park signs are usually black-on-white; we leave
  // both options open so a designer can match the surrounding layout.
  background: z.enum(["white", "black"]).default("white"),
});

type Settings = z.infer<typeof Settings>;
type Data = { value: number | string };

export const kpiPlugin: PluginType<Settings, Data> = {
  id: "kpi",
  name: "KPI",
  description: "A big number with a label. Pulls one value from a data source and renders it large.",
  category: "kpi",
  defaultTtlSec: 900,
  defaultSize: { w: 480, h: 320 },
  settingsSchema: Settings,

  async fetchData(ctx) {
    const raw = await fetchDataSource(ctx.settings.dataSource);
    const value = lookup(raw, ctx.settings.valuePath);
    return { value: (value as number | string) ?? "—" };
  },

  async renderSvg(ctx, data) {
    const { width, height } = ctx;
    const bg = ctx.settings.background === "black" ? "#000000" : "#ffffff";
    const fg = ctx.settings.background === "black" ? "#ffffff" : "#000000";
    const formatted = applyFormat(ctx.settings.format, data.value);
    const display = `${formatted}${ctx.settings.unit ? ` ${ctx.settings.unit}` : ""}`;
    // Big number occupies ~60% of height; label sits beneath at ~15%.
    const numSize = Math.floor(height * 0.55);
    const labelSize = Math.max(14, Math.floor(height * 0.10));
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${bg}"/>
  <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle"
        font-family="Helvetica, Arial, sans-serif" font-weight="700"
        font-size="${numSize}" fill="${fg}">${svgEscape(display)}</text>
  <text x="50%" y="${height - Math.floor(height * 0.10)}" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-weight="400"
        font-size="${labelSize}" fill="${fg}">${svgEscape(ctx.settings.label)}</text>
</svg>`;
  },
};

function lookup(obj: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[/^\d+$/.test(p) ? Number(p) : p];
  }
  return cur;
}

function applyFormat(fmt: string, value: number | string): string {
  if (fmt === "%s" || fmt === "") return String(value);
  if (fmt === "%d") return String(Math.round(Number(value)));
  const float = fmt.match(/^%\.(\d+)f$/);
  if (float) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(Number(float[1])) : String(value);
  }
  return String(value);
}
