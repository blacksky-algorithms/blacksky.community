import {createMultiPathSVG, createStrokeSVG} from './TEMPLATE'

// hand-edited fill — scripts/icons/fill-overrides/Bot_Filled.svg
export const Bot_Filled = createMultiPathSVG({
  paths: [
    'M6 7h5V3H8V1h5v6h5a3 3 0 0 1 3 3v3h3v2h-3v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3H0v-2h3v-3a3 3 0 0 1 3-3Zm2 5h2v4H8v-4Zm6 0h2v4h-2v-4Z',
  ],
  viewBox: '0 0 24 24',
})

// lucide: bot
export const Bot_Stroke = createStrokeSVG({
  paths: [
    'M12 8V4H8',
    'M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2z',
    'M2 14h2',
    'M20 14h2',
    'M15 13v2',
    'M9 13v2',
  ],
  viewBox: '0 0 24 24',
  strokeWidth: 2,
})
