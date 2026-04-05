import React from 'react'
import {View} from 'react-native'
import {msg, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {useFocusEffect} from '@react-navigation/native'

import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {useSetMinimalShellMode} from '#/state/shell'
import {atoms as a, useTheme} from '#/alf'
import * as Layout from '#/components/Layout'
import {InlineLinkText} from '#/components/Link'
import {Text} from '#/components/Typography'
import {SupportStripeCheckout} from './SupportStripeCheckout'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'Support'>
export const SupportScreen = (_props: Props) => {
  const setMinimalShellMode = useSetMinimalShellMode()
  const {_} = useLingui()
  const t = useTheme()

  useFocusEffect(
    React.useCallback(() => {
      setMinimalShellMode(false)
    }, [setMinimalShellMode]),
  )

  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Support</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <View style={[a.p_xl, a.gap_xl]}>
          <View
            style={[
              a.p_lg,
              a.rounded_md,
              a.border,
              t.atoms.border_contrast_low,
              t.atoms.bg_contrast_25,
            ]}>
            <Text style={[a.text_lg, a.font_bold, a.pb_sm]}>
              <Trans>OpenCollective</Trans>
            </Text>
            <Text style={[a.leading_snug, t.atoms.text_contrast_medium]}>
              <Trans>
                Support the Blacksky community through OpenCollective. Your
                contributions help us maintain and improve the platform.
              </Trans>
            </Text>
            <View style={[a.pt_md]}>
              <InlineLinkText
                to="https://opencollective.com/blacksky"
                label={_(msg`Donate on OpenCollective`)}>
                <Trans>Donate on OpenCollective</Trans>
              </InlineLinkText>
            </View>
          </View>

          <SupportStripeCheckout />
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}
