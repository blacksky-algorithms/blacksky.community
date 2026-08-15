# Replacing the icon set — options

Companion to [`asset-license-audit.md`](./asset-license-audit.md) §2. That document establishes
*what* has to change; this one covers *how*, and how much Blacksky character we can actually get
out of it.

## What the system will and won't accept

Before comparing icon sets, these are the constraints the current renderer imposes
(`src/components/icons/TEMPLATE.tsx`, `common.tsx`):

| Constraint | Detail |
|---|---|
| **Monochrome** | One `fill` per icon, from `t.palette.primary_500` or the `style.color`. Every path in an icon shares it. |
| **Single compound path** | `createSinglePathSVG` is used by ~all icons. `createMultiPathSVG` exists but is used by 3 files, and its paths still share one fill. |
| **Filled, not stroked** | Default `strokeWidth = 0`. The `stroke2` in the filenames means strokes were *outline-expanded into fills* at authoring time. Only 8 of 159 files pass a real `strokeWidth`. |
| **24×24 viewBox**, `fillRule="evenodd"` | Overridable per icon, but universal in practice. |
| **Gradient escape hatch** | A `gradient` prop maps to `tokens.gradients` and swaps the fill for a 45° `<LinearGradient>`. Already in use (`TrendingTopics`, `StarterPackCard`, `ProfileSubpageHeader`, notifications). |

**The consequence for theming:** two-tone icons, per-icon neon glow, and chromatic-aberration
effects are not expressible without changing `TEMPLATE.tsx`. Gradients *are*, and that hook is
already wired up.

## Actual scope

Smaller than the raw file count suggests:

- **269** exported icon symbols (225 `Stroke2`, 35 `Filled`, rest one-offs)
- **209** distinct concepts once variant suffixes are stripped
- **221** symbols referenced outside `src/components/icons/`
- **48** unreferenced — delete rather than redraw

So the real job is **~209 concepts / ~221 live symbols**, and step one is deleting the 48 dead ones.

---

## The honest answer on "can an icon set be space/cyberpunk"

Mostly no, and mostly it shouldn't try. `chevron-left`, `search`, and `settings` have to parse at
16px in a fraction of a second. Thematic styling on those makes them slower to read, and heavily
styled UI icons age badly — they date a product faster than almost anything else.

But that does *not* mean the set has to be characterless. Theme lives in three layers, in
ascending order of how much personality each can carry at no legibility cost:

### Layer 1 — systemic geometry (pervasive, subtle, free)

Corner radius, terminal style, stroke weight, grid. A set with **sharp corners and cut (butt/square)
terminals** reads technical, precise, HUD-like. A set with round caps and soft corners reads
friendly and consumer. Bluesky's set is deliberately the friendly one — `corner0_rounded`.

This is where most of the "space station instrument panel" feeling actually comes from, and no
individual icon looks themed. **This is the highest-leverage decision on the list.**

### Layer 2 — the hero icons (~15–20 files, unlimited personality)

Identity marks don't need to parse in 100ms and are seen large:

```
logo / logomark / logotype     verified + verifier checks
starter pack mark              "newskie" equivalent (new-account badge)
moderation + labeler marks     achievement / badge art
empty-state and error glyphs   feed / community identity marks
```

Go as far as you want here. Orbital rings, scanlines, glyphic sci-fi — this is the right place for
it, and it's also where the Bluesky trademarks currently still sit (audit §3), so this work is
required regardless.

### Layer 3 — the theme layer, not the icon layer

This is the cheapest big win and it's already half-built. Adding Blacksky gradients to
`src/alf/tokens.ts`:

```ts
nebula:  { values: [[0, '#2A1B5E'], [0.5, '#7B3FE4'], [1, '#00E0FF']], hover_value: '#7B3FE4' },
neon:    { values: [[0, '#FF2E97'], [1, '#00E0FF']],                   hover_value: '#FF2E97' },
```

…themes any icon that opts in, across all 221, without touching a single path. `gradients.primary`
is already purple (`#6060E9`) rather than Bluesky's blue, so this direction is started. Glow belongs
on the container (shadow / blur), not in the icon geometry.

**Recommendation: buy the vibe at layers 1 and 3, spend the design budget on layer 2, and keep the
workhorse 200 clean and legible.**

---

## Option A — License the Iconists set

