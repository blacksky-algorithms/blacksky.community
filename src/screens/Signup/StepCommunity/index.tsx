import {useMemo} from 'react'
import {Image, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {useQuery} from '@tanstack/react-query'

import {useBrand} from '#/lib/community/BrandContext'
import {fetchBrandList} from '#/lib/community/resolveBrand'
import {FEEDBACK_FORM_URL} from '#/lib/constants'
import {useOpenLink} from '#/lib/hooks/useOpenLink'
import {Logomark} from '#/view/icons/Logomark'
import {useSignupContext} from '#/screens/Signup/state'
import {atoms as a, useTheme} from '#/alf'
import {FormError} from '#/components/forms/FormError'
import {HostingProvider} from '#/components/forms/HostingProvider'
import {Loader} from '#/components/Loader'
import {
  AppBar,
  Eyebrow,
  Footer,
  PrimaryButton,
  SelectionRow,
} from '#/components/onboarding-chrome'
import {Text} from '#/components/Typography'

export function StepCommunity({onPressBack}: {onPressBack: () => void}) {
  const {_} = useLingui()
  const t = useTheme()
  const brand = useBrand()
  const openLink = useOpenLink()
  const {state, dispatch} = useSignupContext()
  const {
    data: brands,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['signup-brand-list'],
    queryFn: fetchBrandList,
    staleTime: 300000,
  })
  const options = useMemo(
    () => [
      {
        slug: brand.metadata.slug,
        displayName: brand.metadata.displayName,
        pds: brand.services.pds.url,
        logo: brand.assets.logo,
      },
      ...(brands ?? []).filter(b => b.slug !== brand.metadata.slug),
    ],
    [brand, brands],
  )
  return (
    <View style={[a.flex_1, a.gap_lg]}>
      <AppBar
        onBack={onPressBack}
        onHelp={() => openLink(FEEDBACK_FORM_URL({email: state.email}))}
      />
      <Eyebrow label={_(msg`Communities`)} />
      <View style={a.gap_sm}>
        <Text style={[a.font_heading, a.text_3xl]}>
          <Trans>Join another community</Trans>
        </Text>
        <Text
          style={[
            a.text_md,
            a.leading_snug,
            t.atoms.text,
            {fontWeight: '300', fontSize: 14, lineHeight: 22},
          ]}>
          <Trans>
            Choose the community your account will live in. You can use it
            across the network.
          </Trans>
        </Text>
      </View>
      <View style={a.gap_sm}>
        {options.map(option => (
          <View
            key={option.slug}
            style={[a.border, a.rounded_sm, t.atoms.border_contrast_medium]}>
            <SelectionRow
              mode="radio"
              testID={`communityOption-${option.slug}`}
              selected={state.serviceUrl === option.pds}
              title={option.displayName}
              onPress={() =>
                dispatch({
                  type: 'setCommunity',
                  slug: option.slug,
                  serviceUrl: option.pds,
                })
              }
              icon={
                option.logo ? (
                  <Image
                    accessibilityIgnoresInvertColors
                    source={{uri: option.logo}}
                    style={{width: 32, height: 32}}
                  />
                ) : (
                  <Logomark width={24} fill={t.atoms.text.color} />
                )
              }
            />
          </View>
        ))}
      </View>
      {isPending && <Loader size="lg" />}
      {isError && (
        <PrimaryButton
          variant="outline"
          label={_(msg`Retry loading communities`)}
          onPress={() => {
            void refetch()
          }}
        />
      )}
      <HostingProvider
        minimal
        serviceUrl={state.serviceUrl}
        onSelectServiceUrl={value => dispatch({type: 'setServiceUrl', value})}
      />
      <FormError error={state.error} />
      <Footer>
        <PrimaryButton
          testID="communityContinue"
          label={_(msg`Continue`)}
          onPress={() => dispatch({type: 'next'})}
          disabled={
            state.isLoading || !state.serviceDescription || !!state.error
          }
        />
      </Footer>
    </View>
  )
}
