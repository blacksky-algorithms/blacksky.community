import {useMemo, useState} from 'react'
import {Image, Pressable, View} from 'react-native'
import {type I18n} from '@lingui/core'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {useQuery} from '@tanstack/react-query'

import {DEFAULT_BRAND_CONFIG} from '#/lib/community/BrandContext'
import {fetchBrandList} from '#/lib/community/resolveBrand'
import {FEEDBACK_FORM_URL} from '#/lib/constants'
import {useOpenLink} from '#/lib/hooks/useOpenLink'
import {colors} from '#/lib/styles'
import {Logomark} from '#/view/icons/Logomark'
import {useSignupContext} from '#/screens/Signup/state'
import {Policies} from '#/screens/Signup/StepInfo/Policies'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Loader} from '#/components/Loader'
import {
  AppBar,
  Eyebrow,
  PrimaryButton,
  SelectionRow,
} from '#/components/onboarding-chrome'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'

type CommunityOption = {
  slug: string
  displayName: string
  description: string
  pds: string
  logo: string
  themeColor: string
  isDefault: boolean
}

const ICON_PLATE = 40
const LOGO_SIZE = 24
const BRAND_LOGO_SIZE = 32
const CONTROL_SIZE = 24
const SELECTED_ROW_BG = 'rgba(210, 252, 81, 0.08)'

// Contrasting star colors: a dark star on light plates, a near-white star on
// dark plates.
const STAR_DARK = '#161E27'
const STAR_LIGHT = colors.white

// Brand-plate colors from the design, used only as a fallback when a community's
// catalog/config entry does not carry its own color.
const FIGMA_ICON_BG: Record<string, string> = {
  atproto: '#FFFFFF',
  blacksky: '#000000',
  latinsky: '#091A25',
  medsky: '#006BFF',
}

// Per-domain handle plate: plate background + contrasting star fill, matched on
// the domain with any leading dot stripped.
const HANDLE_PLATE: Record<string, {bg: string; star: string}> = {
  'myatproto.social': {bg: '#FFFFFF', star: STAR_DARK},
  'blacksky.app': {bg: '#000000', star: STAR_LIGHT},
  'cryptoanarchy.network': {bg: colors.green2, star: STAR_DARK},
}
const HANDLE_PLATE_FALLBACK = {bg: STAR_DARK, star: STAR_LIGHT}

// Relative luminance of a #RGB/#RRGGBB color; true when the color is light
// enough to want a dark star painted on it.
function isLightColor(hex: string): boolean {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map(c => c + c)
          .join('')
      : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return lum > 0.5
}

function contrastStar(bg: string): string {
  return isLightColor(bg) ? STAR_DARK : STAR_LIGHT
}

// Handle domains the design intentionally never surfaces at signup. The count
// shown ("{N} handles available") is taken after this filter.
const HIDDEN_HANDLE_DOMAINS = new Set(['latinsky.app', 'afrolatinsky.app'])

function displayDomain(domain: string): string {
  return domain.replace(/^\.+/, '')
}

// Subtitle shown for each handle domain. Extended later via config; unknown
// domains read as open to everyone.
function handleDescription(_: I18n['_'], domain: string): string {
  switch (displayDomain(domain)) {
    case 'blacksky.app':
      return _(msg`Black community`)
    case 'cryptoanarchy.network':
      return _(msg`Tech community`)
    case 'myatproto.social':
    default:
      return _(msg`Open to everyone`)
  }
}

/**
 * First signup step: choose the community the account will live in, which sets
 * the PDS and (via describeServer) the handle domain used by the rest of the
 * flow. Each community is a row; the selected community expands to reveal its
 * handle domains so the account handle is picked in the same step. Blacksky (or
 * whichever community the app is served/bundled as) is the default and always
 * the first option, rendered expanded on load; other published communities
 * follow, sourced from the brand service. When the brand service is unreachable
 * (e.g. `yarn web` in dev) only the bundled default is shown.
 *
 * Only the selected community's describeServer is fetched, so only it knows its
 * precise handle domains and count. Other communities render as a collapsed
 * disclosure row; tapping one selects it, which points signup at its PDS,
 * triggers its describeServer fetch, and expands it in turn.
 */
