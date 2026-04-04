# Plan: Support Page with Stripe Embedded Checkout

## Context

The Blacksky community app (a Bluesky fork) needs a dedicated Support page that consolidates donation options. Currently, OpenCollective links are scattered in the Drawer footer and RightNav footer. The existing `/support` route shows only a help desk email link. This plan repurposes that route to become a full donation page with an OpenCollective card and a web-only Stripe embedded checkout form.

---

## Files to Modify

| File | Change |
|------|--------|
| `package.json` | Add `@stripe/react-stripe-js` + `@stripe/stripe-js` |
| `.env.example` | Add `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` and `EXPO_PUBLIC_STRIPE_API_URL` |
| `src/env/common.ts` | Export the two new env vars |
| `src/lib/routes/types.ts` | Add `SupportReturn: {session_id?: string}` to `CommonNavigatorParams` |
| `src/routes.ts` | Add `SupportReturn: '/support/return'` |
| `src/Navigation.tsx` | Register `SupportReturnScreen` in `commonScreens()` |
| `src/view/shell/desktop/LeftNav.tsx` | Add Support `NavItem` with Heart icon after Settings |
| `src/view/shell/Drawer.tsx` | Add `SupportMenuItem` after Settings; update `onPressContribute` to navigate to Support |
| `src/view/shell/desktop/RightNav.tsx` | Change "Support Us" link from OpenCollective URL to `/support` |
| `src/view/screens/Support.tsx` | Rewrite: OpenCollective card + `<SupportStripeCheckout />` |

## Files to Create

| File | Purpose |
|------|---------|
| `src/view/screens/SupportStripeCheckout.tsx` | Native fallback (returns `null`) |
| `src/view/screens/SupportStripeCheckout.web.tsx` | Web donation form + Stripe EmbeddedCheckout |
| `src/view/screens/SupportReturn.tsx` | Post-checkout return screen (reads `session_id`, calls `session-status` API) |

---

## Implementation Steps

### Step 1: Install Dependencies
```bash
yarn add @stripe/react-stripe-js @stripe/stripe-js
```

### Step 2: Environment Variables
- `src/env/common.ts`: export `STRIPE_PUBLISHABLE_KEY` and `STRIPE_API_URL` from `process.env.EXPO_PUBLIC_*`
- `.env.example`: add placeholder entries

### Step 3: Routes & Navigation Types
- `src/lib/routes/types.ts` line ~41: add `SupportReturn: {session_id?: string}`
- `src/routes.ts` line ~76: add `SupportReturn: '/support/return'`
- `src/Navigation.tsx`: import `SupportReturnScreen`, add `<Stack.Screen name="SupportReturn" ...>` after the existing Support screen registration (~line 336)

### Step 4: Desktop LeftNav — Add Support Nav Item
- `src/view/shell/desktop/LeftNav.tsx`
- Import `Heart2_Stroke2_Corner0_Rounded` (outline) and `Heart2_Filled_Stroke2_Corner0_Rounded` (filled) from `#/components/icons/Heart2`
- Add `<NavItem href="/support" icon={<Heart ...>} iconFilled={<HeartFilled ...>} label="Support" />` after the Settings NavItem (after line 806), before `<ComposeBtn />`

### Step 5: Mobile Drawer — Add Support Menu Item
- `src/view/shell/Drawer.tsx`
- Import Heart icons
- Create `SupportMenuItem` component (following `SettingsMenuItem` pattern)
- Add `onPressSupport` callback: `navigation.navigate('Support'); setDrawerOpen(false)`
- Insert `<SupportMenuItem onPress={onPressSupport} />` after `<SettingsMenuItem>` in the `hasSession` block (~line 313)
- Update `onPressContribute` in DrawerContent to navigate to Support screen instead of opening OpenCollective URL

### Step 6: Update RightNav Footer
- `src/view/shell/desktop/RightNav.tsx` line 98: change `to="https://opencollective.com/..."` to `to="/support"`

### Step 7: Rewrite Support Screen
- `src/view/screens/Support.tsx`
- Use `Layout.Screen > Layout.Center > Layout.Header + Layout.Content` pattern
- Section A: OpenCollective card with description and link to `https://opencollective.com/blacksky`
- Section B: `<SupportStripeCheckout />` imported from `./SupportStripeCheckout` (platform-split)

### Step 8: Create SupportStripeCheckout (Platform Split)

**Native (`SupportStripeCheckout.tsx`)**: Returns `null`

**Web (`SupportStripeCheckout.web.tsx`)**:
- State: `amount` (string, default `"7"`), `recurring` (boolean, default `false`), `clientSecret`, `error`, `loading`
- Preset buttons: $5, $10, $25, $50 using `Button` (solid when selected, outline when not)
- Custom amount input: `TextField.Root > TextField.Input` with `$` prefix via wrapper View
- Frequency toggle: `SegmentedControl.Root` with "One-time" / "Monthly" items
- Validation: min $5, max $1000, valid number — inline error text
- Button label: "Donate $X.XX" or "Donate $X.XX/mo" — disabled when invalid
- On submit: `POST {STRIPE_API_URL}/create-checkout-session` with `{amount: cents, recurring: bool}`
- On success: render `EmbeddedCheckoutProvider + EmbeddedCheckout` with `clientSecret`
- `loadStripe(STRIPE_PUBLISHABLE_KEY)` called once at module level

### Step 9: Create SupportReturn Screen
- `src/view/screens/SupportReturn.tsx`
- On mount (web only): read `session_id` from `window.location.search`
- Fetch `GET {STRIPE_API_URL}/session-status?session_id=...`
- Show success ("Thank you for your support!") if `status === 'complete'`
- Show retry/redirect if `status === 'open'`
- "Back to Support" button navigates to Support screen

### Step 10: Extract i18n Strings
```bash
yarn lingui:extract
```

---

## Key Reusable Components
- `Button`, `ButtonText` from `#/components/Button` — preset amounts + CTA
- `SegmentedControl.Root/Item/ItemText` from `#/components/forms/SegmentedControl` — one-time/monthly toggle
- `TextField.Root/Input/LabelText` from `#/components/forms/TextField` — custom amount input
- `Layout.Screen/Center/Header/Content` from `#/components/Layout` — screen structure
- `Text` from `#/components/Typography`
- `InlineLinkText` from `#/components/Link` — OpenCollective link
- `Heart2_Stroke2_Corner0_Rounded` / `Heart2_Filled_Stroke2_Corner0_Rounded` from `#/components/icons/Heart2`

## Backend API Contract
- `POST {API_URL}/create-checkout-session` — body: `{amount: number (cents), recurring: boolean}`  → response: `{clientSecret: string}`
- `GET {API_URL}/session-status?session_id=...` → response: `{status: 'complete'|'open'|'expired', customer_email: string, payment_status: string}`

## Verification
1. `yarn web` — app builds without errors
2. Desktop: Support heart icon appears in LeftNav after Settings, navigates to `/support`
3. Mobile web: Support appears in Drawer menu
4. Support screen shows OpenCollective card with working external link
5. Donation form: preset buttons update amount, custom input works, validation shows errors for <$5 or >$1000
6. Segmented control toggles between one-time/monthly
7. "Donate" button shows correct amount and frequency label
8. With valid Stripe keys + running backend: checkout session creates, EmbeddedCheckout renders
9. After payment: `/support/return` shows success message
10. Native build: only OpenCollective section visible, no Stripe imports
