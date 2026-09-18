#!/usr/bin/env node
import {createRequire} from 'node:module'
import {readFileSync, writeFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const require = createRequire(import.meta.url)
const openmoji = dirname(require.resolve('openmoji/package.json'))
const config = JSON.parse(
  readFileSync(resolve(here, 'sticker-picks.json'), 'utf8'),
)

const attrs = tag =>
  Object.fromEntries(
    [...tag.matchAll(/([a-zA-Z0-9_-]+)="([^"]*)"/g)].map(match => [
      match[1],
      match[2],
    ]),
  )

function shapeToPath(kind, a) {
  if (kind === 'path') return a.d
  if (kind === 'circle') {
    const [cx, cy, r] = [+a.cx, +a.cy, +a.r]
    return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`
  }
  if (kind === 'ellipse') {
    const [cx, cy, rx, ry] = [+a.cx, +a.cy, +a.rx, +a.ry]
    return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`
  }
  if (kind === 'line') return `M${a.x1} ${a.y1}L${a.x2} ${a.y2}`
  if (kind === 'rect') {
    const [x, y, width, height] = [+a.x, +a.y, +a.width, +a.height]
    return `M${x} ${y}h${width}v${height}h${-width}z`
  }
  const points = a.points.trim().split(/[\s,]+/)
  let path = 'M'
  for (let i = 0; i < points.length - 1; i += 2) {
    path += `${i ? ' L' : ''}${points[i]} ${points[i + 1]}`
  }
  return kind === 'polygon' ? path + 'z' : path
}

function extractShapes(svg) {
  const shapes = []
  for (const match of svg.matchAll(
    /<(path|circle|ellipse|line|rect|polyline|polygon)\b[^>]*?\/?>/g,
  )) {
    const a = attrs(match[0])
    const fill = a.fill === undefined || a.fill !== 'none'
    const stroke = a.stroke !== undefined && a.stroke !== 'none'
    shapes.push({
      path: shapeToPath(match[1], a),
      fill,
      stroke,
      ...(a['stroke-linecap'] ? {strokeLinecap: a['stroke-linecap']} : {}),
      ...(a['stroke-linejoin'] ? {strokeLinejoin: a['stroke-linejoin']} : {}),
      ...(a['stroke-miterlimit']
        ? {strokeMiterlimit: +a['stroke-miterlimit']}
        : {}),
    })
  }
  return shapes
}

const pascal = value => value[0].toUpperCase() + value.slice(1)
const lines = ["import {createStickerSVG} from './TEMPLATE'", '']

for (const [name, sticker] of Object.entries(config.stickers)) {
  const source = resolve(openmoji, 'black/svg', `${sticker.codepoint}.svg`)
  const shapes = extractShapes(readFileSync(source, 'utf8'))
  const strokeWidth = sticker.strokeWidth ?? config.strokeWidth
  lines.push(`export const Avatar${pascal(name)} = createStickerSVG({`)
  lines.push(`  strokeWidth: ${strokeWidth},`)
  lines.push('  paths: [')
  for (const shape of shapes) {
    lines.push(`    ${JSON.stringify(shape)},`)
  }
  lines.push('  ],', '})', '')
}

writeFileSync(
  resolve(root, 'src/components/icons/AvatarStickers.tsx'),
  lines.join('\n'),
)
