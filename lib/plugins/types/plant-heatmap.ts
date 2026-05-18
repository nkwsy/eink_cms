import { z } from "zod";
import type { PluginType } from "../types";
import { recentPlantObservations, PlantObservation } from "../wildmile";
import { svgEscape } from "../svg";

// Density map: project plant observations onto a grid, draw filled cells
// whose darkness encodes count. v1 uses a simple lat/lng bounding box —
// later we can ingest a custom park outline as an SVG path.

const Settings = z.object({
  projectId: z.string().optional(),
  sinceDays: z.number().int().positive().max(3650).default(365),
  // Grid resolution.
  cols: z.number().int().min(4).max(60).default(16),
  rows: z.number().int().min(4).max(60).default(10),
  // Optional manual bounds (decimal degrees). If unset, computed from data.
  bounds: z
    .object({
      minLat: z.number(),
      maxLat: z.number(),
      minLng: z.number(),
      maxLng: z.number(),
    })
    .optional(),
  title: z.string().default("Plant observations"),
  background: z.enum(["white", "black"]).default("white"),
});

type Settings = z.infer<typeof Settings>;
type Data = {
  cells: { row: number; col: number; count: number }[];
  max: number;
  total: number;
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
};

export const plantHeatmapPlugin: PluginType<Settings, Data> = {
  id: "plant-heatmap",
  name: "Plant Heatmap",
  description: "Density map of plant observations from the Wildmile MongoDB. Bins points into a grid and shades each cell by count.",
  category: "data-viz",
  defaultTtlSec: 3600,
  defaultSize: { w: 960, h: 720 },
  settingsSchema: Settings,

  async fetchData(ctx) {
    const since = new Date(ctx.now.getTime() - ctx.settings.sinceDays * 86400_000);
    const obs = await recentPlantObservations({
      projectId: ctx.settings.projectId,
      since,
      limit: 5000,
    });
    return binToGrid(obs, ctx.settings);
  },

  async renderSvg(ctx, data) {
    const { width, height } = ctx;
    const bg = ctx.settings.background === "black" ? "#000000" : "#ffffff";
    const fg = ctx.settings.background === "black" ? "#ffffff" : "#000000";
    const titleH = 56;
    const footerH = 28;
    const innerW = width;
    const innerH = height - titleH - footerH;
    const cellW = innerW / ctx.settings.cols;
    const cellH = innerH / ctx.settings.rows;
    const max = Math.max(1, data.max);

    const cells = data.cells
      .map((c) => {
        const x = c.col * cellW;
        const y = titleH + c.row * cellH;
        const intensity = c.count / max;
        // Quantise to 5 levels so 1-bit dithering reads cleanly.
        const level = Math.min(4, Math.floor(intensity * 5));
        const opacity = (level + 1) / 5;
        return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cellW.toFixed(2)}" height="${cellH.toFixed(2)}" fill="${fg}" fill-opacity="${opacity.toFixed(2)}"/>`;
      })
      .join("");

    // Grid lines on top so cells stay visually segmented.
    const verticals = Array.from({ length: ctx.settings.cols + 1 }, (_, i) => {
      const x = i * cellW;
      return `<line x1="${x.toFixed(2)}" y1="${titleH}" x2="${x.toFixed(2)}" y2="${titleH + innerH}" stroke="${fg}" stroke-opacity="0.25" stroke-width="1"/>`;
    }).join("");
    const horizontals = Array.from({ length: ctx.settings.rows + 1 }, (_, i) => {
      const y = titleH + i * cellH;
      return `<line x1="0" y1="${y.toFixed(2)}" x2="${innerW}" y2="${y.toFixed(2)}" stroke="${fg}" stroke-opacity="0.25" stroke-width="1"/>`;
    }).join("");

    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${bg}"/>
  <text x="24" y="40" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="32" fill="${fg}">${svgEscape(ctx.settings.title)}</text>
  ${cells}
  ${verticals}
  ${horizontals}
  <text x="${width - 24}" y="${height - 10}" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="${fg}">${data.total} observations · darker = more</text>
</svg>`;
  },
};

function binToGrid(obs: PlantObservation[], s: Settings): Data {
  const points = obs.filter((o): o is PlantObservation & { lat: number; lng: number } =>
    typeof o.lat === "number" && typeof o.lng === "number"
  );
  if (points.length === 0) {
    const b = s.bounds ?? { minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 };
    return { cells: [], max: 0, total: 0, bounds: b };
  }
  const bounds = s.bounds ?? {
    minLat: Math.min(...points.map((p) => p.lat)),
    maxLat: Math.max(...points.map((p) => p.lat)),
    minLng: Math.min(...points.map((p) => p.lng)),
    maxLng: Math.max(...points.map((p) => p.lng)),
  };
  // Guard against degenerate (zero-extent) bounds.
  const dLat = Math.max(1e-9, bounds.maxLat - bounds.minLat);
  const dLng = Math.max(1e-9, bounds.maxLng - bounds.minLng);
  const counts = new Map<string, number>();
  for (const p of points) {
    const col = clamp(Math.floor(((p.lng - bounds.minLng) / dLng) * s.cols), 0, s.cols - 1);
    // Y axis inverts — north (max lat) should be at the top.
    const row = clamp(Math.floor(((bounds.maxLat - p.lat) / dLat) * s.rows), 0, s.rows - 1);
    const k = `${row},${col}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const cells = Array.from(counts.entries()).map(([k, count]) => {
    const [row, col] = k.split(",").map(Number);
    return { row, col, count };
  });
  const max = cells.reduce((m, c) => Math.max(m, c.count), 0);
  return { cells, max, total: points.length, bounds };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
