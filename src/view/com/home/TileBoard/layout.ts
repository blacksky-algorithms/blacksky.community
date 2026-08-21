import {type SavedFeedSourceInfo} from '#/state/queries/feed'

export type TileSpan = 1 | 2

export type TileRect = {
  x: number
  y: number
  w: number
  h: number
  span: TileSpan
}

export function deriveTileSpan(
  index: number,
  feed: Pick<SavedFeedSourceInfo, 'contentMode'>,
): TileSpan {
  return index === 0 || feed.contentMode === 'video' ? 2 : 1
}

export function packLayout(
  spans: TileSpan[],
  colW: number,
  rowH: number,
): TileRect[] {
  let row = 0
  let col = 0

  return spans.map(span => {
    if (span === 2 && col === 1) {
      row += 1
      col = 0
    }
    const rect = {x: col * colW, y: row * rowH, w: colW * span, h: rowH, span}
    if (span === 2) {
      row += 1
      col = 0
    } else if (col === 0) {
      col = 1
    } else {
      row += 1
      col = 0
    }
    return rect
  })
}

export function layoutHeight(rects: TileRect[]): number {
  return rects.reduce((height, rect) => Math.max(height, rect.y + rect.h), 0)
}
