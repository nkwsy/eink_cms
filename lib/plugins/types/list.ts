import { z } from "zod";
import type { PluginType } from "../types";
import { DataSourceConfig, fetchDataSource } from "../data-sources";
import { interpolate } from "../template";
import { svgEscape } from "../svg";

// A vertical or horizontal list. Authors supply a per-item SVG snippet
// rendered once per record; the plugin handles the outer frame and
// arrangement.

const Settings = z.object({
  dataSource: DataSourceConfig,
  // Optional dotted path to the array within the response.
  itemsPath: z.string().optional(),
  // Per-item snippet — gets `{{item.field}}` access plus `{{i}}` index.
  itemTemplate: z.string().default(`<text x="10" y="{{y}}" font-family="Helvetica" font-size="20" fill="black">{{item.title}}</text>`),
  max: z.number().int().positive().default(5),
  direction: z.enum(["vertical", "horizontal"]).default("vertical"),
  title: z.string().optional(),
  background: z.enum(["white", "black"]).default("white"),
  padding: z.number().nonnegative().default(16),
});

type Settings = z.infer<typeof Settings>;
type Data = { items: unknown[] };

export const listPlugin: PluginType<Settings, Data> = {
  id: "list",
  name: "List",
  description: "Iterate an array data source through a per-item SVG template. Good for upcoming events, recent observations, leaderboards.",
  category: "list",
  defaultTtlSec: 900,
  defaultSize: { w: 480, h: 720 },
  settingsSchema: Settings,

  async fetchData(ctx) {
    const raw = await fetchDataSource(ctx.settings.dataSource);
    let items = raw as unknown[];
    if (ctx.settings.itemsPath) items = lookup(raw, ctx.settings.itemsPath) as unknown[];
    if (!Array.isArray(items)) items = [];
    return { items: items.slice(0, ctx.settings.max) };
  },

  async renderSvg(ctx, data) {
    const { width, height } = ctx;
    const bg = ctx.settings.background === "black" ? "#000000" : "#ffffff";
    const fg = ctx.settings.background === "black" ? "#ffffff" : "#000000";
    const pad = ctx.settings.padding;
    const titleHeight = ctx.settings.title ? 48 : 0;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2 - titleHeight;
    const count = Math.max(1, data.items.length);
    const slotW = ctx.settings.direction === "horizontal" ? Math.floor(innerW / count) : innerW;
    const slotH = ctx.settings.direction === "horizontal" ? innerH : Math.floor(innerH / count);

    const items = data.items
      .map((item, i) => {
        const x = pad + (ctx.settings.direction === "horizontal" ? i * slotW : 0);
        const y = pad + titleHeight + (ctx.settings.direction === "vertical" ? i * slotH : 0);
        const inner = interpolate(ctx.settings.itemTemplate, {
          item,
          i,
          x,
          y,
          w: slotW,
          h: slotH,
          fg,
          bg,
        });
        return `<g transform="translate(0,0)">${inner}</g>`;
      })
      .join("");

    const titleSvg = ctx.settings.title
      ? `<text x="${pad}" y="${pad + 32}" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="32" fill="${fg}">${svgEscape(ctx.settings.title)}</text>`
      : "";

    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${bg}"/>
  ${titleSvg}
  ${items}
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
