import type { ZodTypeAny } from "zod";

// A plugin TYPE is a code-defined recipe: how to fetch data and how to draw
// it as an SVG at a given pixel size. INSTANCES of a type (Mongo docs in
// `plugin_instances`) carry per-deployment settings — different parks,
// different palettes, different date windows.
export interface PluginType<TSettings = unknown, TData = unknown> {
  id: string;
  name: string;
  description: string;
  category: "data-viz" | "list" | "kpi" | "custom" | "ai";

  // Default TTL for new instances. Per-instance ttlSec overrides this.
  // 900 = 15 min, 86400 = daily, 604800 = weekly.
  defaultTtlSec: number;

  // Default block dimensions when a new instance is created.
  defaultSize: { w: number; h: number };

  // Runtime-validated settings shape. The CMS uses this to generate a
  // settings form and the runner uses it to coerce user-supplied JSON
  // before calling fetchData/renderSvg. Kept loose (ZodTypeAny) so that
  // plugin authors can use defaults() and optional() freely without
  // fighting the input-vs-output type variance.
  settingsSchema: ZodTypeAny;

  // Build whatever payload the renderer needs. May call external HTTP,
  // MongoDB (eink_cms's own DB or Wildmile), or Claude. Throwing here
  // records lastError on the instance without crashing the device pull.
  fetchData(ctx: PluginContext<TSettings>): Promise<TData>;

  // Pure function of (settings, data, size) → SVG string. Kept separate
  // from fetchData so re-renders can skip the network when only the
  // block size changes.
  renderSvg(ctx: PluginContext<TSettings>, data: TData): Promise<string>;
}

export interface PluginContext<TSettings> {
  settings: TSettings;
  width: number;
  height: number;
  now: Date;
}

// Lightweight, untyped reference suitable for the registry index returned
// from `/api/plugins/types`.
export interface PluginTypeMeta {
  id: string;
  name: string;
  description: string;
  category: PluginType["category"];
  defaultTtlSec: number;
  defaultSize: { w: number; h: number };
}
