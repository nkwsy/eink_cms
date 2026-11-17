import { MongoClient, Db, Collection, ObjectId, Binary } from "mongodb";

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
export async function frames(): Promise<Collection<FrameDoc>> {
  return (await getDb()).collection<FrameDoc>("frames");
}
export async function liveBackups(): Promise<Collection<LiveBackupDoc>> {
  return (await getDb()).collection<LiveBackupDoc>("live_backups");
}
export async function modelFiles(): Promise<Collection<ModelFileDoc>> {
  return (await getDb()).collection<ModelFileDoc>("model_files");
}
export async function versions(): Promise<Collection<VersionDoc>> {
  return (await getDb()).collection<VersionDoc>("versions");
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
  // How the crisp renderer turns this picture into black and white:
  // "sharp" = hard cut-off (line art), "dots" = regular dot pattern (flat
  // grey fills), "dither" = error diffusion (photographs). Unset = "auto",
  // which picks one from the picture's tones. Also applies to plugin blocks.
  imageMode?: "auto" | "sharp" | "dots" | "dither";

  // asset instance
  assetId?: string;
  variableBindings?: Record<string, string>;
  imageBindings?: Record<string, string>;  // key -> data URL overriding a variable image

  // qr
  qrUrl?: string;
  qrMargin?: number;         // pixels of quiet zone outside the QR within the block
  // Quiet zone in modules (the QR standard asks for 4). Set on new blocks;
  // when present it replaces qrMargin. Older blocks keep their pixel margin.
  qrQuiet?: number;
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
  // The live layout: what the stored image in `published` was drawn from.
  layout: Block[];
  // Work in progress. The editor always saves here; "Promote" draws it,
  // stores the image and copies it to `layout`.
  draftLayout?: Block[];
  // The finished image the pull URL serves. Unset on screens that have not
  // been promoted since the crisp renderer shipped: those are still drawn on
  // every pull by the old renderer, so their look is unchanged.
  published?: PublishedRef;
  // What was live before the calibration screen was shown (null = the old
  // renderer). Present only while calibration is showing.
  beforeCalibration?: PublishedRef | null;
  // Last time the BMP was fetched from the pull URL.
  lastPull?: { at: Date; userAgent?: string };
  pullCount?: number;
  // Text weight for the crisp renderer: a glyph pixel is inked when it is
  // covered at least this much (0–255). Lower = heavier text. Default 128.
  inkCutoff?: number;
  // Screen model name, e.g. "28in-mono". Selects the dv_signage.xml served
  // at /<slug>/dv_signage.xml.
  model?: string;
  // Goes up by one every time the draft is written. The editor sends the
  // number it started from, so two windows cannot silently overwrite each other.
  draftRev?: number;
  // Last version number handed out for this device.
  versionSeq?: number;
  // The version that is live now.
  liveVersion?: { id: string; number: number };
  // A version drawn and stored ahead of time that goes live at `at`.
  scheduled?: { versionId: string; number: number; at: Date };
  updatedAt: Date;
  createdAt: Date;
};

// The parts of a device that change how a layout is drawn.
export type VersionScreen = Pick<DeviceDoc, "width" | "height" | "rotation" | "background" | "inkCutoff">;

// A card (asset) as it was when a version was saved.
export type FrozenAsset = Pick<AssetDoc, "name" | "width" | "height" | "background" | "layout" | "variables">;

// A plugin's settings as they were when a version was saved. Its data is not
// kept: a version always shows current data.
export type FrozenPlugin = Pick<PluginInstanceDoc, "typeId" | "name" | "width" | "height" | "settings" | "ttlSec">;

// One saved state of a screen. Versions are numbered per device and never
// change once written, apart from their name and the moment they went live.
//   promoted  — is or was live;
//   saved     — a checkpoint of the draft;
//   scheduled — drawn and stored, waiting for its time to go live.
export type VersionDoc = {
  _id?: ObjectId;
  deviceId: string;
  number: number;
  kind: "promoted" | "saved" | "scheduled";
  label?: string;
  createdAt: Date;
  promotedAt?: Date;
  // Set when this version was made by going back to an earlier one.
  restoredFrom?: number;
  screen: VersionScreen;
  layout: Block[];
  layoutHash: string;
  assets: Record<string, FrozenAsset>;
  plugins: Record<string, FrozenPlugin>;
  // Media library items the layout and its cards use. They cannot be deleted
  // while a version still needs them.
  mediaIds: string[];
  // The stored finished image, when one has been drawn.
  frame?: PublishedRef | null;
  // Live through the old renderer: drawn on every pull, no stored image.
  legacy?: boolean;
};

// Pointer to a stored finished image (see lib/published.ts).
export type PublishedRef = {
  frameId: string;
  kind: "screen" | "calibration";
  at: Date;
  sha256: string;
  width: number;
  height: number;
};

// A finished image, stored compressed. One byte of grey per pixel.
export type FrameDoc = {
  _id?: ObjectId;
  deviceId: string;
  kind: "screen" | "calibration";
  width: number;
  height: number;
  data: Binary;                    // zlib-deflated 8-bit grey
  sha256: string;
  renderer: string;
  createdAt: Date;
};

// The live layout and image a promote replaced, kept so one promote can be
// undone. One document per device. Only read now, to turn it into a version
// the first time a device is opened after versions shipped.
export type LiveBackupDoc = {
  _id?: ObjectId;
  deviceId: string;
  layout: Block[];
  published: PublishedRef | null;
  replacedAt: Date;
};

// Device settings file (dv_signage.xml) shared by every screen of one model.
export type ModelFileDoc = {
  _id?: ObjectId;
  model: string;
  content: string;
  updatedAt: Date;
};

export type AssetDoc = {
  _id?: ObjectId;
  name: string;
  width: number;
  height: number;
  background?: "white" | "black";
  layout: Block[];
  variables?: AssetVariable[];
  // Set on a copy made when going back to a version whose card has since
  // been changed. See lib/versions.ts.
  copiedFrom?: CopiedFrom;
  updatedAt: Date;
  createdAt: Date;
};

// Where a frozen copy of a card or plugin came from. `hash` identifies the
// frozen original; `selfHash` is the copy as created, so an edited copy is
// not reused.
export type CopiedFrom = { id: string; hash: string; selfHash: string };

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
  copiedFrom?: CopiedFrom;
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
