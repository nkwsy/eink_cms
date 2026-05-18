import { z } from "zod";
import type { PluginType } from "../types";
import { trashCountsBy, TrashGroup } from "../wildmile";
import { svgEscape } from "../svg";

// Horizontal bar chart of trash counts. Designed for 1-bit output —
// filled bars + black labels, no gradients.

const Settings = z.object({
  sinceDays: z.number().int().positive().max(3650).default(30),
  groupBy: z.enum(["category", "material", "day"]).default("category"),
  topN: z.number().int().positive().max(20).default(8),
  title: z.string().default("Trash collected"),
  background: z.enum(["white", "black"]).default("white"),
});

type Settings = z.infer<typeof Settings>;
type Data = { groups: TrashGroup[]; total: number };

export const trashDashboardPlugin: PluginType<Settings, Data> = {
  id: "trash-dashboard",
  name: "Trash Dashboard",
  description: "Horizontal bar chart of trash counts from the Wildmile DB, grouped by category, material, or day.",
  category: "data-viz",
  defaultTtlSec: 3600,
  defaultSize: { w: 960, h: 540 },
  settingsSchema: Settings,

  async fetchData(ctx) {
    const since = new Date(ctx.now.getTime() - ctx.settings.sinceDays * 86400_000);
    const groups = await trashCountsBy({
      from: since,
      to: ctx.now,
      groupBy: ctx.settings.groupBy,
      limit: ctx.settings.topN,
    });
    const total = groups.reduce((s, g) => s + g.count, 0);
    return { groups, total };
  },

  async renderSvg(ctx, data) {
    const { width, height } = ctx;
    const bg = ctx.settings.background === "black" ? "#000000" : "#ffffff";
    const fg = ctx.settings.background === "black" ? "#ffffff" : "#000000";
    const padX = 24;
    const titleH = 64;
    const footerH = 32;
    const innerH = height - titleH - footerH;
    const rowCount = Math.max(1, data.groups.length);
    const rowH = innerH / rowCount;
    const labelW = Math.floor(width * 0.28);
    const max = Math.max(1, data.groups.reduce((m, g) => Math.max(m, g.count), 0));
    const barAreaW = width - padX * 2 - labelW;

    const rows = data.groups
      .map((g, i) => {
        const y = titleH + i * rowH;
        const barH = Math.max(8, rowH * 0.62);
        const barY = y + (rowH - barH) / 2;
        const barW = (g.count / max) * barAreaW;
        return [
          `<text x="${padX}" y="${barY + barH * 0.74}" font-family="Helvetica, Arial, sans-serif" font-size="${Math.floor(barH * 0.62)}" fill="${fg}">${svgEscape(g.label)}</text>`,
          `<rect x="${padX + labelW}" y="${barY}" width="${barW.toFixed(2)}" height="${barH}" fill="${fg}"/>`,
          `<text x="${padX + labelW + barW + 8}" y="${barY + barH * 0.74}" font-family="Helvetica, Arial, sans-serif" font-size="${Math.floor(barH * 0.62)}" fill="${fg}">${g.count}</text>`,
        ].join("");
      })
      .join("");

    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${bg}"/>
  <text x="${padX}" y="44" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="36" fill="${fg}">${svgEscape(ctx.settings.title)}</text>
  <text x="${width - padX}" y="44" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="${fg}">${data.total} items · last ${ctx.settings.sinceDays}d</text>
  ${rows}
</svg>`;
  },
};
