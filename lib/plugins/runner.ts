import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { pluginInstances, PluginInstanceDoc } from "../mongo";
import { saveMedia, pngBufferToDataUrl } from "../media";
import { getPluginType } from "./registry";
import { svgToPng } from "./svg";

// Best-effort in-process lock to avoid concurrent regen of the same
// instance during a burst of device pulls. On serverless cold starts each
// invocation gets its own map, so this is "good enough" rather than a
// distributed lock — TTLs are minutes, not milliseconds.
const inflight = new Map<string, Promise<PluginInstanceDoc | null>>();

export async function ensureFreshOutput(instanceId: string): Promise<PluginInstanceDoc | null> {
  if (!ObjectId.isValid(instanceId)) return null;
  if (inflight.has(instanceId)) return inflight.get(instanceId)!;

  const p = runInstance(instanceId).finally(() => inflight.delete(instanceId));
  inflight.set(instanceId, p);
  return p;
}

// Force-refresh regardless of TTL. Used by the CMS "Refresh now" button and
// during plugin development.
export async function forceRefresh(instanceId: string): Promise<PluginInstanceDoc | null> {
  if (!ObjectId.isValid(instanceId)) return null;
  return runInstance(instanceId, { ignoreTtl: true });
}

async function runInstance(
  instanceId: string,
  opts: { ignoreTtl?: boolean } = {}
): Promise<PluginInstanceDoc | null> {
  const col = await pluginInstances();
  const inst = await col.findOne({ _id: new ObjectId(instanceId) });
  if (!inst) return null;

  const type = getPluginType(inst.typeId);
  if (!type) {
    await col.updateOne(
      { _id: inst._id },
      { $set: { lastError: { at: new Date(), message: `unknown plugin type ${inst.typeId}` } } }
    );
    return inst;
  }

  // TTL gate.
  const now = new Date();
  const ttlMs = (inst.ttlSec ?? type.defaultTtlSec) * 1000;
  if (!opts.ignoreTtl && inst.lastRunAt && now.getTime() - inst.lastRunAt.getTime() < ttlMs) {
    return inst;
  }

  // Validate settings against the plugin's schema. Bad settings shouldn't
  // crash the device pull — record the error, fall back to whatever media
  // was last successfully generated.
  const parsed = type.settingsSchema.safeParse(inst.settings);
  if (!parsed.success) {
    await col.updateOne(
      { _id: inst._id },
      { $set: { lastError: { at: now, message: `settings invalid: ${parsed.error.message}` } } }
    );
    return inst;
  }

  const ctx = {
    settings: parsed.data,
    width: inst.width,
    height: inst.height,
    now,
  };

  let data: unknown;
  try {
    data = await type.fetchData(ctx);
  } catch (err) {
    await col.updateOne(
      { _id: inst._id },
      { $set: { lastError: { at: now, message: `fetch failed: ${(err as Error).message}` } } }
    );
    return inst;
  }

  // Skip rendering when the data hasn't changed since the last successful
  // run. We still bump lastRunAt so the TTL clock restarts.
  const hash = hashData(data);
  if (inst.latestMediaId && hash === inst.lastDataHash) {
    await col.updateOne(
      { _id: inst._id },
      { $set: { lastRunAt: now, lastError: undefined } }
    );
    return { ...inst, lastRunAt: now };
  }

  let svg: string;
  try {
    svg = await type.renderSvg(ctx, data);
  } catch (err) {
    await col.updateOne(
      { _id: inst._id },
      { $set: { lastError: { at: now, message: `render failed: ${(err as Error).message}` } } }
    );
    return inst;
  }

  let pngBuf: Buffer;
  try {
    pngBuf = svgToPng(svg, inst.width, inst.height);
  } catch (err) {
    await col.updateOne(
      { _id: inst._id },
      { $set: { lastError: { at: now, message: `rasterise failed: ${(err as Error).message}` } } }
    );
    return inst;
  }

  const mediaDoc = await saveMedia({
    kind: "generated",
    name: `${inst.name} @ ${now.toISOString()}`,
    mimeType: "image/png",
    width: inst.width,
    height: inst.height,
    dataUrl: pngBufferToDataUrl(pngBuf),
    sourcePluginId: String(inst._id),
    sourceDataHash: hash,
  });

  const update: Partial<PluginInstanceDoc> = {
    lastRunAt: now,
    lastDataHash: hash,
    latestMediaId: String(mediaDoc._id),
    lastError: undefined,
    updatedAt: now,
  };
  await col.updateOne({ _id: inst._id }, { $set: update });
  return { ...inst, ...update };
}

function hashData(data: unknown): string {
  const json = JSON.stringify(data, replacer);
  return createHash("sha256").update(json).digest("hex");
}

function replacer(_key: string, value: unknown): unknown {
  // Normalise Date → ISO so otherwise-identical payloads hash the same
  // even when fetchData returns Date objects.
  if (value instanceof Date) return value.toISOString();
  return value;
}
