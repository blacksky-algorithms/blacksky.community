# Icon licence guard

The icons in `src/components/icons/*.tsx` were replaced with paths from
openly-licensed libraries after upstream's `ASSETS.md` documented that the
Iconists set was not covered by the MIT licence.

## Files

| File | What it is |
|---|---|
| `avatar-stickers.json` | Symbols generated separately as OpenMoji avatar artwork rather than UI icons. |
| `sticker-picks.json` | OpenMoji source codepoints and stroke-width overrides for the avatar artwork. |
| `generate-stickers.mjs` | Generates the avatar-only OpenMoji module. |
| `check-icon-licenses.mjs` | Rejects top-level Iconists source SVGs and known Iconists path data outside the temporary legacy allowlist. |

## Run

```
node scripts/icons/generate-stickers.mjs  # avatar-only OpenMoji artwork
pnpm icons:check                          # licence regression guard
```

## Licensing

All four libraries are permissive — Phosphor, Tabler and Iconoir are MIT, Lucide
is ISC — and all permit copying the path data into source, modifying it, and
shipping it in a public repository and a commercial app. The single condition is
that the copyright and permission notices travel with the distribution, so
whichever libraries you use must be listed in `NOTICE.md`.

Lucide carries a second notice: roughly 110 of its icons derive from Feather and
are MIT © Cole Bemis. If you use Lucide, carry both.

`StarterPack` uses Tabler's `stack-2`, `VerifiedCheck` uses Tabler's filled
`circle-check`, and `VerifierCheck` uses Phosphor's filled `seal-check`.
`Newskie` remains unchanged pending a separate artwork/provenance review.
