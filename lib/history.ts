// Undo/redo for the layout editor. Kept free of React so it can be tested.
//
// Dragging a block or typing in a field produces a stream of tiny changes;
// those are merged into one step when they carry the same `key` and arrive
// close together. Changes without a key (add, delete, reorder) are always
// their own step.

export type History<T> = {
  past: T[];
  present: T;
  future: T[];
  lastKey: string | null;
  lastAt: number;
};

export const HISTORY_LIMIT = 200;
export const MERGE_WINDOW_MS = 800;

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 };
}

export function pushHistory<T>(h: History<T>, next: T, key: string | null, now: number): History<T> {
  if (next === h.present) return h;
  const merge = key !== null && key === h.lastKey && now - h.lastAt < MERGE_WINDOW_MS && h.past.length > 0;
  if (merge) return { ...h, present: next, future: [], lastAt: now };
  const past = [...h.past, h.present];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, present: next, future: [], lastKey: key, lastAt: now };
}

export function undoHistory<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const past = h.past.slice(0, -1);
  return { past, present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastKey: null, lastAt: 0 };
}

export function redoHistory<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), lastKey: null, lastAt: 0 };
}