export function StepCommunity({onPressBack}: {onPressBack: () => void}) {
  const {_} = useLingui()
  const ax = useAnalytics()
  const t = useTheme()
  const openLink = useOpenLink()
  const {state, dispatch} = useSignupContext()

  const {data: brands} = useQuery({
    queryKey: ['signup-brand-list'],
    queryFn: fetchBrandList,
    staleTime: 5 * 60 * 1000,
  })

  const options = useMemo<CommunityOption[]>(() => {
    const bundled: CommunityOption = {
      slug: DEFAULT_BRAND_CONFIG.metadata.slug,
      displayName: DEFAULT_BRAND_CONFIG.metadata.displayName,
      description: '',
      pds: DEFAULT_BRAND_CONFIG.services.pds.url,
      logo: DEFAULT_BRAND_CONFIG.assets.logo,
      themeColor: DEFAULT_BRAND_CONFIG.web.themeColor,
      isDefault: true,
    }
    const others = (brands ?? [])
      .filter(b => b.slug !== bundled.slug)
      .map(b => ({
        slug: b.slug,
        displayName: b.displayName || b.name,
        description: b.description,
        pds: b.pds,
        logo: b.logo,
        themeColor: b.themeColor,
        isDefault: false,
      }))
    return [bundled, ...others]
  }, [brands])

  const selectedSlug =
    state.selectedBrandSlug ?? DEFAULT_BRAND_CONFIG.metadata.slug

  // Handle domains for the selected community, after the hidden-domain filter.
  const selectedDomains = useMemo(
    () =>
      (state.serviceDescription?.availableUserDomains ?? []).filter(
        d => !HIDDEN_HANDLE_DOMAINS.has(displayDomain(d)),
      ),
    [state.serviceDescription],
  )

  const [collapsedSlug, setCollapsedSlug] = useState<string | null>(null)

  const onContinue = () => {
    dispatch({type: 'next'})
    ax.metric('signup:nextPressed', {activeStep: state.activeStep})
  }

  // TODO: wire up joining a community not present in the catalog.
  const onJoinAnotherCommunity = () => {}

  return (
    <View style={[a.gap_lg]}>
      <AppBar
        showBack
        onBack={onPressBack}
        onHelp={() => openLink(FEEDBACK_FORM_URL({email: state.email}))}
      />

      <Eyebrow step={1} total={4} />

      <View style={[a.gap_xs]}>
        <Text style={[a.font_heading, a.text_3xl, a.leading_snug]}>
          <Trans>Choose your handle</Trans>
        </Text>
        <Text style={[a.text_md, a.leading_snug, t.atoms.text_contrast_medium]}>
          <Trans>
            Choose the community your account will live in. You can always use
            it across the network.
          </Trans>
        </Text>
      </View>

      <View>
        {options.map(option => {
          const isSelected = option.slug === selectedSlug
          const expanded = isSelected && collapsedSlug !== option.slug
          return (
            <CommunityRow
              key={option.slug}
              option={option}
              isSelected={isSelected}
              domains={isSelected ? selectedDomains : undefined}
              isLoading={isSelected && state.isLoading}
              expanded={expanded}
              selectedDomain={state.userDomain}
              onToggle={() => {
                if (isSelected) {
                  setCollapsedSlug(prev =>
                    prev === option.slug ? null : option.slug,
                  )
                } else {
                  dispatch({
                    type: 'setCommunity',
                    slug: option.slug,
                    serviceUrl: option.pds,
                  })
                  setCollapsedSlug(null)
                }
              }}
              onSelectHandle={rawDomain => {
                if (!isSelected) {
                  dispatch({
                    type: 'setCommunity',
                    slug: option.slug,
                    serviceUrl: option.pds,
                  })
                  setCollapsedSlug(null)
                }
                dispatch({type: 'setUserDomain', value: rawDomain})
              }}
            />
          )
        })}
      </View>

      {state.serviceDescription ? (
        <Policies serviceDescription={state.serviceDescription} />
      ) : null}

      <View style={[a.gap_sm]}>
        <PrimaryButton
          testID="nextBtn"
          label={_(msg`Continue`)}
          onPress={onContinue}
          disabled={state.isLoading}
        />
        <Button
          label={_(msg`Join another community`)}
          onPress={onJoinAnotherCommunity}
          color="primary"
          variant="outline"
          size="large"
          style={[a.w_full]}>
          <ButtonText
            style={[
              a.font_mono,
              {fontWeight: '300', fontSize: 14, textTransform: 'uppercase'},
            ]}>
            <Trans>Join another community</Trans>
          </ButtonText>
        </Button>
      </View>
    </View>
  )
}

