import { MongoClient, Db } from "mongodb";
import { z } from "zod";
import { MongoWildmileSource } from "./data-sources";

// Read-only connector to the upstream Wildmile MongoDB. We hold a separate
// client so eink_cms's own DB pool is unaffected. The connection string
// should belong to a user with read-only privileges on the relevant
// collections — this module additionally enforces a collection allowlist.

const URI = process.env.WILDMILE_MONGODB_URI;
const DB_NAME = process.env.WILDMILE_MONGODB_DB || "wildmile";

declare global {
  // eslint-disable-next-line no-var
  var _wildmileClient: Promise<MongoClient> | undefined;
}

function clientPromise(): Promise<MongoClient> {
  if (!URI) throw new Error("WILDMILE_MONGODB_URI is not set");
  if (!global._wildmileClient) {
    global._wildmileClient = new MongoClient(URI).connect();
  }
  return global._wildmileClient;
}

async function getWildmileDb(): Promise<Db> {
  const client = await clientPromise();
  return client.db(DB_NAME);
}

// Names mirror what the Wildmile repo's mongoose models compile to —
// mongoose pluralises and lowercases by default. We expose the union here
// rather than letting plugin authors pass arbitrary collection names so a
// misconfigured plugin can't, say, read user accounts.
export const ALLOWED_COLLECTIONS = [
  "plants",
  "individualplants",
  "plantobservations",
  "species",
  "trashes",
  "trashitems",
  "individualtrashitems",
  "trashitemmetadatas",
  "events",
  "projects",
  "modules",
  "sections",
] as const;
export type AllowedCollection = (typeof ALLOWED_COLLECTIONS)[number];

function assertAllowed(name: string): asserts name is AllowedCollection {
  if (!(ALLOWED_COLLECTIONS as readonly string[]).includes(name)) {
    throw new Error(
      `wildmile: collection "${name}" is not in the read allowlist`
    );
  }
}

// Generic query path used by the `mongo-wildmile` data-source.
export async function wildmileQuery(
  cfg: z.infer<typeof MongoWildmileSource>
): Promise<unknown[]> {
  assertAllowed(cfg.collection);
  const db = await getWildmileDb();
  let cursor = db
    .collection(cfg.collection)
    .find(cfg.query ?? {}, { projection: cfg.projection });
  if (cfg.sort) cursor = cursor.sort(cfg.sort);
  if (cfg.limit) cursor = cursor.limit(cfg.limit);
  return cursor.toArray();
}

// Pre-baked helpers for the plant/trash/event plugins so they don't each
// have to know the Wildmile schema by heart. Each returns plain serialisable
// objects suitable for hashing and rendering.

export async function recentPlantObservations(opts: {
  projectId?: string;
  since?: Date;
  limit?: number;
} = {}): Promise<PlantObservation[]> {
  const db = await getWildmileDb();
  const q: Record<string, unknown> = {};
  if (opts.projectId) q.project = opts.projectId;
  if (opts.since) q.createdAt = { $gte: opts.since };
  const docs = await db
    .collection("plantobservations")
    .find(q)
    .sort({ createdAt: -1 })
    .limit(opts.limit ?? 1000)
    .toArray();
  return docs.map((d: any) => ({
    id: String(d._id),
    species: d.species ? String(d.species) : undefined,
    lat: d.location?.coordinates?.[1] ?? d.lat,
    lng: d.location?.coordinates?.[0] ?? d.lng,
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : undefined,
  }));
}

export async function trashCountsBy(opts: {
  from?: Date;
  to?: Date;
  groupBy?: "category" | "material" | "day";
  limit?: number;
} = {}): Promise<TrashGroup[]> {
  const db = await getWildmileDb();
  const match: Record<string, unknown> = {};
  if (opts.from || opts.to) {
    match.createdAt = {} as Record<string, unknown>;
    if (opts.from) (match.createdAt as any).$gte = opts.from;
    if (opts.to) (match.createdAt as any).$lte = opts.to;
  }
  const groupKey =
    opts.groupBy === "day"
      ? { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
      : opts.groupBy === "material"
        ? "$material"
        : "$category";
  const docs = await db
    .collection("individualtrashitems")
    .aggregate([
      { $match: match },
      { $group: { _id: groupKey, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: opts.limit ?? 20 },
    ])
    .toArray();
  return docs.map((d: any) => ({ label: String(d._id ?? "unknown"), count: Number(d.count) }));
}

export async function upcomingEvents(opts: { limit?: number } = {}): Promise<UpcomingEvent[]> {
  const db = await getWildmileDb();
  const now = new Date();
  const docs = await db
    .collection("events")
    .find({ startTime: { $gte: now } } as Record<string, unknown>)
    .sort({ startTime: 1 })
    .limit(opts.limit ?? 10)
    .toArray();
  return docs.map((d: any) => ({
    id: String(d._id),
    title: d.title ?? d.name ?? "Event",
    subtitle: d.subtitle ?? d.description ?? undefined,
    startTime: d.startTime instanceof Date ? d.startTime.toISOString() : String(d.startTime ?? ""),
    endTime: d.endTime instanceof Date ? d.endTime.toISOString() : (d.endTime ? String(d.endTime) : undefined),
    location: d.location?.name ?? undefined,
  }));
}

export type PlantObservation = {
  id: string;
  species?: string;
  lat?: number;
  lng?: number;
  createdAt?: string;
};

export type TrashGroup = { label: string; count: number };

export type UpcomingEvent = {
  id: string;
  title: string;
  subtitle?: string;
  startTime: string;
  endTime?: string;
  location?: string;
};
