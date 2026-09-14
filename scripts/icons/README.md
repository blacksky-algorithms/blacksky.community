# Icon generation

Regenerates `src/components/icons/*.tsx` from an openly-licensed icon library,
replacing the Iconists set that upstream's `ASSETS.md` documents as not covered
by the MIT licence.

## Files

| File | What it is |
|---|---|
| `icon-map.json` | 215 symbols → module, concept, per-library candidate name, whether a filled weight is needed. Generated once; edit by hand to correct a bad match. |
| `icon-picks.json` | symbol → library. Exported from `icon-picker.html`. Not required if you pass `--all`. |
| `avatar-stickers.json` | Symbols generated separately as OpenMoji avatar artwork rather than UI icons. |
| `sticker-picks.json` | OpenMoji source codepoints and stroke-width overrides for the avatar artwork. |
| `generate-icons.mjs` | Reads both, writes the `.tsx` modules. |
| `generate-stickers.mjs` | Generates the avatar-only OpenMoji module. |
| `check-icon-licenses.mjs` | Rejects top-level Iconists source SVGs and known Iconists path data outside the temporary legacy allowlist. |

## Install the libraries

```
pnpm install --frozen-lockfile
```

## Run

```
node scripts/icons/generate-icons.mjs --all tabler --dry-run   # report only
node scripts/icons/generate-icons.mjs --all tabler             # one library everywhere
node scripts/icons/generate-icons.mjs                          # apply icon-picks.json
node scripts/icons/generate-stickers.mjs                       # avatar-only OpenMoji artwork
pnpm icons:check                                                # licence regression guard
```

Drop the file exported by the picker at `scripts/icons/icon-picks.json` to use
per-icon choices. Mixing libraries is fine — each one you use adds its notice to
`NOTICE.md`, nothing more.

## Filled variants

25 symbols need a filled weight. Coverage differs by library:

| Library | Native fills | Synthesised |
|---|---|---|
| Phosphor | 25 | 0 |
| Tabler | 20 | 5 |
| Iconoir | 13 | 12 |
| Lucide | 0 | 25 |

Where a library ships no fill, the generator synthesises one: every subpath is
merged into a single path so nested shapes punch holes under `fill-rule=evenodd`,
and the stroke is kept so the silhouette matches its outline sibling's weight.
These emit `createFilledFromStrokeSVG` and carry an `auto-B` provenance comment.

Four concepts — `badge-cc`, `robot`, `shape-2`, `hash` — do not synthesise
cleanly and want a hand-drawn fill. The generator reports them as "flagged for
review" rather than failing.

**Review the synthesised fills once and commit the result.** `evenodd` only
punches a hole where subpaths are properly nested; overlapping subpaths would
produce an unintended hole. This is why generation is a one-time step with a
human pass, not a runtime transform.

## Licensing

All four libraries are permissive — Phosphor, Tabler and Iconoir are MIT, Lucide
is ISC — and all permit copying the path data into source, modifying it, and
shipping it in a public repository and a commercial app. The single condition is
that the copyright and permission notices travel with the distribution, so
whichever libraries you use must be listed in `NOTICE.md`.

Lucide carries a second notice: roughly 110 of its icons derive from Feather and
are MIT © Cole Bemis. If you use Lucide, carry both.

`StarterPack` uses Tabler's `stack-2`, `VerifiedCheck` uses Tabler's filled
`circle-check`, and `VerifierCheck` uses Phosphor's filled `seal-check`. These
components are maintained separately from the generated UI inventory.
`Newskie` remains unchanged pending a separate artwork/provenance review.