function CommunityRow({
  option,
  isSelected,
  domains,
  isLoading,
  expanded,
  selectedDomain,
  onToggle,
  onSelectHandle,
}: {
  option: CommunityOption
  isSelected: boolean
  domains: string[] | undefined
  isLoading: boolean
  expanded: boolean
  selectedDomain: string
  onToggle: () => void
  onSelectHandle: (rawDomain: string) => void
}) {
  const {_} = useLingui()
  const testID = `communityOption-${option.slug}`
  const icon = <CommunityIcon option={option} />

  // Other communities: we have not fetched their describeServer, so their
  // handle count is unknown. Show a collapsed disclosure row; tapping selects
  // the community (which loads its handles and expands it).
  if (!isSelected || domains === undefined) {
    return (
      <SelectionRow
        testID={testID}
        mode="disclosure"
        selected={false}
        expanded={false}
        onPress={onToggle}
        title={option.displayName}
        icon={icon}
      />
    )
  }

  if (isLoading) {
    return (
      <View>
        <SelectionRow
          testID={testID}
          mode="disclosure"
          selected
          expanded
          onPress={onToggle}
          title={option.displayName}
          icon={icon}
        />
        <View style={[a.py_sm]}>
          <Loader size="sm" />
        </View>
      </View>
    )
  }

  // Exactly one handle domain: a plain row that picks the community + its only
  // domain. Handle description is the emphasis line, the domain is the subtitle.
  if (domains.length === 1) {
    const domain = domains[0]
    return (
      <SelectionRow
        testID={testID}
        mode="radio"
        selected
        onPress={() => onSelectHandle(domain)}
        title={option.displayName}
        description={handleDescription(_, domain)}
        subtitle={displayDomain(domain)}
        icon={icon}
      />
    )
  }

  // More than one handle domain: an expandable header revealing the domains.
  // (domains.length is always > 1 here, so "handles" is always plural.)
  return (
    <View>
      <SelectionRow
        testID={testID}
        mode="disclosure"
        selected
        expanded={expanded}
        onPress={onToggle}
        title={option.displayName}
        subtitle={
          domains.length > 0
            ? _(msg`${domains.length} handles available`)
            : undefined
        }
        icon={icon}
      />
      {expanded ? (
        <View style={[a.gap_2xs, a.pb_sm]}>
          {domains.map(domain => (
            <HandleRow
              key={domain}
              domain={domain}
              description={handleDescription(_, domain)}
              selected={domain === selectedDomain}
              onPress={() => onSelectHandle(domain)}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

function HandleRow({
  domain,
  description,
  selected,
  onPress,
}: {
  domain: string
  description: string
  selected: boolean
  onPress: () => void
}) {
  const t = useTheme()
  const plate = HANDLE_PLATE[displayDomain(domain)] ?? HANDLE_PLATE_FALLBACK
  return (
    <Pressable
      testID={`handleDomainOption-${displayDomain(domain)}`}
      accessibilityRole="radio"
      accessibilityLabel={displayDomain(domain)}
      accessibilityHint={description}
      accessibilityState={{selected}}
      aria-checked={selected}
      onPress={onPress}
      style={[
        a.flex_row,
        a.align_center,
        a.gap_md,
        a.rounded_sm,
        {paddingHorizontal: 12, paddingVertical: 10},
        selected && {backgroundColor: SELECTED_ROW_BG},
      ]}>
      <IconPlate bg={plate.bg}>
        <Logomark fill={plate.star} width={LOGO_SIZE} />
      </IconPlate>
      <View style={[a.flex_1]}>
        <Text
          style={[
            a.text_md,
            a.font_semi_bold,
            a.leading_tight,
            {color: colors.green2},
          ]}>
          {displayDomain(domain)}
        </Text>
        <Text
          style={[
            a.text_xs,
            a.leading_tight,
            {color: colors.brand3, marginTop: 2},
          ]}>
          {description}
        </Text>
      </View>
      <View
        style={[
          a.align_center,
          a.justify_center,
          a.rounded_full,
          {
            width: CONTROL_SIZE,
            height: CONTROL_SIZE,
            borderWidth: 2,
            borderColor: selected ? colors.green2 : t.palette.contrast_400,
            flexShrink: 0,
          },
        ]}>
        {selected ? (
          <View
            style={[
              a.rounded_full,
              {width: 12, height: 12, backgroundColor: colors.green2},
            ]}
          />
        ) : null}
      </View>
    </Pressable>
  )
}

function IconPlate({bg, children}: {bg: string; children: React.ReactNode}) {
  return (
    <View
      style={[
        {width: ICON_PLATE, height: ICON_PLATE, backgroundColor: bg},
        a.rounded_sm,
        a.overflow_hidden,
        a.justify_center,
        a.align_center,
      ]}>
      {children}
    </View>
  )
}

function CommunityIcon({option}: {option: CommunityOption}) {
  // Bundled/Blacksky community: white star on a black plate.
  if (option.isDefault) {
    return (
      <IconPlate bg="#000000">
        <Logomark fill={STAR_LIGHT} width={LOGO_SIZE} />
      </IconPlate>
    )
  }

  const bg = option.themeColor || FIGMA_ICON_BG[option.slug] || STAR_DARK
  return (
    <IconPlate bg={bg}>
      {option.logo ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{uri: option.logo}}
          style={{width: BRAND_LOGO_SIZE, height: BRAND_LOGO_SIZE}}
          resizeMode="contain"
        />
      ) : (
        <Logomark fill={contrastStar(bg)} width={LOGO_SIZE} />
      )}
    </IconPlate>
  )
}
