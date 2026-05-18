import { z } from "zod";

// A small, declarative data-source spec used by plugin SETTINGS so that
// many plugin types (custom-svg, kpi, list, claude-gen) can share one
// fetching layer instead of each rolling its own.
//
// The Wildmile Mongo connector lives in lib/plugins/wildmile.ts and
// enforces a read-only collection allowlist.

export const HttpSource = z.object({
  kind: z.literal("http"),
  url: z.string().url(),
  method: z.enum(["GET", "POST"]).optional(),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  // Optional JSON-pointer-ish path into the response. "items.0" → response.items[0].
  jsonPath: z.string().optional(),
});

export const MongoWildmileSource = z.object({
  kind: z.literal("mongo-wildmile"),
  collection: z.string(),
  query: z.record(z.unknown()).optional(),
  projection: z.record(z.union([z.literal(0), z.literal(1)])).optional(),
  sort: z.record(z.union([z.literal(1), z.literal(-1)])).optional(),
  limit: z.number().int().positive().max(1000).optional(),
});

export const StaticSource = z.object({
  kind: z.literal("static"),
  value: z.unknown(),
});

export const DataSourceConfig = z.discriminatedUnion("kind", [
  HttpSource,
  MongoWildmileSource,
  StaticSource,
]);

export type DataSourceConfig = z.infer<typeof DataSourceConfig>;

export async function fetchDataSource(cfg: DataSourceConfig): Promise<unknown> {
  switch (cfg.kind) {
    case "static":
      return cfg.value;
    case "http":
      return fetchHttp(cfg);
    case "mongo-wildmile": {
      // Late import so plugin types that don't use Wildmile don't pay the
      // module-load cost.
      const { wildmileQuery } = await import("./wildmile");
      return wildmileQuery(cfg);
    }
  }
}

async function fetchHttp(cfg: z.infer<typeof HttpSource>): Promise<unknown> {
  const res = await fetch(cfg.url, {
    method: cfg.method ?? "GET",
    headers: cfg.headers,
    body: cfg.body,
    // Short-circuit Next.js's fetch caching — the plugin runner manages
    // its own TTL based on lastRunAt.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${cfg.url}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  let body: unknown;
  if (ct.includes("application/json")) body = await res.json();
  else body = await res.text();
  if (cfg.jsonPath) body = navigatePath(body, cfg.jsonPath);
  return body;
}

function navigatePath(obj: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[/^\d+$/.test(p) ? Number(p) : p];
  }
  return cur;
}
