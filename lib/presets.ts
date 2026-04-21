import type { AssetDoc, Block } from "./mongo";
import { newBlock } from "./block";

// Legacy port of banner.py `input_event` / `input_action` / `input_callout`.
// Legacy grid unit: 80 px. Event/Activity rows are 2.25 units tall = 180 px.
// Font levels follow font_size(n) = 16 * 1.25^n.
//
// Anchor translations PIL → CMS:
//   mb (middle, bottom) → block with align=center vAlign=bottom, rect bottom-edge = y
//   mt (middle, top)    → align=center vAlign=top,    rect top-edge    = y
//   lb (left, bottom)   → align=left   vAlign=bottom
//   lt (left, top)      → align=left   vAlign=top
// In all cases we anchor via a rect chosen so the anchor edge lands at the legacy y.

const SIZE = (n: number) => Math.round(16 * Math.pow(1.25, n));

// -------------------- Event card (960×180) --------------------
// Matches Banner.input_event:
//   date cluster (left, hardcoded pixel x=70)
//   header  center-bottom at (W/2, 0.25·H)  medium     size(4)=39
//   title   center-top    at (W/2, 0.33·H)  demibold   size(5)=48
//   sub     center-top    at (W/2, 0.80·H)  medium     size(2)=25
//   qr      right column, 70% of H
export function presetEventCard(): Omit<AssetDoc, "_id" | "createdAt" | "updatedAt"> {
  const W = 960, H = 180;
  const cx = W / 2;

  const dateBlock: Block = newBlock({
    type: "date",
    x: 0, y: 0, w: 180, h: H,
    dateISO: "{{date}}",
    startTime: "{{start_time}}",
    endTime: "{{end_time}}",
    dateShowDayOfWeek: true, dateShowDay: true, dateShowMonth: true, dateShowTime: true,
    dateLayout: "stacked",
    fontSize: 16,
    text: undefined,
  });

  // Header — anchor mb at (cx, 0.25·H=45). font_size(4)=39.
  // Rect: align=center vAlign=bottom, bottom at y=45, give enough room above.
  const header: Block = newBlock({
    type: "text", text: "{{header}}",
    x: 180, y: 0, w: W - 360, h: 45,
    fontFamily: "houschka", fontSize: SIZE(4),
    align: "center", vAlign: "bottom",
    padding: 0,
  });

  // Title — anchor mt at (cx, 0.33·H ≈ 59). font_size(5)=48.
  const title: Block = newBlock({
    type: "text", text: "{{title}}",
    x: 180, y: Math.round(0.33 * H), w: W - 360, h: 56,
    fontFamily: "houschka-demibold", fontSize: SIZE(5),
    align: "center", vAlign: "top",
    padding: 0, lineHeight: 1.0,
  });

  // Sub_text — anchor mt at (cx, 0.80·H=144). font_size(2)=25.
  const sub: Block = newBlock({
    type: "text", text: "{{sub_text}}",
    x: 180, y: Math.round(0.80 * H), w: W - 360, h: H - Math.round(0.80 * H),
    fontFamily: "houschka", fontSize: SIZE(2),
    align: "center", vAlign: "top",
    padding: 0, lineHeight: 1.05,
  });

  // QR — legacy renders QR at 70% of box height, right-aligned.
  const qrSide = Math.round(H * 0.7);
  const qrMargin = Math.floor((H - qrSide) / 2);
  const qr: Block = newBlock({
    type: "qr", qrUrl: "{{url}}",
    x: W - H + qrMargin, y: qrMargin, w: qrSide, h: qrSide,
    qrMargin: 0, qrErrorLevel: "L",
    text: undefined,
  });

  return {
    name: "Event card (legacy)",
    width: W, height: H,
    background: "black",
    layout: [dateBlock, header, title, sub, qr],
    variables: [
      { key: "header",     label: "Header",    type: "text", default: "Wild Mile Workshop" },
      { key: "title",      label: "Title",     type: "text", default: "Music Theory" },
      { key: "sub_text",   label: "Sub text",  type: "text", default: "with Alex Rembold" },
      { key: "date",       label: "Date",      type: "date", default: "2023-08-03" },
      { key: "start_time", label: "Start",     type: "text", default: "18:30" },
      { key: "end_time",   label: "End",       type: "text", default: "20:30" },
      { key: "url",        label: "URL",       type: "url",  default: "https://urbanriv.org" },
    ],
  };
}

