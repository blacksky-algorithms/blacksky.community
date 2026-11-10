# Asset licensing

The [MIT license](./LICENSE) in this repository covers the source code. It does not cover
every file in the tree. This document lists the files it does not cover.

Blacksky Community is a fork of Bluesky's social-app. The licensed icon system, the
commissioned landing artwork, and the Bluesky brand marks that upstream ships have been
replaced here. One directory of upstream product imagery remains, and it is listed in
[Section 2](#2-upstream-product-imagery).

**The rule:** if a file is listed in Sections 1 to 3, the MIT license does not grant you
rights to it. Everything in [Section 4](#4-third-party-assets-you-may-redistribute) is
redistributable on its own terms, which travel with the files.

---

## 1. Blacksky brand assets

The Blacksky name, logo, wordmark, landing artwork, and app icons identify Blacksky. They are
not licensed to you under the MIT license or by this document. You may refer to Blacksky by
name to describe interoperability or origin. You may not use these assets as the identity of
your own product or service.

- `assets/app-icons/` — all iOS and Android app icon variants, including the `.icon` bundles
- `assets/illustrations/` — landing-screen artwork used by `src/view/com/auth/SplashScreen.tsx`
- `assets/favicon.png`
- `assets/logo.png`
- `assets/default-avatar.png`
- `assets/icon-android-foreground.png`
- `assets/icon-android-monochrome.png`
- `assets/icon-android-notification.png`
- `assets/splash/splash.png`
- `assets/splash/splash-dark.png`
- `assets/splash/android-splash-logo-white.png`
- `bskyembed/assets/logo.svg`
- `bskyembed/assets/logo_full_name.svg`
- `bskyweb/static/favicon.png`, `favicon-16x16.png`, `favicon-32x32.png`
- `bskyweb/static/apple-touch-icon.png`
- `bskyweb/static/safari-pinned-tab.svg`
- `bskyweb/static/social-card-default.png`, `bskyweb/static/social-card-default-gradient.png`
- `bskyweb/embedr-static/favicon.png`, `favicon-16x16.png`, `favicon-32x32.png`
- `modules/BlackskyClip/Images.xcassets/AppIcon.appiconset/`
- Inline vector path data in `src/view/icons/Logo.tsx` and `src/view/icons/Logotype.tsx`

If you are forking this repository, replace these files.

## 2. Upstream product imagery

**`assets/images/`**

Most of this directory is product imagery inherited from upstream: chat backgrounds,
onboarding art, and feature announcement graphics. Bluesky Social PBC states that its MIT
license does not cover this imagery and that some of it is commissioned work it cannot
sublicense. We cannot pass on rights we were not given.

**Treat everything in this directory as outside the MIT license and not licensed for your
use.** If you are forking, replace these files or ship without them.
See [`assets/images/README.md`](./assets/images/README.md).

## 3. Third-party trademarks

These marks belong to other organizations. They are included to identify those services in
the UI. Your use of them rests on your own nominative-use basis or on permission from the
mark owner.

- `assets/icons/community/` — Leaflet, Offprint, pckt (`pckt.svg`, `pckt-full.svg`),
  Standard.site, and Germ Network (`germ_logo.webp`)
- `assets/images/giphy_attribution_light.png`, `assets/images/giphy_attribution_dark.png` — GIPHY
- `assets/images/graze_logo.webp` — Graze

## 4. Third-party assets you may redistribute

These are licensed on terms that permit redistribution. Nothing in this document restricts
them. Their license text travels with the files, and you must keep it there.

| Asset | Path | License | Notice |
|---|---|---|---|
| Inter typeface | `assets/fonts/inter/` | SIL Open Font License 1.1 | [`OFL.txt`](./assets/fonts/inter/OFL.txt) |
| Inter typeface (OG card service) | `bskyogcard/src/assets/fonts/` | SIL Open Font License 1.1 | [`README.md`](./bskyogcard/src/assets/fonts/README.md) |
| Rubik typeface | `assets/fonts/rubik/` | SIL Open Font License 1.1 | [`OFL.txt`](./assets/fonts/rubik/OFL.txt) |
| Azeret Mono typeface | `assets/fonts/azeret_mono/` | SIL Open Font License 1.1 | [`OFL.txt`](./assets/fonts/azeret_mono/OFL.txt) |
| country-flag-icons | `assets/icons/flags/` | MIT, © @catamphetamine | [`README.md`](./assets/icons/flags/README.md) |
| Material Icons | `bskyweb/static/media/MaterialIcons.*.ttf` | Apache License 2.0 | [`NOTICE.md`](./NOTICE.md) |

The user-interface icons are drawn as inline path data in `src/components/icons/` from openly
licensed sets: Tabler, Lucide, Phosphor, Iconoir, and OpenMoji. Their notices are in
[`NOTICE.md`](./NOTICE.md) and `licenses/`.

**One thing to watch on the fonts:** OFL 1.1 includes a Reserved Font Name provision. If you
modify or subset a font, the result cannot be distributed under its reserved name.

## Adding an asset

If it is openly licensed, add its notice to `NOTICE.md` and its license text to `licenses/`.
If it is not, list it here. `node scripts/check-asset-notices.mjs` fails when a path named in
either file no longer exists.

---

*This document describes the licensing position of assets in this repository. It is not a
grant of rights, and it does not modify the [MIT license](./LICENSE) as it applies to source
code.*
