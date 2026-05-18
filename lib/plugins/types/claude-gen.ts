import { z } from "zod";
import type { PluginType } from "../types";
import { DataSourceConfig, fetchDataSource } from "../data-sources";
import { interpolate } from "../template";
import { sanitiseSvg, svgEscape, unwrapClaudeSvg } from "../svg";

// Asks Claude to either (a) write the entire SVG itself ("svg" mode), or
// (b) fill named variables in a user-authored SVG template ("text" mode).
// Text mode is preferred for park signage where designers want control of
// layout and Claude's job is just to write copy.

const Settings = z.object({
  // Anthropic model id. Pinned in settings so a deployment can refresh
  // without changing model behaviour out from under it.
  model: z.string().default("claude-haiku-4-5-20251001"),
  prompt: z.string().min(1),
  outputKind: z.enum(["svg", "text"]).default("text"),
  // For "text" mode: an SVG template containing {{var}} placeholders the
  // model should fill. The prompt should tell the model to return a JSON
  // object with those keys.
  svgTemplate: z.string().optional(),
  // Optional context source — fetched and shown to the model verbatim.
  context: DataSourceConfig.optional(),
  // Hard cap so a misconfigured plugin can't burn budget.
  maxTokens: z.number().int().positive().max(4096).default(1024),
});

type Settings = z.infer<typeof Settings>;
type Data = { text: string; values?: Record<string, unknown> };

export const claudeGenPlugin: PluginType<Settings, Data> = {
  id: "claude-gen",
  name: "Claude Generator",
  description: "Generate content with Claude at refresh time. Mode 'text' fills a designer-authored SVG template with variables; mode 'svg' returns the whole SVG.",
  category: "ai",
  defaultTtlSec: 86400,
  defaultSize: { w: 800, h: 480 },
  settingsSchema: Settings,

  async fetchData(ctx) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

    let contextBlock = "";
    if (ctx.settings.context) {
      const raw = await fetchDataSource(ctx.settings.context);
      contextBlock = `\n\nData:\n${JSON.stringify(raw, null, 2).slice(0, 6000)}`;
    }

    const isText = ctx.settings.outputKind === "text";
    const userPrompt = isText
      ? `${ctx.settings.prompt}${contextBlock}\n\nReturn ONLY a JSON object whose keys match the {{variables}} in this SVG template:\n${ctx.settings.svgTemplate ?? ""}`
      : `${ctx.settings.prompt}${contextBlock}\n\nReturn ONLY a complete <svg ...>...</svg> document sized ${ctx.width}×${ctx.height}, no markdown fences.`;

    // Lazy-load the SDK so plugins that never use Claude don't pay the
    // load cost.
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: ctx.settings.model,
      max_tokens: ctx.settings.maxTokens,
      messages: [{ role: "user", content: userPrompt }],
    });
    const textBlock = res.content.find((b) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";

    if (isText) {
      // Try to parse Claude's JSON response. If parsing fails we fall back
      // to a single {error} variable so the SVG can still render.
      const cleaned = text.replace(/^```json\n?|```$/g, "").trim();
      try {
        const values = JSON.parse(cleaned);
        return { text, values };
      } catch {
        return { text, values: { error: "Could not parse Claude response", raw: text } };
      }
    }
    return { text };
  },

  async renderSvg(ctx, data) {
    if (ctx.settings.outputKind === "svg") {
      return sanitiseSvg(unwrapClaudeSvg(data.text));
    }
    const template = ctx.settings.svgTemplate ?? defaultTextTemplate(ctx.width, ctx.height);
    return interpolate(template, data.values ?? {});
  },
};

function defaultTextTemplate(w: number, h: number): string {
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${w / 2}" y="${h * 0.5}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="32" fill="#000000">${svgEscape("{{message}}")}</text>
</svg>`;
}
