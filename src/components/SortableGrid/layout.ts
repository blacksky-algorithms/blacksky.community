export type GridRect = {x: number; y: number; w: number; h: number}

export type GridSpan = 1 | 2

export function packGridLayout(
  spans: GridSpan[],
  colW: number,
  rowH: number,
): GridRect[] {
  'worklet'
  const rects: GridRect[] = []
  let row = 0
  let col = 0
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i]
    if (span === 2 && col === 1) {
      row += 1
      col = 0
    }
    rects.push({x: col * colW, y: row * rowH, w: colW * span, h: rowH})
    if (span === 2 || col === 1) {
      row += 1
      col = 0
    } else {
      col = 1
    }
  }
  return rects
}

export function gridHeight(rects: GridRect[]): number {
  'worklet'
  let height = 0
  for (let i = 0; i < rects.length; i++) {
    const bottom = rects[i].y + rects[i].h
    if (bottom > height) height = bottom
  }
  return height
}

export function pointToSlot(
  rects: GridRect[],
  x: number,
  y: number,
  rowH: number,
): number {
  'worklet'
  if (rects.length === 0) return 0
  const maxRow = Math.floor(rects[rects.length - 1].y / rowH)
  const row = Math.max(0, Math.min(Math.floor(y / rowH), maxRow))
  let closest = -1
  let closestDistance = Infinity
  for (let i = 0; i < rects.length; i++) {
    if (Math.floor(rects[i].y / rowH) !== row) continue
    const distance = Math.abs(x - (rects[i].x + rects[i].w / 2))
    if (distance < closestDistance) {
      closest = i
      closestDistance = distance
    }
  }
  if (closest === -1) closest = rects.length - 1
  return closest
}

export function previewSlot(mySlot: number, from: number, to: number): number {
  'worklet'
  if (mySlot === from) return to
  if (from < to && mySlot > from && mySlot <= to) return mySlot - 1
  if (from > to && mySlot >= to && mySlot < from) return mySlot + 1
  return mySlot
}