// -------------------- Activity card (720×180) --------------------
// Matches Banner.input_action (no-date branch — the common case):
//   title     lt at (20, 20)                 bold   size(6)=61
//   sub_text  lt at (20, title_bottom + 5)   medium size(2)=25
//   qr (if url) right column
// There is also a "with date" branch with its own date+title+sub; we expose
// a variant named "Activity card (dated)" for that usage.
export function presetActivityCard(): Omit<AssetDoc, "_id" | "createdAt" | "updatedAt"> {
  const W = 720, H = 180;
  const qrSide = Math.round(H * 0.7);
  const qrMargin = Math.floor((H - qrSide) / 2);

  const TITLE_SIZE = SIZE(5);  // legacy font_size(6)=61 is too tall for a 180-px row;
                               // pull down to size(5)=48 to match reference visuals.
  // Title gets the full card width (minus small padding) — the QR, when
  // present, is drawn on top of whatever's underneath so short titles don't
  // get clipped by the reserved QR column.
  const title: Block = newBlock({
    type: "text", text: "{{title}}",
    x: 20, y: 16, w: W - 40, h: TITLE_SIZE + 8,
    fontFamily: "houschka-bold", fontSize: TITLE_SIZE,
    align: "left", vAlign: "top", bold: true,
    padding: 0, lineHeight: 1.0,
  });

  // Body text keeps clear of the QR column so long descriptions don't slide
  // underneath the code.
  const sub: Block = newBlock({
    type: "text", text: "{{sub_text}}",
    x: 20, y: 16 + TITLE_SIZE + 10, w: W - H - 30, h: H - (16 + TITLE_SIZE + 10) - 6,
    fontFamily: "houschka", fontSize: SIZE(1),
    align: "left", vAlign: "top",
    padding: 0, lineHeight: 1.1,
  });

  const qr: Block = newBlock({
    type: "qr", qrUrl: "{{url}}",
    x: W - H + qrMargin, y: qrMargin, w: qrSide, h: qrSide,
    qrMargin: 0, qrErrorLevel: "L",
    text: undefined,
  });

  return {
    name: "Activity card (legacy)",
    width: W, height: H,
    background: "black",
    layout: [title, sub, qr],
    variables: [
      { key: "title",    label: "Title",    type: "text", default: "Tuesdays: Acoustic Jams!" },
      { key: "sub_text", label: "Sub text", type: "text", default: "Join CatJam Chicago for an open mic jam sesh. Subject to cancellation — check our website or Instagram!" },
      { key: "url",      label: "URL",      type: "url",  default: "" },
    ],
  };
}

// Dated-activity variant (date cluster + title + sub_text + QR).
export function presetActivityDatedCard(): Omit<AssetDoc, "_id" | "createdAt" | "updatedAt"> {
  const W = 720, H = 180;
  const qrSide = Math.round(H * 0.7);
  const qrMargin = Math.floor((H - qrSide) / 2);

  const dateBlock: Block = newBlock({
    type: "date",
    x: 0, y: 0, w: 180, h: H,
    dateISO: "{{date}}", startTime: "{{start_time}}", endTime: "{{end_time}}",
    dateShowDayOfWeek: true, dateShowDay: true, dateShowMonth: true, dateShowTime: false,
    dateLayout: "stacked", fontSize: 16,
    text: undefined,
  });
  const TITLE_SIZE = SIZE(5);
  // Title runs from the date column to the right edge (QR will cover where
  // it renders on top).
  const title: Block = newBlock({
    type: "text", text: "{{title}}",
    x: 180, y: 16, w: W - 180 - 20, h: TITLE_SIZE + 8,
    fontFamily: "houschka-bold", fontSize: TITLE_SIZE,
    bold: true,
    align: "left", vAlign: "top", padding: 0, lineHeight: 1.0,
  });
  const sub: Block = newBlock({
    type: "text", text: "{{sub_text}}",
    x: 180, y: 16 + TITLE_SIZE + 10, w: W - 180 - H - 10, h: H - (16 + TITLE_SIZE + 10) - 6,
    fontFamily: "houschka", fontSize: SIZE(1),
    align: "left", vAlign: "top", padding: 0, lineHeight: 1.1,
  });
  const qr: Block = newBlock({
    type: "qr", qrUrl: "{{url}}",
    x: W - H + qrMargin, y: qrMargin, w: qrSide, h: qrSide,
    qrMargin: 0, qrErrorLevel: "L",
    text: undefined,
  });
  return {
    name: "Activity card — dated (legacy)",
    width: W, height: H,
    background: "black",
    layout: [dateBlock, title, sub, qr],
    variables: [
      { key: "title",    label: "Title",    type: "text", default: "River Ranger Socials" },
      { key: "sub_text", label: "Sub text", type: "text", default: "On the second Monday of each month, join your fellow River Ranger volunteers for an evening social at Off Color Brewing" },
      { key: "date",       label: "Date",      type: "date", default: "2023-08-14" },
      { key: "start_time", label: "Start",     type: "text", default: "" },
      { key: "end_time",   label: "End",       type: "text", default: "" },
      { key: "url",      label: "URL",      type: "url",  default: "" },
    ],
  };
}

