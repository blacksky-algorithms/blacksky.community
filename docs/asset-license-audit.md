# Asset license audit — what still needs replacing

Upstream (`bluesky-social/social-app`) added asset licensing notices on 2026-08-12:

- [`ASSETS.md`](https://github.com/bluesky-social/social-app/blob/main/ASSETS.md) — which files the MIT
  license does **not** cover (PR #11397, "Add asset licensing notices")
- [`NOTICE.md`](https://github.com/bluesky-social/social-app/blob/main/NOTICE.md) — consolidated
  third-party attribution notices
- `licenses/APACHE-2.0.txt`, plus per-directory `README.md` files under `assets/`
- PR #11453 moved the commissioned landing illustrations out of `assets/splash/` into a dedicated
  `assets/illustrations/` directory

The MIT `LICENSE` text itself did not change. What changed is that upstream now documents that a
large part of the asset tree was never covered by it.

This document audits `blacksky.community` against that list. Every "still Bluesky's" call below is a
**git blob hash comparison** against `upstream/main`, so it reflects actual file content, not naming.

> Note on the six icons that show as "modified" in a naive diff (`bookmarkFilled.svg`,
> `envelope_open_stroke2_corner0_rounded.svg`, `image_stroke1_corner0_rounded.svg`,
> `qrCode_stroke2_corner0_rounded.svg`, `reply.svg`, `replyFiled.svg`) and the three brand SVGs
> (`newskie.svg`, `verifiedCheck.svg`, `verifierCheck.svg`): the only difference is hex-color casing
> (`#006AFF` vs `#006aff`) from a different svgo config. The artwork is byte-equivalent. They count as
> unreplaced.

---

## Summary

| # | Item | Files | Status |
|---|---|---|---|
| 1 | Commissioned landing illustrations (Owen D. Pomery) | 2 | **Must replace** |
| 2 | Iconists "Central" UI icon set — SVG sources | 256 | **Must relicense or replace** |
| 2b | Iconists path data baked into React components | 145 | **Must replace with #2** |
| 2c | Iconists glyphs in `bskyembed/assets/` | 6 | **Must relicense or replace** |
| 3 | Bluesky trademarks / brand marks still shipping | 8 | **Must replace** |
| 4 | Product imagery (`assets/images/`) | 32 | **Must replace or drop** |
| 5 | Third-party marks (Apple, Google, community) | 7 | Review nominative use |
| 6 | Redistributable third-party assets | — | **Missing license notices** |
| ✅ | Already replaced by this fork | 43 | No action |

**Total needing action: roughly 450 files**, but they collapse into six decisions, not 450.

---

## 1. Commissioned landing illustrations — the splash page

**Byte-identical to Bluesky's. This is the highest-risk item in the repo.**

```
assets/splash/illustration-mobile.png
assets/splash/illustration-mobile-dark.png
```

Consumed by `src/view/com/auth/SplashScreen.tsx:15,17`.

Commissioned by Bluesky Social PBC from illustrator **Owen D. Pomery** via Brilliant Artists Ltd.
Copyright stays with the artist; Bluesky's license is exclusive to Bluesky's own products, is not
sublicensable, and does not permit distributing modified versions. ASSETS.md explicitly asks forks
not to contact the artist or agent — the answer is constrained by Bluesky's agreement, not the
artist's willingness.

Note that upstream has since moved these to `assets/illustrations/`. We are still on the older
`assets/splash/` layout, so a future upstream sync will need the path change too.

**Action:** commission or source replacement light/dark landing art, drop into the same two paths.

---

## 2. The icon system — this is the big one

`assets/icons/` (top level) is the **Central icon system by Iconists (David & Storm GbR)**. Bluesky
licenses it for Bluesky's own products; that license grants us nothing. This is not "these icons are
forbidden" — it is "any right to use them has to come from Iconists, not from the MIT license we
inherited." Licenses are sold directly at [iconists.co](https://iconists.co).

### 2a. SVG sources — 256 files

`assets/icons/` holds 265 top-level SVGs. Excluding the nine carve-outs ASSETS.md names separately,
**256 are the Iconists set, unmodified.** Full list in [Appendix A](#appendix-a--iconists-svg-sources-256).

Three top-level SVGs are fork-original and not in upstream at all — these look safe, but confirm
their provenance before assuming so:

```
assets/icons/gifSquare_stroke2_corner0_rounded.svg
assets/icons/image_stroke2_corner0_rounded.svg
assets/icons/starter_pack_icon.svg
```

### 2b. The non-obvious part: the path data is duplicated into TypeScript

Replacing the SVGs alone does **not** clear this. The build does not consume `assets/icons/*.svg` at
runtime — the glyph path strings were extracted into hand-committed React components:

```tsx
// src/components/icons/Bell.tsx
import {createSinglePathSVG} from './TEMPLATE'

export const Bell_Stroke2_Corner0_Rounded = createSinglePathSVG({
  path: 'M4.216 8.815a7.853 7.853 0 0 1 15.568 0l1.207 9.053A1 1 0 0 1 20 19h-3.354…',
})
```

`src/components/icons/` has 159 files. **145 carry Iconists path data verbatim**, identical to
upstream. Full list in [Appendix B](#appendix-b--iconists-derived-components-145).

Four differ from upstream only partially — the fork added or swapped a variant, but the remaining
exported paths in each file are still Iconists and still need replacing:

```
src/components/icons/Gif.tsx
src/components/icons/Image.tsx
src/components/icons/Repost.tsx
src/components/icons/StarterPack.tsx
```

One is fully fork-original: `src/components/icons/PeerModerator.tsx`.

**Action:** whichever way this resolves — buy an Iconists license or swap to an openly licensed set
(Lucide, Phosphor, Tabler) — the work is *one* mechanical pass: replace the 256 SVGs, then
regenerate all 145+4 components from them. `pnpm icons:optimize` (svgo) runs over
`assets/icons/`, but there is no SVG → TSX generator in `scripts/`; that pass is currently manual and
would be worth scripting before doing 256 of them by hand.

### 2c. Iconists glyphs copied into bskyembed

Six of the same glyphs live separately under `bskyembed/assets/` and are byte-identical to Bluesky's:

```
bskyembed/assets/arrowBottom_stroke2_corner0_rounded.svg
bskyembed/assets/circleInfo_stroke2_corner0_rounded.svg
bskyembed/assets/heart2_filled_stroke2_corner0_rounded.svg
bskyembed/assets/play_filled_corner0_rounded.svg
bskyembed/assets/play_filled_corner2_rounded.svg
bskyembed/assets/repost_stroke2_corner2_rounded.svg
```

(`bubble_filled_stroke2_corner2_rounded.svg` and `starterPack.svg` here have already been changed by
the fork.)

---

## 3. Bluesky trademarks still shipping

Most branding is already replaced (see the ✅ section). These are the ones still carrying Bluesky's
marks byte-for-byte:

| File | Notes |
|---|---|
| `src/view/icons/LogomarkWithType.tsx` | **Live.** Butterfly mark + "Bluesky" logotype as inline SVG paths. Rendered by `src/screens/Messages/JoinRequest.tsx:242`. |
| `bskyembed/assets/logo_full_name.svg` | **Live.** Bluesky logotype in the embed widget — `bskyembed/src/components/post.tsx:9`. |
| `assets/icons/newskie.svg` | Bluesky "newskie" sun badge. |
| `src/components/icons/Newskie.tsx` | Same artwork, inline. |
| `assets/icons/verifiedCheck.svg` | Bluesky verification check. |
| `assets/icons/verifierCheck.svg` | Bluesky verifier scalloped check. |
| `src/components/icons/VerifiedCheck.tsx`, `VerifierCheck.tsx`, `Verified.tsx` | Same artwork, inline. |
| `assets/icons/starterPack.svg` | Bluesky starter-pack mark. |

`LogomarkWithType.tsx` and `bskyembed/assets/logo_full_name.svg` are the urgent two — both render the
word "Bluesky" in Bluesky's own logotype inside shipping UI. `src/view/icons/Logo.tsx`,
`Logomark.tsx`, and `Logotype.tsx` were already converted to the `useBrand()` system;
`LogomarkWithType.tsx` was missed.

The verification checks are a product decision as much as a licensing one: if the fork surfaces
Bluesky-issued verification, the mark arguably identifies whose verification it is. Worth a
deliberate call rather than a default.

---

## 4. Product imagery — `assets/images/`

ASSETS.md draws the line at the whole directory: *"Treat everything in this directory as outside the
MIT license and not licensed for your use."* Some is commissioned; upstream chose not to make forks
guess file by file.

**32 of 36 files are byte-identical to Bluesky's**, including live-rendered ones:

```
activity_notifications_announcement.webp   invite_friends_announcement_nux.webp
chat-desktop-bg-{dark,dim,light}.webp      invite_friends_promo_banner.webp
chat-mobile-bg-{dark,dim,light}.webp       live_now_beta.webp
chat-invite-friends.webp                   welcome-modal-bg.jpg
drafts_announcement_nux.webp               initial_verification_announcement_{1,2}.png
find_friends_illustration.webp             groupchats_announcement_{dark,dim,light}.webp
find_friends_illustration_small.webp
onboarding/value_prop_1_{dark,dim,light}{,_borderless}.webp
onboarding/value_prop_2_{dark,dim,light}.webp
onboarding/value_prop_3_{dark,dim,light}.webp
```

Fork-original and fine: `bookmarks_announcement_nux.png`, `germ_logo.webp`,
`giphy_attribution_{dark,light}.png`.

**Action:** the announcement NUX images are mostly for Bluesky features and Bluesky launch moments —
many can simply be deleted along with the announcement that shows them. The chat backgrounds and
onboarding value-prop art need real replacements.

---

## 5. Third-party marks — review, don't necessarily replace

Not Bluesky's to grant or withhold. Our use rests on our own nominative-use basis or on permission
from each mark owner.

```
assets/icons/apple_logo.svg      → Apple Inc.      (src/components/icons/AppleLogo.tsx)
assets/icons/android_logo.svg    → Google LLC      (src/components/icons/AndroidLogo.tsx)
assets/icons/community/leaflet.svg
assets/icons/community/offprint.svg
assets/icons/community/pckt.svg, pckt-full.svg
assets/icons/community/standard-site.svg
```

The community marks are live via `src/components/Post/Embed/StandardSiteEmbed/publishers.ts`.
`assets/images/germ_logo.webp` (Germ Network, used by `src/screens/Profile/components/GermButton.tsx`)
is in the same category.

Apple's and Google's marks carry their own brand guidelines on size, spacing, and permitted context —
if we ship a sign-in button or store badge, we follow theirs.

**Action:** no file changes needed, but confirm each is nominative identification of the service it
links to.

---

## 6. Notices we are obligated to carry — currently missing

These assets *are* redistributable, but only if their license text travels with them. We are shipping
the files without the notices:

| Asset | Path in this repo | Missing |
|---|---|---|
| Inter typeface | `assets/fonts/inter/` (40 files) | **`OFL.txt` — not present.** Required by SIL OFL 1.1. |
| Inter (OG card service) | `bskyogcard/src/assets/fonts/` | **`README.md` with the OFL notice — not present.** |
| Material Icons | `bskyweb/static/media/MaterialIcons.f20305dee9d396fea5c7.ttf` | **Apache-2.0 notice — not present.** Emitted by `@expo/vector-icons` via Expo. |
| country-flag-icons | `assets/icons/flags/` (264 files) | ✅ `README.md` present, MIT © @catamphetamine. |

We also ship two fonts upstream does not, which need their own notices:

- `assets/fonts/rubik/` (17 files) — Rubik, SIL OFL 1.1
- `assets/fonts/azeret_mono/` (21 files) — Azeret Mono, SIL OFL 1.1

**Watch on Inter and any OFL font:** OFL 1.1 carries a Reserved Font Name provision. A modified or
subsetted build cannot be distributed under the name "Inter" (or "Rubik", or "Azeret Mono").

**Action:** add `assets/fonts/inter/OFL.txt`, `assets/fonts/rubik/OFL.txt`,
`assets/fonts/azeret_mono/OFL.txt`, `bskyogcard/src/assets/fonts/README.md`, `licenses/APACHE-2.0.txt`,
and a root `NOTICE.md`. This is the cheapest item on the list and the only one where we are currently
out of compliance with a license we *do* hold.

---

## ✅ Already handled — no action

The fork has already replaced these (verified: content differs from upstream, or is fork-original):

- **App icons** — all of `assets/app-icons/`, including the `.icon` bundles and the fork's own
  `android_base.svg` / `ios_base.svg`
- **Splash screens** — `assets/splash/splash.png`, `splash-dark.png`, `android-splash-logo-white.png`,
  `splash-android-icon.png`, `splash-android-icon-dark.png`
- **Favicons and web branding** — `assets/favicon.png`, `bskyweb/static/favicon*.png`,
  `apple-touch-icon.png`, `safari-pinned-tab.svg`, `social-card-default*.png`
- **Logos** — `assets/logo.png`, `assets/default-avatar.png`, `bskyembed/assets/logo.svg`,
  `src/view/icons/Logo.tsx`, `Logomark.tsx`, `Logotype.tsx` (all on the `useBrand()` system)
- **Android launcher assets** — `icon-android-foreground/monochrome/notification.png`
- **App Clip** — `modules/BlackskyClip/` (renamed from `BlueskyClip`, own `AppIcon.appiconset`),
  plus `BlackskyNSE/` and `Share-with-Blacksky/`
- **Not present at all** — `assets/kawaii.png`, `assets/kawaii_smol.png`,
  `assets/icons/custom_logo_japan.svg`, `assets/icons/logomark.svg` (ASSETS.md §4 community artwork)

---

## Recommended order

1. **Add the missing license notices** (§6). Hours of work, removes an actual compliance gap.
2. **Replace `LogomarkWithType.tsx` and `bskyembed/assets/logo_full_name.svg`** (§3). Two files,
   both rendering the Bluesky wordmark in shipping UI.
3. **Replace the landing illustrations** (§1). Needs lead time — commission early.
4. **Decide the icon question** (§2). Buy an Iconists license, or pick an openly licensed set. Then
   one scripted pass over 256 SVGs + 149 components + 6 bskyembed glyphs.
5. **Triage `assets/images/`** (§4). Delete what belongs to Bluesky-only announcements; replace the
   chat backgrounds and onboarding art.
6. **Confirm nominative use** of the third-party marks (§5). No file changes expected.
7. **Remaining Bluesky marks** (§3) — newskie, starter pack, verification checks — alongside the
   product decisions they attach to.

Finally: upstream's ASSETS.md invites forks to open an issue when something looks like it should be
listed and isn't. If the Iconists position needs clarifying for our case, asking is cheaper than
guessing.

---

## Appendix A — Iconists SVG sources (256)

`assets/icons/` top level, excluding the ASSETS.md carve-outs and the three fork-original files.

```
accessibility_stroke2_corner2_rounded.svg
alien_stroke2_corner0_rounded.svg
apple_stroke2_corner0_rounded.svg
arrowBottom_stroke2_corner0_rounded.svg
arrowBoxLeft_stroke2_corner0_rounded.svg
arrowBoxLeft_stroke2_corner2_rounded.svg
arrowBoxRight_stroke2_corner3_rounded.svg
arrowCornerDownRight_stroke2_corner2_rounded.svg
arrowCornerDownRight_stroke2_corner3_rounded.svg
arrowLeft_stroke2_corner0_rounded.svg
arrowOutOfBoxModified_stroke2_corner2_rounded.svg
arrowOutOfBox_stroke2_corner0_rounded.svg
arrowRight_stroke2_corner0_rounded.svg
arrowRotateClockwise_stroke2_corner0_rounded.svg
arrowRotateCounterClockwise_stroke2_corner0_rounded.svg
arrowShareRight_stroke2_corner2_rounded.svg
arrowTopCircle_stroke2_corner0_rounded.svg
arrowTopRight_stoke2_corner0_rounded.svg
arrowTop_stroke2_corner0_rounded.svg
arrowTriangleBottom_stroke2_corner1_rounded.svg
arrowsDiagonalIn_stroke2_corner0_rounded.svg
arrowsDiagonalIn_stroke2_corner2_rounded.svg
arrowsDiagonalOut_stroke2_corner0_rounded.svg
arrowsDiagonalOut_stroke2_corner2_rounded.svg
aspectRatio11_stroke2_corner0_rounded.svg
aspectRatio34_stroke2_corner0_rounded.svg
aspectRatio43_stroke2_corner0_rounded.svg
at_stroke2_corner0_rounded.svg
at_stroke2_corner2_rounded.svg
atom_stroke2_corner0_rounded.svg
bars3_stroke2_corner0_rounded.svg
beaker_stroke2_corner2_rounded.svg
bell2_filled_corner0_rounded.svg
bell2_stroke2_corner0_rounded.svg
bellOff_filled_corner0_rounded.svg
bellOff_stroke2_corner0_rounded.svg
bellPlus_stroke2_corner0_rounded.svg
bellRinging_filled_corner0_rounded.svg
bellRinging_stroke2_corner0_rounded.svg
bell_filled_corner0_rounded.svg
bell_stroke2_corner0_rounded.svg
birthdayCake_stroke2_corner2_rounded.svg
bookmark.svg
bookmarkDeleteLarge.svg
bookmarkFilled.svg
bot_filled.svg
bot_stroke.svg
broomSparkle_stroke2_corner2_rounded.svg
bubbleInfo_stroke2_corner2_rounded.svg
bubbleQuestion_stroke2_corner0_rounded.svg
bubbleSmile_stroke2_corner0_rounded_large.svg
bubble_filled_stroke2_corner2_rounded.svg
bubble_stroke2_corner2_rounded.svg
bubble_stroke2_corner3_rounded.svg
bubbles_stroke2_corner2_rounded.svg
bulletList_filled_corner0_rounded.svg
bulletList_stroke2_corner0_rounded.svg
bulletlist_stroke1_corner0_rounded.svg
calendarClock_stroke2_corner0_rounded.svg
calendarDays_stroke2_corner0_rounded.svg
calendar_stroke2_corner0_rounded.svg
camera_filled_stroke2_corner0_rounded.svg
camera_stroke2_corner0_rounded.svg
car_stroke2_corner2_rounded.svg
cc_filled_stroke2_corner0_rounded.svg
cc_stroke2_corner0_rounded.svg
celebrate_stroke2_corner0_rounded.svg
chainLinkBroken_stroke2_corner0_rounded.svg
chainLink_stroke2_corner0_rounded.svg
checkThick_stroke2_corner0_rounded.svg
check_stroke2_corner0_rounded.svg
chevronBottom_stroke2_corner0_rounded.svg
chevronLeft_stroke2_corner0_rounded.svg
chevronRight_stroke2_corner0_rounded.svg
chevronTopBottom_stroke2_corner0_rounded.svg
chevronTop_stroke2_corner0_rounded.svg
circleBanSign_stroke2_corner0_rounded.svg
circleCheck_stroke2_corner0_rounded.svg
circleInfo_stroke2_corner0_rounded.svg
circlePlus_stroke2_corner0_rounded.svg
circleQuestion_stroke2_corner2_rounded.svg
circleX_stroke2_corner0_rounded.svg
circle_and_square_stroke1_corner0_rounded_filled.svg
circle_stroke2_corner0_rounded.svg
clipboard_stroke2_corner2_rounded.svg
clock_stroke2_corner0_rounded.svg
closeQuote_filled_stroke2_corner0_rounded.svg
closeQuote_stroke2_corner0_rounded.svg
closeQuote_stroke2_corner1_rounded.svg
codeBrackets_stroke2_corner0_rounded.svg
codeBrackets_stroke2_corner2_rounded.svg
codeLines_stroke2_corner2_rounded.svg
colorPalette_stroke2_corner0_rounded.svg
contacts_filled_corner2_rounded.svg
contacts_stroke2_corner2_rounded.svg
crop_stroke2_corner0_rounded.svg
dotGrid1x3Horizontal_stroke2_corner2_rounded.svg
dotGrid2x3_stroke2_corner2_rounded.svg
download_stroke2_corner0_rounded.svg
earth_stroke2_corner0_rounded.svg
earth_stroke2_corner2_rounded.svg
editBig_stroke2_corner0_rounded.svg
editBig_stroke2_corner2_rounded.svg
editbig_stroke1_corner0_rounded.svg
emojiArc_stroke2_corner0_rounded.svg
emojiHeartEyes_stroke2_corner0_rounded.svg
emojiSad_stroke2_corner0_rounded.svg
emojiSmile_stroke2_corner0_rounded.svg
envelope_filled_stroke2_corner0_rounded.svg
envelope_open_stroke2_corner0_rounded.svg
envelope_stroke2_corner0_rounded.svg
envelope_stroke2_corner2_rounded.svg
explosion_stroke2_corner0_rounded.svg
eyeSlash_stroke2_corner0_rounded.svg
eye_stroke2_corner0_rounded.svg
eye_stroke2_corner2_rounded.svg
filterTimeline_stroke2_corner0_rounded.svg
filter_stroke2_corner0_rounded.svg
flag_stroke2_corner0_rounded.svg
flame_stroke2_corner1_rounded.svg
flipHorizontal_stroke2_corner0_rounded.svg
flipVertical_stroke2_corner0_rounded.svg
floppyDisk_stroke2_corner0_rounded.svg
freeze_stroke2_corner2_rounded.svg
gameController_stroke2_corner0_rounded.svg
gif_stroke2_corner0_rounded.svg
gift1_filled_corner0_rounded.svg
globe_stroke2_corner0_rounded.svg
group3_stroke2_corner0_rounded.svg
growth_stroke2_corner0_rounded.svg
haptic_stroke2_corner2_rounded.svg
hashtag_filled_corner0_rounded.svg
hashtag_stroke2_corner0_rounded.svg
hashtagwide_stroke1_corner0_rounded.svg
heart2_filled_stroke2_corner0_rounded.svg
heart2_stroke1_corner0_rounded.svg
heart2_stroke2_corner0_rounded.svg
homeOpen_filled_corner0_rounded.svg
homeOpen_stroke2_corner0_rounded.svg
home_stroke2_corner2_rounded.svg
image_stroke1_corner0_rounded.svg
inbox_stroke2_corner2_rounded.svg
inbox_stroke2_corner2_rounded_large.svg
key_stroke2_corner2_rounded.svg
lab_stroke2_corner0_rounded.svg
language_stroke2_corner2_rounded.svg
leaf_stroke2_corner0_rounded.svg
likeRepost_stroke2_corner2_rounded.svg
listMagnifyingGlass_stroke2_corner0_rounded.svg
listPlus_stroke2_corner0_rounded.svg
listSparkle_stroke2_corner0_rounded.svg
live_stroke2_corner0_rounded.svg
loader_stroke2_corner0_rounded.svg
lock_stroke2_corner0_rounded.svg
lock_stroke2_corner2_rounded.svg
macintosh_stroke2_corner2_rounded.svg
magnifyingGlass2_stroke2_corner0_rounded.svg
magnifyingGlassX_stroke2_corner0_rounded.svg
magnifyingGlassX_stroke2_corner0_rounded_large.svg
magnifyingGlass_filled_corner0_rounded.svg
menu_stroke2_corner0_rounded.svg
messagePlus_stroke2_corner0_rounded.svg
message_stroke1_corner0_rounded_filled.svg
message_stroke2_corner0_rounded.svg
message_stroke2_corner0_rounded_filled.svg
moon_stroke2_corner2_rounded.svg
musicNote_stroke2_corner0_rounded.svg
mute_stroke2_corner0_rounded.svg
news2_stroke2_corner0_rounded.svg
newspaper_stroke2_corner2_rounded.svg
openQuote_filled_stroke2_corner0_rounded.svg
openQuote_stroke2_corner0_rounded.svg
pageText_stroke2_corner0_rounded.svg
pageX_stroke2_corner0_rounded_large.svg
paintRoller_stroke2_corner2_rounded.svg
paperPlaneVertical_filled_stroke2_corner1_rounded.svg
paperPlane_stroke2_corner0_rounded.svg
pause_filled_corner0_rounded.svg
pause_filled_corner2_rounded.svg
pause_stroke2_corner0_rounded.svg
pause_stroke2_corner2_rounded.svg
pencilLine_stroke2_corner0_rounded.svg
pencilLine_stroke2_corner2_rounded.svg
pencil_stroke2_corner0_rounded.svg
peopleRemove2_stroke2_corner0_rounded.svg
peopleremove2_stroke1_corner0_rounded.svg
personCheck_stroke2_corner0_rounded.svg
personGroup_stroke2_corner2_rounded.svg
personPlus_filled_stroke2_corner0_rounded.svg
personPlus_stroke2_corner0_rounded.svg
personPlus_stroke2_corner2_rounded.svg
personX_stroke2_corner0_rounded.svg
personX_stroke2_corner0_rounded_large.svg
person_filled_corner2_rounded.svg
person_stroke2_corner0_rounded.svg
person_stroke2_corner2_rounded.svg
phoneHaptic_stroke2_corner2_rounded.svg
phone_stroke2_corner2_rounded.svg
pinLocationFilled_stroke2_corner0_rounded.svg
pinLocation_stroke2_corner0_rounded.svg
pin_filled_stroke2_corner0_rounded.svg
pin_stroke2_corner0_rounded.svg
pizza_stroke2_corner0_rounded.svg
play_filled_corner0_rounded.svg
play_filled_corner2_rounded.svg
play_stroke2_corner0_rounded.svg
play_stroke2_corner2_rounded.svg
plusLarge_stroke2_corner0_rounded.svg
plusSmall_stroke2_corner0_rounded.svg
qrCode_stroke2_corner0_rounded.svg
raisingHand4Finger_stroke2_corner0_rounded.svg
raisingHand4finger_stroke2_corner2_rounded.svg
reply.svg
replyFiled.svg
repostRepost_stroke2_corner2_rounded.svg
repost_stroke2_corner0_rounded.svg
repost_stroke2_corner2_rounded.svg
repost_stroke2_corner3_rounded.svg
rose_stroke2_corner0_rounded.svg
settingsGear2_filled_corner0_rounded.svg
settingsGear2_stroke2_corner0_rounded.svg
settingsSliderVertical_stroke2_corner0_rounded.svg
shaka_stroke2_corner0_rounded.svg
shapes_stroke2_corner0_rounded.svg
shieldCheck_stroke2_corner0_rounded.svg
shield_stroke2_corner0_rounded.svg
sparkle_stroke2_corner0_rounded.svg
speakerVolumeFull_stroke2_corner0_rounded.svg
squareArrowTopRight_stroke2_corner0_rounded.svg
squareBehindSquare4_stroke2_corner0_rounded.svg
squareBehindSquare_stroke2_corner0_rounded.svg
star_filled_corner0_rounded.svg
star_stroke2_corner0_rounded.svg
streamingLive_stroke2_corner0_rounded.svg
textSize_stroke2_corner0_rounded.svg
ticket_stroke2_corner0_rounded.svg
timesLarge_stroke2_corner0_rounded.svg
tinyChevronBottom_stroke2_corner0_rounded.svg
titleCase_stroke2_corner0_rounded.svg
trash_stroke2_corner0_rounded.svg
trash_stroke2_corner2_rounded.svg
tree_stroke2_corner0_rounded.svg
trending2_stroke2_corner2_rounded.svg
trending3_stroke2_corner1_rounded.svg
triangleExclamation_stroke2_corner2_rounded.svg
ufo_stroke2_corner0_rounded.svg
unlock_stroke2_corner2_rounded.svg
userCircle_filled_corner0_rounded.svg
userCircle_stroke2_corner0_rounded.svg
verified_stroke2_corner2_rounded.svg
videoClip_stroke2_corner0_rounded.svg
videoclip_stroke1_corner0_rounded.svg
warning_stroke2_corner0_rounded.svg
window_stroke2_corner2_rounded.svg
wrench_stroke2_corner2_rounded.svg
zap_stroke2_corner0_rounded.svg
```

## Appendix B — Iconists-derived components (145)

`src/components/icons/`, byte-identical to upstream. Plus partial: `Gif.tsx`, `Image.tsx`,
`Repost.tsx`, `StarterPack.tsx`.

```
Accessibility.tsx
Alien.tsx
Apple.tsx
Arrow.tsx
ArrowBoxLeft.tsx
ArrowBoxRight.tsx
ArrowCornerDownRight.tsx
ArrowOutOfBox.tsx
ArrowRotate.tsx
ArrowShareRight.tsx
ArrowTopCircle.tsx
ArrowTriangle.tsx
ArrowsDiagonal.tsx
AspectRatio.tsx
At.tsx
Atom.tsx
Bars.tsx
Beaker.tsx
Bell.tsx
Bell2.tsx
BellPlus.tsx
BellRinging.tsx
BirthdayCake.tsx
Bookmark.tsx
Bot.tsx
BroomSparkle.tsx
Bubble.tsx
BubbleInfo.tsx
BulletList.tsx
CC.tsx
Calendar.tsx
CalendarClock.tsx
CalendarDays.tsx
Camera.tsx
Car.tsx
Celebrate.tsx
ChainLink.tsx
Check.tsx
Chevron.tsx
Circle.tsx
CircleAndSquare.tsx
CircleBanSign.tsx
CircleCheck.tsx
CircleInfo.tsx
CirclePlus.tsx
CircleQuestion.tsx
CircleX.tsx
Clipboard.tsx
Clock.tsx
CodeBrackets.tsx
CodeLines.tsx
ColorPalette.tsx
Contacts.tsx
Crop.tsx
DotGrid.tsx
Download.tsx
EditBig.tsx
Emoji.tsx
Envelope.tsx
EnveopeOpen.tsx
Explosion.tsx
Eye.tsx
EyeSlash.tsx
Filter.tsx
FilterTimeline.tsx
Flag.tsx
Flame.tsx
FlipImage.tsx
FloppyDisk.tsx
Freeze.tsx
GameController.tsx
Gift1.tsx
Globe.tsx
Group.tsx
Growth.tsx
Haptic.tsx
Hashtag.tsx
Heart2.tsx
Home.tsx
HomeOpen.tsx
Inbox.tsx
Key.tsx
Lab.tsx
Language.tsx
Leaf.tsx
ListMagnifyingGlass.tsx
ListPlus.tsx
ListSparkle.tsx
Live.tsx
Loader.tsx
Lock.tsx
Macintosh.tsx
MagnifyingGlass.tsx
Menu.tsx
Message.tsx
Moon.tsx
MusicNote.tsx
Mute.tsx
News2.tsx
Newspaper.tsx
PageText.tsx
PageX.tsx
PaintRoller.tsx
PaperPlane.tsx
Pause.tsx
Pencil.tsx
PeopleRemove2.tsx
Person.tsx
Phone.tsx
Pin.tsx
PinLocation.tsx
Pizza.tsx
Play.tsx
Plus.tsx
QrCode.tsx
Quote.tsx
RaisingHand.tsx
Reply.tsx
Rose.tsx
SettingsGear2.tsx
SettingsSlider.tsx
Shaka.tsx
Shapes.tsx
Shield.tsx
Sparkle.tsx
Speaker.tsx
SquareArrowTopRight.tsx
SquareBehindSquare4.tsx
Star.tsx
StreamingLive.tsx
TextSize.tsx
Thumb.tsx
Ticket.tsx
Times.tsx
TitleCase.tsx
Trash.tsx
Tree.tsx
Trending.tsx
UFO.tsx
UserCircle.tsx
VideoClip.tsx
Warning.tsx
Window.tsx
Wrench.tsx
Zap.tsx
```
