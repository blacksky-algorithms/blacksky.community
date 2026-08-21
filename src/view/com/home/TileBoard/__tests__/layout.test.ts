import {deriveTileSpan, layoutHeight, packLayout} from '../layout'

describe('packLayout', () => {
  it('packs half tiles in rows', () => {
    expect(packLayout([1, 1, 1], 100, 80)).toEqual([
      {x: 0, y: 0, w: 100, h: 80, span: 1},
      {x: 100, y: 0, w: 100, h: 80, span: 1},
      {x: 0, y: 80, w: 100, h: 80, span: 1},
    ])
  })

  it('leaves an orphan gap before a wide tile', () => {
    const rects = packLayout([1, 2, 1], 100, 80)
    expect(rects[1]).toEqual({x: 0, y: 80, w: 200, h: 80, span: 2})
    expect(rects[2]).toEqual({x: 0, y: 160, w: 100, h: 80, span: 1})
    expect(layoutHeight(rects)).toBe(240)
  })
})

describe('deriveTileSpan', () => {
  it('makes the first and video feeds wide', () => {
    expect(deriveTileSpan(0, {contentMode: undefined})).toBe(2)
    expect(deriveTileSpan(2, {contentMode: 'video'})).toBe(2)
    expect(deriveTileSpan(2, {contentMode: undefined})).toBe(1)
  })
})
