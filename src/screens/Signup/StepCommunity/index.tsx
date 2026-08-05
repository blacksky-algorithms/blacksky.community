import {useMemo} from 'react'
import {Image, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {useQuery} from '@tanstack/react-query'

import {DEFAULT_BRAND_CONFIG} from '#/lib/community/BrandContext'
import {fetchBrandList} from '#/lib/community/resolveBrand'
import {FEEDBACK_FORM_URL} from '#/lib/constants'
import {useOpenLink} from '#/lib/hooks/useOpenLink'
import {Logo} from '#/view/icons/Logo'
import {useSignupContext} from '#/screens/Signup/state'
import {Policies} from '#/screens/Signup/StepInfo/Policies'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
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

// Brand-plate colors from the design, used only as a fallback when a community's
// catalog/config entry does not carry its own color.
const FIGMA_ICON_BG: Record<string, string> = {
  atproto: '#FFFFFF',
  blacksky: '#000000',
  latinsky: '#091A25',
  medsky: '#006BFF',
}

/**
 * First signup step: choose the community the account will live in, which sets
 * the PDS and (via describeServer) the handle domain used by the rest of the
 * flow. Blacksky (or whichever community the app is served/bundled as) is the
 * default and always the first option; other published communities follow,
 * sourced from the brand service. When the brand service is unreachable (e.g.
 * `yarn web` in dev) only the bundled default is shown.
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
        {options.map(option => (
          <SelectionRow
            key={option.slug}
            testID={`communityOption-${option.slug}`}
            mode="radio"
            selected={option.slug === selectedSlug}
            onPress={() =>
              dispatch({
                type: 'setCommunity',
                slug: option.slug,
                serviceUrl: option.pds,
              })
            }
            title={option.displayName}
            description={option.description || undefined}
            subtitle={option.pds.replace(/^https?:\/\//, '')}
            icon={<CommunityIcon option={option} />}
          />
        ))}
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

function CommunityIcon({option}: {option: CommunityOption}) {
  const t = useTheme()
  const iconBg =
    option.themeColor || FIGMA_ICON_BG[option.slug] || t.palette.contrast_25

  return (
    <View
      style={[
        {width: ICON_PLATE, height: ICON_PLATE, backgroundColor: iconBg},
        a.rounded_sm,
        a.overflow_hidden,
        a.justify_center,
        a.align_center,
      ]}>
      {option.isDefault ? (
        <Logo width={LOGO_SIZE} />
      ) : option.logo ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{uri: option.logo}}
          style={{width: LOGO_SIZE, height: LOGO_SIZE}}
          resizeMode="contain"
        />
      ) : (
        <Text style={[a.text_lg, a.font_bold, {color: t.palette.white}]}>
          {option.displayName.slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  )
}
