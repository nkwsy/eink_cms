// Date formatters matching the legacy banner.py aesthetic.

const CUSTOM_DAY_ABBREV: Record<string, string> = {
  Tuesday: "Tues",
  Wednesday: "Wed",
  Thursday: "Thurs",
};

export function abbreviateDay(d: Date): string {
  const full = d.toLocaleDateString("en-US", { weekday: "long" });
  return CUSTOM_DAY_ABBREV[full] ?? full.slice(0, 3);
}

export function monthName(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long" });
}

export function dayOfMonth(d: Date): string {
  return String(d.getDate());
}

function stripZeroHour(d: Date): string {
  // en-US hour12 in Intl gives "1", "12" etc without leading zero — good.
  return d.toLocaleTimeString("en-US", { hour: "numeric", hour12: true, minute: undefined })
    .replace(/\s?(AM|PM)/i, "");
}

export function formatTimeParts(d: Date): { hm: string; ampm: string } {
  const hour = d.getHours() % 12 || 12;
  const minute = d.getMinutes();
  const ampm = d.getHours() >= 12 ? "PM" : "AM";
  const hm = `${hour}:${String(minute).padStart(2, "0")}`;
  return { hm, ampm };
}

export function parseFlexible(value: string | undefined, fallbackDate?: Date): Date | null {
  if (!value) return null;
  // "HH:mm" (optional am/pm) times stick to fallbackDate
  if (/^\d{1,2}:\d{2}(\s?[APap][Mm])?$/.test(value)) {
    const d = fallbackDate ? new Date(fallbackDate) : new Date();
    const m = value.match(/^(\d{1,2}):(\d{2})(\s?([APap][Mm]))?$/)!;
    let hr = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ap = (m[4] ?? "").toUpperCase();
    if (ap === "PM" && hr < 12) hr += 12;
    if (ap === "AM" && hr === 12) hr = 0;
    d.setHours(hr, min, 0, 0);
    return d;
  }
  // Bare "YYYY-MM-DD" — construct as local date so day-of-week / day-of-month
  // don't shift under the server's timezone.
  const ymd = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    return new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
  }
  const parsed = new Date(value);
  if (!isNaN(parsed.getTime())) return parsed;
  return null;
}
