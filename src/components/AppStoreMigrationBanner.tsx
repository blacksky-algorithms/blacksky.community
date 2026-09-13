import {useState} from 'react'
import {Linking, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import * as Updates from 'expo-updates'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'
import {IS_IOS} from '#/env'

const APP_STORE_URL = 'itms-apps://apps.apple.com/app/id6776276281'

export function AppStoreMigrationBanner() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const {_} = useLingui()
  const [hidden, setHidden] = useState(false)
  if (!IS_IOS || Updates.channel !== 'testflight' || hidden) {
    return null
  }
  return (
    <View
      style={[
        a.absolute,
        a.left_0,
        a.right_0,
        a.mx_lg,
        a.p_lg,
        a.rounded_md,
        a.shadow_lg,
        a.gap_sm,
        a.border,
        t.atoms.bg,
        t.atoms.border_contrast_low,
        t.atoms.shadow_lg,
        {bottom: insets.bottom + 64},
      ]}>
      <Text style={[a.text_md, a.font_bold]}>
        <Trans>Blacksky is now on the App Store!</Trans>
      </Text>
      <Text style={[a.text_sm, a.leading_snug, t.atoms.text_contrast_medium]}>
        <Trans>
          This TestFlight beta will stop receiving updates. Switch to the App
          Store version — your account and data carry over automatically.
        </Trans>
      </Text>
      <View style={[a.flex_row, a.gap_sm, a.pt_xs]}>
        <Button
          label={_(msg`Get the App Store version`)}
          color="primary"
          size="small"
          onPress={() => {
            void Linking.openURL(APP_STORE_URL)
          }}>
          <ButtonText>
            <Trans>Update now</Trans>
          </ButtonText>
        </Button>
        <Button
          label={_(msg`Not now`)}
          color="secondary"
          size="small"
          onPress={() => setHidden(true)}>
          <ButtonText>
            <Trans>Not now</Trans>
          </ButtonText>
        </Button>
      </View>
    </View>
  )
}
