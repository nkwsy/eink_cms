import { z } from "zod";
import type { PluginType } from "../types";
import { DataSourceConfig, fetchDataSource } from "../data-sources";
import { interpolate } from "../template";

// The escape-hatch plugin: paste any SVG with {{var}} placeholders, point
// it at a data source, and it renders. Most park-sign plugins start life
// as one of these and only graduate to a dedicated type when they get
// complex enough to benefit from real code.

const Settings = z.object({
  svgTemplate: z.string().min(1, "svgTemplate is required"),
  dataSource: DataSourceConfig.optional(),
  // Optional inline constants for the template — handy when you don't
  // need an external data source but want to parameterise text/colours.
  constants: z.record(z.unknown()).optional(),
});

type Settings = z.infer<typeof Settings>;
type Data = { values: Record<string, unknown> };

export const customSvgPlugin: PluginType<Settings, Data> = {
  id: "custom-svg",
  name: "Custom SVG",
  description: "Paste an SVG template with {{var}} placeholders and bind it to a data source. Best starting point for hand-designed plugins.",
  category: "custom",
  defaultTtlSec: 900,
  defaultSize: { w: 800, h: 480 },
  settingsSchema: Settings,

  async fetchData(ctx) {
    const values: Record<string, unknown> = { ...(ctx.settings.constants ?? {}) };
    if (ctx.settings.dataSource) {
      const raw = await fetchDataSource(ctx.settings.dataSource);
      // Two common shapes: an object becomes the variable bag directly;
      // anything else becomes `data` for `{{data}}` access.
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        Object.assign(values, raw as Record<string, unknown>);
      } else {
        values.data = raw;
      }
    }
    values.width = ctx.width;
    values.height = ctx.height;
    values.now = ctx.now.toISOString();
    return { values };
  },

  async renderSvg(ctx, data) {
    return interpolate(ctx.settings.svgTemplate, data.values);
  },
};
