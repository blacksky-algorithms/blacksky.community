#!/usr/bin/env node
import {createHash} from 'node:crypto'
import {readdirSync, readFileSync, statSync} from 'node:fs'
import {dirname, relative, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const forbidden = new Set(
  JSON.parse(readFileSync(resolve(here, 'iconists-path-hashes.json'), 'utf8')),
)
const allowlist = JSON.parse(
  readFileSync(resolve(here, 'iconists-legacy-allowlist.json'), 'utf8'),
)
const failures = []
let legacyMatches = 0

const normalize = value => value.replace(/\s+/g, ' ').trim()
const hash = value =>
  createHash('sha256').update(normalize(value)).digest('hex')

function filesUnder(path) {
  const files = []
  for (const entry of readdirSync(path)) {
    const target = resolve(path, entry)
    if (statSync(target).isDirectory()) files.push(...filesUnder(target))
    else files.push(target)
  }
  return files
}

const sourceIcons = readdirSync(resolve(root, 'assets/icons')).filter(name =>
  name.endsWith('.svg'),
)
if (sourceIcons.length)
  failures.push(
    `assets/icons contains ${sourceIcons.length} prohibited top-level SVG file(s)`,
  )

const files = [
  ...filesUnder(resolve(root, 'src')),
  ...filesUnder(resolve(root, 'bskyembed/assets')),
].filter(file => /\.(tsx?|jsx?|svg)$/.test(file))

for (const file of files) {
  const name = relative(root, file)
  const source = readFileSync(file, 'utf8')
  const paths = [
    ...new Set(
      [
        ...source.matchAll(/(['"])([Mm][^'"]{10,})\1/g),
        ...source.matchAll(/\bd="([^"]+)"/g),
      ].map(match => match[2] ?? match[1]),
    ),
  ]
  for (const path of paths) {
    const digest = hash(path)
    if (!forbidden.has(digest)) continue
    if (allowlist[digest]?.includes(name)) legacyMatches++
    else
      failures.push(
        `${name} contains prohibited Iconists path ${digest.slice(0, 12)}`,
      )
  }
}

if (failures.length) {
  for (const failure of failures) console.error(failure)
  process.exit(1)
}

console.log(
  `icon licence guard passed (${legacyMatches} allowlisted legacy path(s) remain)`,
)
