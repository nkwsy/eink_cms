import { z } from "zod";
import type { PluginType } from "../types";
import { upcomingEvents, UpcomingEvent } from "../wildmile";
import { svgEscape } from "../svg";

// Upcoming-events panel. Designed for park-sign use — a small handful of
// upcoming items with date pulled out big, title prominent, optional
// subtitle and location underneath.

const Settings = z.object({
  max: z.number().int().positive().max(20).default(4),
  title: z.string().default("Upcoming"),
  background: z.enum(["white", "black"]).default("white"),
});

type Settings = z.infer<typeof Settings>;
type Data = { events: UpcomingEvent[] };

export const eventsPlugin: PluginType<Settings, Data> = {
  id: "events",
  name: "Upcoming Events",
  description: "Wildmile upcoming-events panel. Big date, event title, optional location.",
  category: "list",
  defaultTtlSec: 1800,
  defaultSize: { w: 960, h: 720 },
  settingsSchema: Settings,

  async fetchData(ctx) {
    return { events: await upcomingEvents({ limit: ctx.settings.max }) };
  },

  async renderSvg(ctx, data) {
    const { width, height } = ctx;
    const bg = ctx.settings.background === "black" ? "#000000" : "#ffffff";
    const fg = ctx.settings.background === "black" ? "#ffffff" : "#000000";
    const padX = 24;
    const titleH = 64;
    const rowCount = Math.max(1, data.events.length);
    const rowH = (height - titleH - 24) / rowCount;

    const rows = data.events
      .map((ev, i) => {
        const y = titleH + i * rowH;
        const d = parseDate(ev.startTime);
        const day = d ? String(d.getDate()).padStart(2, "0") : "—";
        const mon = d ? d.toLocaleString("en-US", { month: "short" }).toUpperCase() : "";
        const dow = d ? d.toLocaleString("en-US", { weekday: "short" }).toUpperCase() : "";
        const time = d ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
        const dateBoxW = 110;
        return [
          // Date stack on the left.
          `<g transform="translate(${padX}, ${y + 8})">
            <text x="${dateBoxW / 2}" y="22" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="22" fill="${fg}">${svgEscape(dow)}</text>
            <text x="${dateBoxW / 2}" y="72" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="60" fill="${fg}">${svgEscape(day)}</text>
            <text x="${dateBoxW / 2}" y="98" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="400" font-size="20" fill="${fg}">${svgEscape(mon)}</text>
          </g>`,
          // Divider.
          `<line x1="${padX + dateBoxW + 12}" y1="${y + 16}" x2="${padX + dateBoxW + 12}" y2="${y + rowH - 16}" stroke="${fg}" stroke-width="2"/>`,
          // Title + subtitle.
          `<text x="${padX + dateBoxW + 28}" y="${y + 42}" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="30" fill="${fg}">${svgEscape(ev.title)}</text>`,
          ev.subtitle
            ? `<text x="${padX + dateBoxW + 28}" y="${y + 74}" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="${fg}">${svgEscape(ev.subtitle)}</text>`
            : "",
          `<text x="${padX + dateBoxW + 28}" y="${y + 104}" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="${fg}">${svgEscape([time, ev.location].filter(Boolean).join(" · "))}</text>`,
        ].join("");
      })
      .join("");

    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${bg}"/>
  <text x="${padX}" y="44" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="36" fill="${fg}">${svgEscape(ctx.settings.title)}</text>
  ${rows}
</svg>`;
  },
};

function parseDate(s: string): Date | null {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