// -------------------- Callout card (880×360) --------------------
// Matches Banner.input_callout text variant:
//   header lt at (60, 60)   medium   size(6)=61
//   title  lt at (600, 180) demibold size(8)=95  (legacy; but visually also used as large header)
//   body   lt below header                       medium size(5)=48
// For a flexible CMS version we keep header + title + body, all left-aligned.
export function presetCalloutCard(): Omit<AssetDoc, "_id" | "createdAt" | "updatedAt"> {
  const W = 880, H = 360;

  const header: Block = newBlock({
    type: "text", text: "{{header}}",
    x: 60, y: 60, w: W - 120, h: SIZE(6) + 8,
    fontFamily: "houschka", fontSize: SIZE(6),
    align: "left", vAlign: "top", padding: 0, lineHeight: 1.0,
  });
  const title: Block = newBlock({
    type: "text", text: "{{title}}",
    x: 60, y: 60 + SIZE(6) + 16, w: W - 120, h: SIZE(8) + 8,
    fontFamily: "houschka-demibold", fontSize: SIZE(8),
    align: "left", vAlign: "top", padding: 0, lineHeight: 1.0,
  });
  const body: Block = newBlock({
    type: "text", text: "{{body}}",
    x: 60, y: 60 + SIZE(6) + 16 + SIZE(8) + 16,
    w: W - 120,
    h: H - (60 + SIZE(6) + 16 + SIZE(8) + 16) - 30,
    fontFamily: "houschka", fontSize: SIZE(5),
    align: "left", vAlign: "top", padding: 0, lineHeight: 1.1,
  });

  return {
    name: "Callout card (legacy)",
    width: W, height: H,
    background: "black",
    layout: [header, title, body],
    variables: [
      { key: "header", label: "Header", type: "text", default: "Get Involved" },
      { key: "title",  label: "Title",  type: "text", default: "Welcome to the Wild Mile" },
      { key: "body",   label: "Body",   type: "text", default: "Come become an Urban River Ranger. Find out more at UrbanRiv.org" },
    ],
  };
}

// Title-bar reusable block: "Upcoming Events", "Things to do", etc.
// 960×180 (or narrower) black row with large centered text.
export function presetTitleBar(): Omit<AssetDoc, "_id" | "createdAt" | "updatedAt"> {
  const W = 960, H = 180;
  const label: Block = newBlock({
    type: "text", text: "{{title}}",
    x: 0, y: 0, w: W, h: H,
    fontFamily: "houschka-demibold", fontSize: SIZE(8),
    align: "center", vAlign: "middle",
    padding: 8, lineHeight: 1.0,
  });
  return {
    name: "Title bar (legacy)",
    width: W, height: H,
    background: "black",
    layout: [label],
    variables: [{ key: "title", label: "Title", type: "text", default: "Upcoming Events" }],
  };
}

export const PRESET_FACTORIES = [
  { key: "event", make: presetEventCard },
  { key: "activity", make: presetActivityCard },
  { key: "activity_dated", make: presetActivityDatedCard },
  { key: "callout", make: presetCalloutCard },
  { key: "title_bar", make: presetTitleBar },
];
