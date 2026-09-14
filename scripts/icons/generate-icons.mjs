#!/usr/bin/env node
/**
 * Regenerates src/components/icons/*.tsx from an openly-licensed icon library.
 *
 * Inputs:
 *   scripts/icons/icon-map.json   symbol -> module, concept, per-library candidate
 *   scripts/icons/icon-picks.json symbol -> library   (exported from icon-picker.html)
 *
 * Usage:
 *   node scripts/icons/generate-icons.mjs                     # apply picks
 *   node scripts/icons/generate-icons.mjs --all tabler        # ignore picks, use one library
 *   node scripts/icons/generate-icons.mjs --dry-run           # report, write nothing
 */
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const ICONS_DIR = resolve(ROOT, 'src/components/icons')

const LIBS = {
  phosphor: {
    pkg: '@phosphor-icons/core',
    outline: 'assets/regular',
    fill: 'assets/fill',
    fillSuffix: '-fill',
    viewBox: '0 0 256 256',
    strokeWidth: 0,
  },
  lucide: {
    pkg: 'lucide-static',
    outline: 'icons',
    fill: null,
    fillSuffix: '',
    viewBox: '0 0 24 24',
    strokeWidth: 2,
  },
  tabler: {
    pkg: '@tabler/icons',
    outline: 'icons/outline',
    fill: 'icons/filled',
    fillSuffix: '',
    viewBox: '0 0 24 24',
    strokeWidth: 2,
  },
  iconoir: {
    pkg: 'iconoir',
    outline: 'icons/regular',
    fill: 'icons/solid',
    fillSuffix: '',
    viewBox: '0 0 24 24',
    strokeWidth: 1.5,
  },
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const forceLib = args.includes('--all') ? args[args.indexOf('--all') + 1] : null
if (forceLib && !LIBS[forceLib]) {
  console.error(
    `unknown library "${forceLib}" — expected one of ${Object.keys(LIBS).join(', ')}`,
  )
  process.exit(1)
}

const map = JSON.parse(readFileSync(resolve(HERE, 'icon-map.json'), 'utf8'))
const avatarStickers = JSON.parse(
  readFileSync(resolve(HERE, 'avatar-stickers.json'), 'utf8'),
)
const stickerOnlySymbols = new Set(Object.keys(avatarStickers.symbols))
const picksPath = resolve(HERE, 'icon-picks.json')
const picks =
  !forceLib && existsSync(picksPath)
    ? JSON.parse(readFileSync(picksPath, 'utf8'))
    : {}
if (!forceLib && !existsSync(picksPath)) {
  console.error(
    'no scripts/icons/icon-picks.json — export it from icon-picker.html, or pass --all <library>',
  )
  process.exit(1)
}

function libRoot(lib) {
  const p = resolve(ROOT, 'node_modules', LIBS[lib].pkg)
  if (!existsSync(p)) {
    console.error(
      `${LIBS[lib].pkg} is not installed. Add the icon libraries as devDependencies first.`,
    )
    process.exit(1)
  }
  return p
}

const attrs = tag =>
  Object.fromEntries(
    [...tag.matchAll(/([a-zA-Z0-9_-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]),
  )

/** Normalise every drawable element to a path `d` string. */
function extractPaths(svg) {
  const out = []
  for (const m of svg.matchAll(
    /<(path|circle|line|rect|polyline|polygon)\b[^>]*?\/?>/g,
  )) {
    const a = attrs(m[0])
    switch (m[1]) {
      case 'path':
        // Tabler prefixes an invisible 24x24 bounding-box path
        if (a.fill === 'none' && a.stroke === 'none') continue
        if (a.d) out.push(a.d)
        break
      case 'circle': {
        const [cx, cy, r] = [+a.cx, +a.cy, +a.r]
        out.push(
          `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`,
        )
        break
      }
      case 'line':
        out.push(`M${a.x1} ${a.y1}L${a.x2} ${a.y2}`)
        break
      case 'rect': {
        const [x, y, w, h] = [+a.x, +a.y, +a.width, +a.height]
        const rx = +(a.rx ?? 0)
        out.push(
          rx
            ? `M${x + rx} ${y}h${w - 2 * rx}a${rx} ${rx} 0 0 1 ${rx} ${rx}v${h - 2 * rx}` +
                `a${rx} ${rx} 0 0 1 ${-rx} ${rx}h${-(w - 2 * rx)}a${rx} ${rx} 0 0 1 ${-rx} ${-rx}` +
                `v${-(h - 2 * rx)}a${rx} ${rx} 0 0 1 ${rx} ${-rx}z`
            : `M${x} ${y}h${w}v${h}h${-w}z`,
        )
        break
      }
      default: {
        const pts = a.points.trim().split(/[\s,]+/)
        let d = 'M'
        for (let i = 0; i < pts.length - 1; i += 2)
          d += `${i ? ' L' : ''}${pts[i]} ${pts[i + 1]}`
        out.push(m[1] === 'polygon' ? d + 'z' : d)
      }
    }
  }
  return out.filter(Boolean)
}

function readSvg(lib, name, wantFill) {
  const cfg = LIBS[lib]
  const base = libRoot(lib)
  if (wantFill && cfg.fill) {
    const p = resolve(base, cfg.fill, `${name}.svg`)
    if (existsSync(p)) return {svg: readFileSync(p, 'utf8'), isFill: true}
  }
  const p = resolve(base, cfg.outline, `${name}.svg`)
  if (!existsSync(p)) return null
  return {svg: readFileSync(p, 'utf8'), isFill: false}
}

const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

/**
 * The Iconists set encodes weight and optical size in the symbol name — Stroke1
 * vs Stroke2, Thick, Wide, Small, Large — while an open library ships one glyph
 * per concept. Without this, ~98 symbols would render identically to a sibling
 * (Hashtag_Filled the same as Hashtag, PlusSmall the same as PlusLarge).
 *
 * So the distinction is reproduced at render time instead of by glyph choice:
 * weight becomes stroke width, optical size becomes a viewBox inset.
 */
function variantOf(symbol) {
  let weight = 1
  let scale = 1
  if (/_Stroke1(_|$)/.test(symbol)) weight *= 0.75
  if (/Thick|Bold/.test(symbol)) weight *= 1.3 // Wide is letter-spacing, not weight
  // a synthesised fill has to read heavier than its outline sibling even when
  // the glyph encloses no area to fill (a hash, a list, a chevron)
  if (/[Ff]illed/.test(symbol)) weight *= 1.5
  if (/Tiny/.test(symbol)) scale *= 0.65
  else if (/Small/.test(symbol)) scale *= 0.8
  if (/Large/.test(symbol)) scale *= 1.2
  return {weight, scale}
}

/** Grow or shrink the viewBox around its centre so the glyph reads bigger/smaller. */
function scaleViewBox(vb, scale) {
  if (scale === 1) return vb
  const [x, y, w, h] = vb.split(/\s+/).map(Number)
  const nw = w / scale
  const nh = h / scale
  const r = n => Math.round(n * 1000) / 1000
  return `${r(x - (nw - w) / 2)} ${r(y - (nh - h) / 2)} ${r(nw)} ${r(nh)}`
}

/** Build the create*SVG call for one exported symbol. */
function emitSymbol(symbol, entry, lib) {
  const cfg = LIBS[lib]
  const cand = entry.candidates[lib]
  if (!cand?.name) return {err: `no ${lib} candidate`}

  const wantFill = entry.needsFill
  const {weight, scale} = variantOf(symbol)
  const vbOf = base => scaleViewBox(base, scale)
  const swOf = base => Math.round(base * weight * 100) / 100

  // A hand-edited override beats everything, including a library's own fill.
  if (wantFill) {
    const ov = resolve(HERE, 'fill-overrides', `${symbol}.svg`)
    if (existsSync(ov)) {
      const raw = readFileSync(ov, 'utf8')
      const ovPaths = extractPaths(raw)
      if (ovPaths.length) {
        const sw = raw.match(/stroke-width="([\d.]+)"/)
        const vb = raw.match(/viewBox="([^"]+)"/)?.[1] ?? cfg.viewBox
        const note = `// hand-edited fill — scripts/icons/fill-overrides/${symbol}.svg`
        // keep the stroke if the override still carries one, else emit a plain fill
        return sw
          ? {
              code:
                `${note}\nexport const ${symbol} = createFilledFromStrokeSVG({\n` +
                `  path: '${esc(ovPaths.join(' '))}',\n` +
                `  viewBox: '${vb}',\n  strokeWidth: ${sw[1]},\n})\n`,
              helper: 'createFilledFromStrokeSVG',
              override: true,
            }
          : {
              code:
                `${note}\nexport const ${symbol} = createMultiPathSVG({\n` +
                `  paths: [\n${ovPaths.map(p => `    '${esc(p)}',`).join('\n')}\n  ],\n` +
                `  viewBox: '${vb}',\n})\n`,
              helper: 'createMultiPathSVG',
              override: true,
            }
      }
    }
  }

  // Otherwise a native fill file wins; failing that, synthesise one (auto-B).
  const file = readSvg(lib, cand.name, wantFill)
  if (!file) return {err: `${lib}:${cand.name} not found on disk`}

  const paths = extractPaths(file.svg)
  if (!paths.length) return {err: `${lib}:${cand.name} produced no paths`}

  const provenance = `// ${lib}: ${cand.name}${file.isFill ? ' (fill weight)' : ''}`

  if (file.isFill || cfg.strokeWidth === 0) {
    // already a solid glyph
    return {
      code:
        `${provenance}\nexport const ${symbol} = createMultiPathSVG({\n` +
        `  paths: [\n${paths.map(p => `    '${esc(p)}',`).join('\n')}\n  ],\n` +
        `  viewBox: '${vbOf(cfg.viewBox)}',\n})\n`,
      helper: 'createMultiPathSVG',
      auto: false,
    }
  }

  if (wantFill) {
    // auto-B: merge subpaths into one path so nested shapes punch holes via evenodd
    const merged = paths.join(' ')
    return {
      code:
        `${provenance} — filled variant generated from the outline (auto-B)\n` +
        `export const ${symbol} = createFilledFromStrokeSVG({\n` +
        `  path: '${esc(merged)}',\n` +
        `  viewBox: '${vbOf(cfg.viewBox)}',\n` +
        `  strokeWidth: ${swOf(cfg.strokeWidth)},\n})\n`,
      helper: 'createFilledFromStrokeSVG',
      auto: true,
      review: entry.review,
    }
  }

  return {
    code:
      `${provenance}\nexport const ${symbol} = createStrokeSVG({\n` +
      `  paths: [\n${paths.map(p => `    '${esc(p)}',`).join('\n')}\n  ],\n` +
      `  viewBox: '${vbOf(cfg.viewBox)}',\n  strokeWidth: ${swOf(cfg.strokeWidth)},\n})\n`,
    helper: 'createStrokeSVG',
    auto: false,
  }
}

/**
 * --export-fills: write every synthesised fill out as a real .svg you can open
 * in Figma/Illustrator, edit, and save back. On the next run the edited file is
 * used verbatim instead of the generated one.
 */
if (args.includes('--export-fills')) {
  const dir = resolve(HERE, 'fill-overrides')
  mkdirSync(dir, {recursive: true})
  let n = 0
  for (const [symbol, entry] of Object.entries(map.symbols)) {
    if (stickerOnlySymbols.has(symbol)) continue
    if (!entry.needsFill) continue
    const lib = forceLib || picks[symbol]
    if (!lib || !LIBS[lib]) continue
    const cand = entry.candidates[lib]
    if (!cand?.name) continue
    const file = readSvg(lib, cand.name, true)
    if (!file) continue
    const cfg = LIBS[lib]
    const paths = extractPaths(file.svg)
    const out = existsSync(resolve(dir, `${symbol}.svg`))
    if (out) continue // never clobber a file you've already edited
    const body = file.isFill
      ? paths
          .map(
            d => `  <path d="${d}" fill="currentColor" fill-rule="evenodd"/>`,
          )
          .join('\n')
      : `  <path d="${paths.join(' ')}" fill="currentColor" fill-rule="evenodd"\n` +
        `        stroke="currentColor" stroke-width="${cfg.strokeWidth}"\n` +
        `        stroke-linecap="round" stroke-linejoin="round"/>`
    writeFileSync(
      resolve(dir, `${symbol}.svg`),
      `<!-- ${symbol} · ${lib}:${cand.name} · ${file.isFill ? 'native fill' : 'auto-B, edit me'} -->\n` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${cfg.viewBox}" fill="none">\n${body}\n</svg>\n`,
    )
    n++
  }
  console.log(`exported ${n} editable fill(s) to scripts/icons/fill-overrides/`)
  process.exit(0)
}

// ---- run ----------------------------------------------------------------
const byModule = new Map()
const errors = []
const stats = {
  written: 0,
  symbols: 0,
  auto: 0,
  review: 0,
  override: 0,
  byLib: {},
}

for (const [symbol, entry] of Object.entries(map.symbols)) {
  if (stickerOnlySymbols.has(symbol)) continue
  const lib = forceLib || picks[symbol]
  if (!lib) {
    errors.push(`${symbol}: no pick`)
    continue
  }
  if (!LIBS[lib]) {
    errors.push(`${symbol}: unknown library "${lib}"`)
    continue
  }
  const res = emitSymbol(symbol, entry, lib)
  if (res.err) {
    errors.push(`${symbol}: ${res.err}`)
    continue
  }
  if (!byModule.has(entry.module))
    byModule.set(entry.module, {helpers: new Set(), parts: []})
  const mod = byModule.get(entry.module)
  mod.helpers.add(res.helper)
  mod.parts.push(res.code)
  stats.symbols++
  stats.byLib[lib] = (stats.byLib[lib] || 0) + 1
  if (res.auto) stats.auto++
  if (res.review) stats.review++
  if (res.override) stats.override++
}

if (!existsSync(ICONS_DIR)) mkdirSync(ICONS_DIR, {recursive: true})
for (const [module, {helpers, parts}] of byModule) {
  const body =
    `import {${[...helpers].sort().join(', ')}} from './TEMPLATE'\n\n` +
    parts.join('\n')
  if (!dryRun) writeFileSync(resolve(ICONS_DIR, `${module}.tsx`), body)
  stats.written++
}

console.log(
  `${dryRun ? '[dry run] ' : ''}${stats.symbols} symbols -> ${stats.written} modules\n` +
    `  by library : ${
      Object.entries(stats.byLib)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ') || '—'
    }\n` +
    `  auto-fills : ${stats.auto}${stats.review ? ` (${stats.review} flagged for review)` : ''}` +
    `${stats.override ? `\n  hand-edited: ${stats.override}` : ''}`,
)
if (errors.length) {
  console.error(`\n${errors.length} problem(s):`)
  for (const e of errors.slice(0, 30)) console.error('  ' + e)
  if (errors.length > 30) console.error(`  …and ${errors.length - 30} more`)
  process.exitCode = 1
}
