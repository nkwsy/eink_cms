import type { PluginType, PluginTypeMeta } from "./types";

// Static import barrel — every plugin type registers itself here. Static
// imports are intentional: Next.js's serverless bundler can't dynamically
// require() from disk at runtime on Vercel, and we want each deploy to
// ship a known, audited set of plugin types.
import { customSvgPlugin } from "./types/custom-svg";
import { kpiPlugin } from "./types/kpi";
import { listPlugin } from "./types/list";
import { plantHeatmapPlugin } from "./types/plant-heatmap";
import { trashDashboardPlugin } from "./types/trash-dashboard";
import { eventsPlugin } from "./types/events";
import { claudeGenPlugin } from "./types/claude-gen";

const ALL: PluginType<any, any>[] = [
  customSvgPlugin,
  kpiPlugin,
  listPlugin,
  plantHeatmapPlugin,
  trashDashboardPlugin,
  eventsPlugin,
  claudeGenPlugin,
];

const BY_ID: Record<string, PluginType<any, any>> = Object.fromEntries(
  ALL.map((p) => [p.id, p])
);

export function getPluginType(id: string): PluginType<any, any> | undefined {
  return BY_ID[id];
}

export function listPluginTypes(): PluginTypeMeta[] {
  return ALL.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    defaultTtlSec: p.defaultTtlSec,
    defaultSize: p.defaultSize,
  }));
}
