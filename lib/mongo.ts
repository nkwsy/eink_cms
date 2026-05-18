import { MongoClient, Db, Collection, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "eink_cms";

if (!uri) {
  // Don't throw at import time in dev — throw on first use
  console.warn("[mongo] MONGODB_URI not set");
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoClient: Promise<MongoClient> | undefined;
}

function clientPromise(): Promise<MongoClient> {
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (!global._mongoClient) {
    global._mongoClient = new MongoClient(uri).connect();
  }
  return global._mongoClient;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  return client.db(dbName);
}

export async function devices(): Promise<Collection<DeviceDoc>> {
  return (await getDb()).collection<DeviceDoc>("devices");
}
export async function assets(): Promise<Collection<AssetDoc>> {
  return (await getDb()).collection<AssetDoc>("assets");
}
export async function pluginInstances(): Promise<Collection<PluginInstanceDoc>> {
  return (await getDb()).collection<PluginInstanceDoc>("plugin_instances");
}
export async function media(): Promise<Collection<MediaItemDoc>> {
  return (await getDb()).collection<MediaItemDoc>("media");
}
export async function layouts(): Promise<Collection<LayoutDoc>> {
  return (await getDb()).collection<LayoutDoc>("layouts");
}

export { ObjectId };

// ---- Types ----
export type BlockType =
  | "text"
  | "image"
  | "asset"
  | "qr"
  | "date"
  | "line"
  | "shape"
  | "plugin";

export type FontFamily = "mono" | "sans" | "houschka" | "houschka-bold" | "houschka-demibold" | "houschka-extrabold" | "pixelva" | "chikarego";

export type Block = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  // visual
  border?: boolean;
  padding?: number;
  background?: "white" | "black";
  // content
  type: BlockType;

  // text
  text?: string;
  align?: "left" | "center" | "right";
  vAlign?: "top" | "middle" | "bottom";
  fontSize?: number;
  fontFamily?: FontFamily;
  bold?: boolean;
  italic?: boolean;
  // Treat the text as inline markdown: **bold**, *italic*, ***bold italic***.
  // When false/undefined, the text renders verbatim. block.bold/italic still
  // apply as a baseline; inline markers toggle on top of that.
  rich?: boolean;
  invert?: boolean;
  maxChars?: number;
  letterSpacing?: number;
  lineHeight?: number;       // multiplier, default 1.15

  // Preserve w/h ratio when resizing via the editor handle or W/H inputs.
  lockAspect?: boolean;

  // image
  imageData?: string;        // data: URL (already 1-bit PNG)

  // asset instance
  assetId?: string;
  variableBindings?: Record<string, string>;
  imageBindings?: Record<string, string>;  // key -> data URL overriding a variable image

  // qr
  qrUrl?: string;
  qrMargin?: number;         // pixels of quiet zone outside the QR within the block
  qrErrorLevel?: "L" | "M" | "Q" | "H";
  // Module style. "square" = classic filled squares per module (default).
  // "bars" = horizontal-bar style modelled on python-qrcode's
  // HorizontalSquareBarsDrawer: each active module is drawn as a
  // full-width, vertically-shrunken bar so consecutive active modules in
  // a row visually merge into a single band.
  qrStyle?: "square" | "bars";
  qrVerticalShrink?: number; // 0..1, only for "bars" style; default 0.8
  // When unset/true, the QR renders inverted: black quiet zone + white
  // modules — looks correct against the default black device background
  // and saves ink. Set explicitly to false for a classic white-bg QR.
  qrInvert?: boolean;

  // date
  dateISO?: string;          // e.g. "2026-05-01" or full ISO
  startTime?: string;        // "HH:mm" or full ISO
  endTime?: string;
  dateShowDayOfWeek?: boolean;
  dateShowMonth?: boolean;
  dateShowDay?: boolean;
  dateShowTime?: boolean;
  dateLayout?: "stacked" | "row";  // stacked = day-of-week / big number / month

  // line
  lineDirection?: "horizontal" | "vertical";
  lineThickness?: number;
  // Explicit colour for line blocks. Falls back to the contrast colour of
  // the surrounding background when unset.
  lineColor?: "white" | "black";

  // shape
  shapeKind?: "filled" | "outlined";

  // plugin
  pluginInstanceId?: string;        // references PluginInstanceDoc._id
  // image-block extension: when set, drawImage resolves a MediaItem instead
  // of using the inline data-URL imageData. Old data-URL blocks keep working.
  mediaId?: string;
};

export type AssetVariable = {
  key: string;
  label?: string;
  type: "text" | "image" | "url" | "date";
  default?: string;
};

export type DeviceDoc = {
  _id?: ObjectId;
  slug: string;
  name: string;
  width: number;
  height: number;
  rotation?: 0 | 90 | 180 | 270;
  background?: "white" | "black";
  // Output BMP bit depth. 1 = monochrome (default, works on most Waveshare
  // panels). 24 = 24-bit BGR BMP for controllers that refuse 1-bpp input
  // (e.g. the 28" 3840×1080 panel).
  bitDepth?: 1 | 24;
  layout: Block[];
  // Optional uncommitted draft. The public pull endpoint always serves
  // `layout`; the editor edits `draftLayout` and "Publish" copies it across.
  draftLayout?: Block[];
  updatedAt: Date;
  createdAt: Date;
};

export type AssetDoc = {
  _id?: ObjectId;
  name: string;
  width: number;
  height: number;
  background?: "white" | "black";
  layout: Block[];
  variables?: AssetVariable[];
  updatedAt: Date;
  createdAt: Date;
};

// A configured instance of a code-defined plugin type. The type itself lives
// in lib/plugins/types/<id>.ts; settings are validated by that type's zod
// schema at fetch time.
export type PluginInstanceDoc = {
  _id?: ObjectId;
  typeId: string;                  // e.g. "custom-svg", "plant-heatmap"
  name: string;
  width: number;
  height: number;
  settings: Record<string, unknown>;
  ttlSec: number;                  // refresh interval (regenerate-on-pull cap)
  // Last successful fetch timestamp. We use this as the TTL anchor.
  lastRunAt?: Date;
  // Hash of the most recent fetched data payload — skip re-rendering when
  // unchanged, even if TTL is exceeded.
  lastDataHash?: string;
  // Most recently generated media item for this instance. Block render
  // path reads this id and composites the image.
  latestMediaId?: string;
  // Surface fetch/render errors to the CMS without crashing the device pull.
  lastError?: { at: Date; message: string };
  createdAt: Date;
  updatedAt: Date;
};

// Generic media store — uploads (user-cropped/dithered images) and plugin
// outputs share one collection so the library UI can list both.
export type MediaItemDoc = {
  _id?: ObjectId;
  kind: "upload" | "generated";
  name?: string;
  mimeType: string;                // "image/png", "image/svg+xml", "image/jpeg"
  width: number;
  height: number;
  // v1 stores image bytes inline as a data URL — same as existing image
  // blocks. The storageRef escape hatch is reserved for a later move to
  // blob storage without touching call sites.
  dataUrl?: string;
  storageRef?: string;
  // Provenance for generated items.
  sourcePluginId?: string;
  sourceDataHash?: string;
  createdAt: Date;
};

// A named, reusable layout independent of any device. Applied to a device by
// copying its blocks (and dimensions) onto the device's draft or live layout.
export type LayoutDoc = {
  _id?: ObjectId;
  name: string;
  width: number;
  height: number;
  background?: "white" | "black";
  layout: Block[];
  createdAt: Date;
  updatedAt: Date;
};
