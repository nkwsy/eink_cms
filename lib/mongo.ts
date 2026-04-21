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

export { ObjectId };

// ---- Types ----
export type BlockType =
  | "text"
  | "image"
  | "asset"
  | "qr"
  | "date"
  | "line"
  | "shape";

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
  invert?: boolean;
  maxChars?: number;
  letterSpacing?: number;
  lineHeight?: number;       // multiplier, default 1.15

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

  // shape
  shapeKind?: "filled" | "outlined";
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
  layout: Block[];
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