Buy a commercial license for Central directly from [iconists.co](https://iconists.co).

- **Effort:** zero. Not one file changes.
- **Cost:** commercial quote — worth getting the number even if we don't take this route, since it
  prices the alternatives.
- **Downside:** the app keeps looking exactly like Bluesky. Given the goal is differentiation, this
  is the do-nothing baseline, not a real contender. Its value is as a **fallback if a deadline
  forces it** — it de-risks the legal problem instantly and can be swapped out later.

## Option B — Swap wholesale to an open set

Mechanical, scriptable, free, legally clean. Candidates, judged against the constraints above:

| Set | License | Count | Grid | Fits `createSinglePathSVG`? | Character |
|---|---|---|---|---|---|
| **Lucide** | ISC | ~1,600 | 24×24, 2px | No — stroke-based, multi-element | Neutral, precise, technical |
| **Tabler** | MIT | ~5,900 | 24×24, 2px | No — stroke-based, but has outline **and** filled | Precise, technical, huge coverage |
| **Phosphor** | MIT | ~1,500 × 6 weights | 256 grid | Partly — has a true Fill weight | Warm, rounded, friendly |
| **Remix Icon** | Apache-2.0 | ~3,000 | 24×24 | **Yes** — authored as filled compound paths | Neutral, slightly corporate |
| **Heroicons** | MIT | ~300 | 24×24, outline + solid | Partly | Clean, but **coverage risk at 209 concepts** |

The tension: the best *mechanical* fit (Remix, drops straight into the existing renderer) is not the
best *aesthetic* fit for space/cyberpunk (Lucide or Tabler).

**Don't let the mechanics pick the aesthetic.** Stroke-based sets need a `createStrokeSVG` renderer,
which is roughly 30 lines next to the two that already exist — and it is *better* than
outline-expanding to fills:

- paths stay small (a stroked circle is `<circle>`, not a 400-character outlined donut)
- they stay crisp at 16px instead of accumulating conversion artifacts
- they stay editable by a designer later
- **and stroke width, linecap, and linejoin become global theme parameters**

That last point is the payoff. Flipping every icon from `strokeLinecap="round"` to `"square"` is a
one-line change that swings the entire set from friendly to technical — Layer 1 personality, applied
across 221 icons, tunable in an afternoon. Outline-expanding to fills throws that lever away
permanently.

**If going this route: Tabler.** It's stroke-based on the same 24×24 / 2px grid the codebase already
assumes, it's the most technical-looking of the candidates, and — critically — it ships **filled
variants**, which the current set needs for its 35 `Filled` symbols (active tabs, liked states).
Lucide is the close second aesthetically but is thin on filled variants, which would mean
hand-drawing 35 solids.

## Option C — Open base + custom hero icons + gradient layer *(recommended)*

Layer the three tiers explicitly:

1. **Tabler** (or Lucide) for the ~190 workhorse glyphs, tuned once at the renderer level for
   Blacksky's weight and terminal style
2. **Custom** for the ~15–20 hero icons — commissioned or in-house, as thematic as you like
3. **Blacksky gradients** in `tokens.ts`, opted into on hero surfaces

Gets genuine identity for a fraction of a full commission, and the required §3 trademark work is
folded into step 2 rather than being separate. The pipeline is identical to Option D's, so
categories can be migrated from open to custom incrementally, forever, without another decision.

## Option D — Fully custom 209-concept set

Commission an icon designer for the whole system.

- **Best differentiation**, and the only route where Layer 1 is designed rather than inherited.
- **Slowest and most expensive** — a coherent 200-icon system is months, not weeks, and it's a
  specialist skill distinct from illustration.
- Probably premature now. **Option C is a strict prefix of it:** build the pipeline, ship on an
  open set, and replace categories with custom work as budget appears. Nothing is wasted.

---

## Tooling to build first, regardless of choice

There is **no SVG → TSX generator** in `scripts/`. `pnpm icons:optimize` only runs svgo over
`assets/icons/`. Every one of the 159 components was hand-committed. Before touching 200+ icons,
write `scripts/generate-icons.mjs`:

- read `assets/icons/*.svg` → emit `src/components/icons/*.tsx`
- group variants by concept, following the existing `Name_Stroke2_Corner0_Rounded` convention
- pick `createSinglePathSVG` / `createMultiPathSVG` / a new `createStrokeSVG` per source
- **fail the build on drift**, so the SVGs and the components can't silently diverge again — which
  is the root cause of the current situation being 400 files instead of 256

Pair it with a `/icons` gallery route or a Storybook page to eyeball all 209 at 16/20/24px in light,
dim, and dark before merging. A set that looks great at 32px can fall apart at 16px.

## Suggested sequence

1. Delete the 48 unreferenced icons — free, shrinks the job by ~18%.
2. Write the generator + drift check.
3. Get an Iconists quote (prices the alternatives; keeps Option A alive as a deadline fallback).
4. Prototype Option C on **~20 icons across the busiest surfaces** — tab bar, post actions,
   composer — in Tabler and Lucide. Look at both at 16px in all three themes before committing.
5. Add Blacksky gradients to `tokens.ts` — cheap, independent of everything above, ships on its own.
6. Commission the hero icons; this covers the §3 trademark replacements too.
7. Bulk-convert the remaining workhorses.
