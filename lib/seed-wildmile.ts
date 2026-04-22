import type { Block, DeviceDoc } from "./mongo";
import { newBlock } from "./block";

// Port of the full legacy Wild Mile 2560×1440 banner.
// Legacy grid: 80 px unit, 32 cols × 18 rows.
//
// Top row (y = 0 … 720):
//   Park Rules       (0,0)  (6,9)    = (0, 0, 480, 720)    image
//   Welcome          (6,0)  (12,9)   = (480, 0, 960, 720)  image
//   Facts / Chonk    (18,0) (14,9)   = (1440, 0, 1120, 720) image
// Mid row (y = 720 … 1440):
//   Event title bar   (0,9)  (12,2.25) = (0, 720, 960, 180)
//   Event 1/2/3       rows at y = 900, 1080, 1260, 960×180
//   Activity title    (12,9) (9,2.25) = (960, 720, 720, 180)
//   Activity 1/2/3    rows at y = 900, 1080, 1260, 720×180
//   Get Involved      (21,9)   (11,4.5) = (1680, 720, 880, 360)
//   Water data        (21,13.5)(11,4.5) = (1680, 1080, 880, 360)

export type AssetIds = {
  event?: string;
  activity?: string;
  activityDated?: string;
  callout?: string;
  titleBar?: string;
};

export function buildWildMileLayout(ids: AssetIds): Block[] {
  const L: Block[] = [];

  // --- Top row images ---
  L.push(newBlock({ type: "image", imageData: "/images/32Eink_Rules.jpg",
    x: 0, y: 0, w: 480, h: 720, text: undefined }));
  L.push(newBlock({ type: "image", imageData: "/images/32Eink_WM_title.jpg",
    x: 480, y: 0, w: 960, h: 720, text: undefined }));
  L.push(newBlock({ type: "image", imageData: "/images/32Eink_info_hummingbird.jpg",
    x: 1440, y: 0, w: 1120, h: 720, text: undefined }));

  // --- Mid row: events ---
  if (ids.titleBar) L.push(newBlock({
    type: "asset", assetId: ids.titleBar,
    x: 0, y: 720, w: 960, h: 180, text: undefined,
    variableBindings: { title: "Upcoming Events" },
  }));
  if (ids.event) {
    const events = [
      { header: "Wild Mile Workshop", title: "Music Theory",  sub_text: "with Alex Rembold", date: "2023-08-03", start_time: "18:30", end_time: "20:30", url: "https://urbanriv.org" },
      { header: "Wild Mile Workshop", title: "DIY Mycology",  sub_text: "with Tom Knapp",   date: "2023-08-10", start_time: "18:30", end_time: "20:30", url: "https://urbanriv.org" },
      { header: "Wild Mile Workshop", title: "Voice Lessons", sub_text: "test",              date: "2023-08-17", start_time: "18:30", end_time: "20:30", url: "https://urbanriv.org" },
    ];
    events.forEach((ev, i) => {
      L.push(newBlock({
        type: "asset", assetId: ids.event,
        x: 0, y: 900 + i * 180, w: 960, h: 180, text: undefined,
        variableBindings: ev as unknown as Record<string, string>,
      }));
    });
  }

  // --- Mid row: activities ---
  if (ids.titleBar) L.push(newBlock({
    type: "asset", assetId: ids.titleBar,
    x: 960, y: 720, w: 720, h: 180, text: undefined,
    variableBindings: { title: "Things to do" },
  }));
  if (ids.activity) {
    L.push(newBlock({
      type: "asset", assetId: ids.activity,
      x: 960, y: 900, w: 720, h: 180, text: undefined,
      variableBindings: {
        title: "Tuesdays: Acoustic Jams!",
        sub_text: "Join CatJam Chicago for an open mic jam sesh while enjoying some free beer! Subject to cancellation — check our website or Instagram!",
        url: "",
      },
    }));
  }
  if (ids.activityDated) {
    L.push(newBlock({
      type: "asset", assetId: ids.activityDated,
      x: 960, y: 1080, w: 720, h: 180, text: undefined,
      variableBindings: {
        title: "River Ranger Socials",
        sub_text: "On the second Monday of each month, join your fellow River Ranger volunteers for an evening social at Off Color Brewing",
        date: "2023-08-14", start_time: "", end_time: "",
        url: "",
      },
    }));
    L.push(newBlock({
      type: "asset", assetId: ids.activityDated,
      x: 960, y: 1260, w: 720, h: 180, text: undefined,
      variableBindings: {
        title: "Wellness Weekend!",
        sub_text: "Join Urban River and community partners for a weekend of recreation and wellness, Aug 19-20, including free kayaking, yoga, Zumba, a raffle, and more!",
        date: "2023-08-19", start_time: "", end_time: "",
        url: "",
      },
    }));
  }

  // --- Right column: static images ---
  L.push(newBlock({ type: "image", imageData: "/images/32Eink_get_involved_logo.jpg",
    x: 1680, y: 720, w: 880, h: 360, text: undefined }));
  L.push(newBlock({ type: "image", imageData: "/images/32Eink_water_data.jpg",
    x: 1680, y: 1080, w: 880, h: 360, text: undefined }));

  // --- Dividers (white on black) ---
  const vLine = (x: number, y: number, h: number, t = 16) =>
    L.push(newBlock({ type: "line", lineDirection: "vertical", lineThickness: t,
      x: x - Math.floor(t / 2), y, w: t, h, text: undefined }));
  const hLine = (x: number, y: number, w: number, t = 10) =>
    L.push(newBlock({ type: "line", lineDirection: "horizontal", lineThickness: t,
      x, y: y - Math.floor(t / 2), w, h: t, text: undefined }));

  vLine(480, 0, 720, 16);
  vLine(1440, 0, 720, 16);
  hLine(0, 720, 2560, 10);
  vLine(960, 720, 720, 16);
  vLine(1680, 720, 720, 16);
  hLine(0, 900, 960, 5);
  hLine(0, 1080, 960, 5);
  hLine(0, 1260, 960, 5);
  hLine(960, 900, 720, 5);
  hLine(960, 1080, 720, 5);
  hLine(960, 1260, 720, 5);
  hLine(1680, 1080, 880, 10);

  return L;
}

export function wildMileDeviceDoc(ids: AssetIds): Omit<DeviceDoc, "_id" | "createdAt" | "updatedAt"> {
  return {
    slug: "wild-mile",
    name: "Wild Mile Banner",
    width: 2560,
    height: 1440,
    rotation: 0,
    background: "black",
    layout: buildWildMileLayout(ids),
  };
}
