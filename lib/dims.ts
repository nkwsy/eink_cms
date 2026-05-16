// Editor / device dimension helper.
// device.width × device.height is the device's native buffer size. When a
// rotation is in effect the layout is authored in the visually-rotated frame,
// so the editor canvas swaps dimensions while the device output stays native.
export function editorDims(d: { width: number; height: number; rotation?: number | null }): { w: number; h: number } {
  return d.rotation === 90 || d.rotation === 270
    ? { w: d.height, h: d.width }
    : { w: d.width, h: d.height };
}
