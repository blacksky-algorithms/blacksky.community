import {useEffect, useState} from 'react'
import {Linking, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {TimesLarge_Stroke2_Corner0_Rounded as XIcon} from '#/components/icons/Times'
import {shouldShowTestFlightAppStoreMigrationBanner} from '#/components/TestFlightAppStoreMigrationBannerGate'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {IS_IOS, IS_TESTFLIGHT, RELEASE_VERSION} from '#/env'

const APP_STORE_URL =
  'https://apps.apple.com/app/blacksky-community/id6776276281'

const isEligible = shouldShowTestFlightAppStoreMigrationBanner({
  isIOS: IS_IOS,
  isTestFlight: IS_TESTFLIGHT,
  releaseVersion: RELEASE_VERSION,
})

export function TestFlightAppStoreMigrationBanner() {
  const t = useTheme()
  const {_} = useLingui()
  const ax = useAnalytics()
  const {top} = useSafeAreaInsets()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (isEligible) {
      ax.metric('testflightMigration:bannerDisplayed', {})
    }
  }, [ax])

  if (!isEligible || dismissed) return null

  return (
    <View
      style={[
        a.absolute,
        a.px_md,
        a.pb_sm,
        {top: 0, left: 0, right: 0, zIndex: 10, paddingTop: top + 8},
      ]}>
      <View
        style={[
          a.flex_row,
          a.align_center,
          a.gap_md,
          a.p_md,
          a.rounded_xl,
          a.curve_continuous,
          a.border,
          t.atoms.bg_contrast_25,
          {borderColor: t.palette.primary_500},
        ]}>
        <Text style={[a.flex_1, a.text_sm, a.font_bold]}>
          <Trans>Update to the App Store installation</Trans>
        </Text>
        <Button
          label={_(msg`Update`)}
          color="primary"
          size="small"
          onPress={() => {
            ax.metric('testflightMigration:updatePressed', {})
            void Linking.openURL(APP_STORE_URL)
          }}>
          <ButtonText>
            <Trans>Update</Trans>
          </ButtonText>
        </Button>
        <Button
          label={_(msg`Dismiss update banner`)}
          size="tiny"
          shape="round"
          onPress={() => setDismissed(true)}>
          <XIcon size="xs" style={t.atoms.text_contrast_medium} />
        </Button>
      </View>
    </View>
  )
}
