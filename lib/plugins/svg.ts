import { Resvg } from "@resvg/resvg-js";

// Rasterise an SVG string to a PNG buffer at the requested pixel size.
// We pin width via fitTo and let resvg compute height from the SVG's
// intrinsic aspect — plugins should set viewBox to the requested w×h so
// the result fills exactly the block dimensions.
export function svgToPng(svg: string, width: number, height: number): Buffer {
  // Ensure top-level svg carries explicit width/height/viewBox. Without these
  // resvg may downscale to the file's intrinsic size; we want the caller's
  // pixel dimensions to be authoritative.
  const normalised = ensureSize(svg, width, height);
  try {
    const resvg = new Resvg(normalised, {
      fitTo: { mode: "width", value: width },
      background: "rgba(0,0,0,0)",
      font: { loadSystemFonts: true },
    });
    return Buffer.from(resvg.render().asPng());
  } catch (err) {
    // resvg errors point at line:col, which is useless in the CMS UI
    // because the user can't see the line-numbered source. Re-throw with
    // a snippet centered on the failure so `lastError` is debuggable.
    throw new Error(annotateSvgError(err as Error, normalised));
  }
}

function annotateSvgError(err: Error, svg: string): string {
  const m = err.message.match(/at (\d+):(\d+)/);
  if (!m) return err.message;
  const line = Number(m[1]);
  const col = Number(m[2]);
  const lines = svg.split(/\r?\n/);
  const target = lines[line - 1] ?? "";
  const start = Math.max(0, col - 30);
  const end = Math.min(target.length, col + 30);
  const snippet = target.slice(start, end);
  const caret = " ".repeat(Math.min(30, col - 1 - start)) + "^";
  return `${err.message}\n  …${snippet}…\n   ${caret}`;
}

function ensureSize(svg: string, w: number, h: number): string {
  // Cheap, regex-based rewrite of the opening <svg ...> tag. We're not
  // parsing arbitrary user XML for correctness here — plugins control their
  // own output and we trust them to produce valid SVG. The goal is to make
  // sure width/height/viewBox are present so resvg honors our target size.
  return svg.replace(/<svg\b([^>]*)>/i, (_full, attrs: string) => {
    let a = attrs;
    if (!/\swidth=/i.test(a)) a += ` width="${w}"`;
    if (!/\sheight=/i.test(a)) a += ` height="${h}"`;
    if (!/\sviewBox=/i.test(a)) a += ` viewBox="0 0 ${w} ${h}"`;
    if (!/\sxmlns=/i.test(a)) a += ` xmlns="http://www.w3.org/2000/svg"`;
    return `<svg${a}>`;
  });
}

// Tiny SVG-safe text escape — plugins should use this when interpolating
// user data into text nodes or attribute values.
export function svgEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Strip <script> elements and event-handler attributes. Used on any SVG
// that may have been authored by an external party (claude-gen output,
// for instance). We don't execute SVG, but resvg does load external refs
// in some configurations, and we don't want surprises.
export function sanitiseSvg(svg: string): string {
  return svg
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "");
}

// Clean up the kinds of decorations Claude sometimes wraps around its SVG
// output even when told not to: ```svg / ``` fences and markdown-style
// angle-bracketed URL autolinks inside attributes (`xmlns=<http://...>`).
// Idempotent — safe to call on already-clean input.
export function unwrapClaudeSvg(raw: string): string {
  let s = raw.trim();
  // Leading ```svg / ```xml / ``` fence.
  s = s.replace(/^```(?:svg|xml|html)?\s*\n?/i, "");
  // Trailing fence.
  s = s.replace(/\n?```\s*$/, "");
  // Anything before the first <svg — chatty preamble.
  const firstSvg = s.search(/<svg\b/i);
  if (firstSvg > 0) s = s.slice(firstSvg);
  // Trailing content after the last </svg>.
  const lastClose = s.toLowerCase().lastIndexOf("</svg>");
  if (lastClose >= 0) s = s.slice(0, lastClose + 6);
  // <http://...> autolinks inside attribute values. Conservative: only
  // unwrap when the angle-bracketed value sits between quotes.
  s = s.replace(/(=")<((?:https?|data):[^>"]+)>(")/gi, "$1$2$3");
  s = s.replace(/(=')<((?:https?|data):[^>']+)>(')/gi, "$1$2$3");
  return s;
}
