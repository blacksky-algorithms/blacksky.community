import {useMemo} from 'react'
import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {useQuery} from '@tanstack/react-query'

import {DEFAULT_BRAND_CONFIG} from '#/lib/community/BrandContext'
import {fetchBrandList} from '#/lib/community/resolveBrand'
import {useSignupContext} from '#/screens/Signup/state'
import {atoms as a} from '#/alf'
import * as TextField from '#/components/forms/TextField'
import * as Select from '#/components/Select'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {BackNextButtons} from '../BackNextButtons'

type CommunityOption = {slug: string; displayName: string; pds: string}

/**
 * First signup step: choose the community to create the account in. Blacksky is
 * the default and always the first option (its config is bundled into the app,
 * not served by the brand service). Other published communities are listed below
 * it in the dropdown, sourced from the brand service. Selecting one points signup
 * at that community's PDS and stamps its slug so the client can resolve the brand
 * deterministically later.
 */
export function StepCommunity({onPressBack}: {onPressBack: () => void}) {
  const {_} = useLingui()
  const ax = useAnalytics()
  const {state, dispatch} = useSignupContext()

  const {data: brands} = useQuery({
    queryKey: ['signup-brand-list'],
    queryFn: fetchBrandList,
    staleTime: 5 * 60 * 1000,
  })

  // Blacksky (the default) always leads; dedupe it out of the served list.
  const options = useMemo<CommunityOption[]>(() => {
    const blacksky: CommunityOption = {
      slug: DEFAULT_BRAND_CONFIG.metadata.slug,
      displayName: DEFAULT_BRAND_CONFIG.metadata.displayName,
      pds: DEFAULT_BRAND_CONFIG.services.pds.url,
    }
    const others = (brands ?? [])
      .filter(b => b.slug !== blacksky.slug)
      .map(b => ({
        slug: b.slug,
        displayName: b.displayName || b.name,
        pds: b.pds,
      }))
    return [blacksky, ...others]
  }, [brands])

  const selectedSlug =
    state.selectedBrandSlug ?? DEFAULT_BRAND_CONFIG.metadata.slug

  const onValueChange = (slug: string) => {
    const option = options.find(o => o.slug === slug)
    if (!option) return
    dispatch({type: 'setCommunity', slug: option.slug, serviceUrl: option.pds})
  }

  const onNextPress = () => {
    dispatch({type: 'next'})
    ax.metric('signup:nextPressed', {activeStep: state.activeStep})
  }

  return (
    <>
      <View style={[a.gap_md, a.pt_lg]}>
        <Text style={[a.text_md, a.leading_snug]}>
          <Trans>
            Choose the community your account will live in. You can always use
            it across the network.
          </Trans>
        </Text>
        <View style={[a.gap_xs]}>
          <TextField.LabelText>
            <Trans>Community</Trans>
          </TextField.LabelText>
          <Select.Root value={selectedSlug} onValueChange={onValueChange}>
            <Select.Trigger label={_(msg`Select your community`)}>
              <Select.ValueText placeholder={_(msg`Select your community`)} />
              <Select.Icon />
            </Select.Trigger>
            <Select.Content
              items={options.map(o => ({label: o.displayName, value: o.slug}))}
              renderItem={({label, value}) => (
                <Select.Item value={value} label={label}>
                  <Select.ItemIndicator />
                  <Select.ItemText>{label}</Select.ItemText>
                </Select.Item>
              )}
            />
          </Select.Root>
        </View>
      </View>
      <BackNextButtons
        isLoading={state.isLoading}
        onBackPress={onPressBack}
        onNextPress={onNextPress}
      />
    </>
  )
}
