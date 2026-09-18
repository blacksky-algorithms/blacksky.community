import {
  gridHeight,
  packGridLayout,
  pointToSlot,
  previewSlot,
} from '#/components/SortableGrid'

const COL = 100
const ROW = 80

describe('packGridLayout', () => {
  it('packs hero, halves, and a wide tile row-major', () => {
    const rects = packGridLayout([2, 1, 1, 2, 1], COL, ROW)
    expect(rects).toEqual([
      {x: 0, y: 0, w: 200, h: ROW},
      {x: 0, y: ROW, w: 100, h: ROW},
      {x: 100, y: ROW, w: 100, h: ROW},
      {x: 0, y: ROW * 2, w: 200, h: ROW},
      {x: 0, y: ROW * 3, w: 100, h: ROW},
    ])
  })

  it('leaves an orphan half-slot empty when a wide tile breaks a row', () => {
    const rects = packGridLayout([1, 2, 1], COL, ROW)
    expect(rects[0]).toEqual({x: 0, y: 0, w: 100, h: ROW})
    expect(rects[1]).toEqual({x: 0, y: ROW, w: 200, h: ROW})
    expect(rects[2]).toEqual({x: 0, y: ROW * 2, w: 100, h: ROW})
  })

  it('reports total height from the last row', () => {
    const rects = packGridLayout([2, 1, 1], COL, ROW)
    expect(gridHeight(rects)).toBe(ROW * 2)
  })
})

describe('pointToSlot', () => {
  const rects = packGridLayout([2, 1, 1, 1], COL, ROW)

  it('finds the nearest tile in the pointed row', () => {
    expect(pointToSlot(rects, 40, ROW + 10, ROW)).toBe(1)
    expect(pointToSlot(rects, 160, ROW + 10, ROW)).toBe(2)
  })

  it('maps the hero row to slot 0', () => {
    expect(pointToSlot(rects, 150, 10, ROW)).toBe(0)
  })

  it('clamps drags above the grid to the first row', () => {
    expect(pointToSlot(rects, 10, -500, ROW)).toBe(0)
  })

  it('clamps drags below the grid to the last row', () => {
    expect(pointToSlot(rects, 10, 5000, ROW)).toBe(3)
  })
})

describe('previewSlot', () => {
  it('shifts intermediate tiles down when dragging up', () => {
    expect(previewSlot(0, 2, 0)).toBe(1)
    expect(previewSlot(1, 2, 0)).toBe(2)
    expect(previewSlot(3, 2, 0)).toBe(3)
  })

  it('shifts intermediate tiles up when dragging down', () => {
    expect(previewSlot(1, 0, 2)).toBe(0)
    expect(previewSlot(2, 0, 2)).toBe(1)
    expect(previewSlot(3, 0, 2)).toBe(3)
  })

  it('moves the active tile to the target', () => {
    expect(previewSlot(2, 2, 0)).toBe(0)
  })
})
