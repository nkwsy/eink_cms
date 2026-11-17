import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, initHistory, MERGE_WINDOW_MS, pushHistory, redoHistory, undoHistory } from "@/lib/history";

describe("editor undo history", () => {
  it("undoes and redoes separate steps", () => {
    let h = initHistory("a");
    h = pushHistory(h, "b", null, 0);
    h = pushHistory(h, "c", null, 10);
    h = undoHistory(h);
    expect(h.present).toBe("b");
    h = undoHistory(h);
    expect(h.present).toBe("a");
    expect(undoHistory(h)).toBe(h);
    h = redoHistory(redoHistory(h));
    expect(h.present).toBe("c");
    expect(redoHistory(h)).toBe(h);
  });

  it("merges a quick stream of the same change into one step", () => {
    let h = initHistory(0);
    for (let i = 1; i <= 20; i++) h = pushHistory(h, i, "blk:x,y", i * 16);
    expect(h.present).toBe(20);
    expect(h.past).toEqual([0]);
    expect(undoHistory(h).present).toBe(0);
  });

  it("starts a new step after a pause or for a different change", () => {
    let h = initHistory(0);
    h = pushHistory(h, 1, "blk:x,y", 0);
    h = pushHistory(h, 2, "blk:x,y", MERGE_WINDOW_MS + 1);
    h = pushHistory(h, 3, "blk:text", MERGE_WINDOW_MS + 2);
    h = pushHistory(h, 4, null, MERGE_WINDOW_MS + 3);
    h = pushHistory(h, 5, null, MERGE_WINDOW_MS + 4);
    expect(h.past).toEqual([0, 1, 2, 3, 4]);
  });

  it("does not merge into a step that was just undone or redone", () => {
    let h = initHistory(0);
    h = pushHistory(h, 1, "k", 0);
    h = undoHistory(h);
    h = pushHistory(h, 2, "k", 5);
    expect(h.past).toEqual([0]);
    expect(h.future).toEqual([]);
    expect(undoHistory(h).present).toBe(0);
  });

  it("drops redo steps on a new change and ignores no-change", () => {
    let h = initHistory("a");
    h = pushHistory(h, "b", null, 0);
    h = undoHistory(h);
    expect(pushHistory(h, h.present, null, 1)).toBe(h);
    h = pushHistory(h, "c", null, 2);
    expect(h.future).toEqual([]);
    expect(h.past).toEqual(["a"]);
  });

  it("keeps a bounded number of steps", () => {
    let h = initHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 50; i++) h = pushHistory(h, i, null, i);
    expect(h.past.length).toBe(HISTORY_LIMIT);
    expect(h.past[0]).toBe(50);
  });
});
