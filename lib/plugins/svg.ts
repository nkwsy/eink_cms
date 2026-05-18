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
  const resvg = new Resvg(normalised, {
    fitTo: { mode: "width", value: width },
    background: "rgba(0,0,0,0)",
    font: { loadSystemFonts: true },
  });
  const png = resvg.render().asPng();
  return Buffer.from(png);
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
