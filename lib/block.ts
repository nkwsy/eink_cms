import type { Block } from "./mongo";

export function newBlock(partial: Partial<Block> = {}): Block {
  return {
    id: Math.random().toString(36).slice(2, 10),
    x: 0, y: 0, w: 100, h: 40,
    type: "text",
    text: "Hello",
    align: "left",
    vAlign: "top",
    fontSize: 16,
    fontFamily: "mono",
    border: false,
    padding: 4,
    ...partial,
  };
}

export const PRESET_BLOCKS: Record<string, () => Block> = {
  text: () => newBlock({ type: "text", text: "Text", w: 160, h: 32, fontSize: 18, fontFamily: "houschka" }),
  heading: () => newBlock({ type: "text", text: "Heading", w: 240, h: 44, fontSize: 32, fontFamily: "houschka-bold", bold: true }),
  image: () => newBlock({ type: "image", w: 200, h: 120 }),
  qr: () => newBlock({ type: "qr", w: 120, h: 120, qrUrl: "https://example.com", qrErrorLevel: "L", qrMargin: 0, text: undefined }),
  date: () => newBlock({ type: "date", w: 200, h: 110, dateISO: new Date().toISOString(), dateShowDayOfWeek: true, dateShowDay: true, dateShowMonth: true, dateShowTime: false, dateLayout: "stacked", fontFamily: "houschka-demibold", fontSize: 18, text: undefined }),
  lineH: () => newBlock({ type: "line", w: 300, h: 4, lineDirection: "horizontal", lineThickness: 2, text: undefined }),
  lineV: () => newBlock({ type: "line", w: 4, h: 200, lineDirection: "vertical", lineThickness: 2, text: undefined }),
  shape: () => newBlock({ type: "shape", w: 120, h: 40, shapeKind: "outlined", lineThickness: 2, text: undefined }),
  fill: () => newBlock({ type: "shape", w: 200, h: 40, shapeKind: "filled", text: undefined }),
};

export function gridBlocks(rect: { x: number; y: number; w: number; h: number }, cols: number, rows: number, gap = 0): Block[] {
  const cellW = Math.floor((rect.w - gap * (cols - 1)) / cols);
  const cellH = Math.floor((rect.h - gap * (rows - 1)) / rows);
  const out: Block[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push(newBlock({
        x: rect.x + c * (cellW + gap),
        y: rect.y + r * (cellH + gap),
        w: cellW,
        h: cellH,
        border: true,
        text: `Cell ${r * cols + c + 1}`,
      }));
    }
  }
  return out;
}
