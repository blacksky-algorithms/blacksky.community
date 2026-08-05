import {useEffect, useState} from 'react'
import {Pressable, View} from 'react-native'
import {ImageBackground} from 'expo-image'
import {LinearGradient} from 'expo-linear-gradient'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {useBrand} from '#/lib/community/BrandContext'
import {colors} from '#/lib/styles'
import {useKawaiiMode} from '#/state/preferences/kawaii'
import {ErrorBoundary} from '#/view/com/util/ErrorBoundary'
import {Logo} from '#/view/icons/Logo'
import {Logotype} from '#/view/icons/Logotype'
import {
  AppClipOverlay,
  postAppClipMessage,
} from '#/screens/StarterPack/StarterPackLandingScreen'
import {atoms as a, useTheme} from '#/alf'
import {AppLanguageDropdown} from '#/components/AppLanguageDropdown'
import {Button, ButtonText} from '#/components/Button'
import {TimesLarge_Stroke2_Corner0_Rounded as TimesIcon} from '#/components/icons/Times'
import {InlineLinkText} from '#/components/Link'
import {Text} from '#/components/Typography'

const cookoutImage = require('../../../../assets/splash-cookout.jpg')

const ACCENT_TEXT = '#1D1B20'

export const SplashScreen = ({
  onDismiss,
  onPressSignin,
  onPressCreateAccount,
}: {
  onDismiss?: () => void
  onPressSignin: () => void
  onPressCreateAccount: () => void
}) => {
  const {_} = useLingui()
  const brand = useBrand()
  const [showClipOverlay, setShowClipOverlay] = useState(false)

  useEffect(() => {
    const getParams = new URLSearchParams(window.location.search)
    const clip = getParams.get('clip')
    if (clip === 'true') {
      setShowClipOverlay(true)
      postAppClipMessage({
        action: 'present',
      })
    }
  }, [])

  const kawaii = useKawaiiMode()

  return (
    <ImageBackground
      accessibilityIgnoresInvertColors
      source={cookoutImage}
      contentFit="cover"
      contentPosition="top center"
      style={[a.h_full, a.flex_1]}>
      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']}
        style={[a.absolute, {top: 0, left: 0, right: 0, height: 280}]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.8)']}
        style={[a.absolute, {bottom: 0, left: 0, right: 0, height: 360}]}
        pointerEvents="none"
      />

      {onDismiss && (
        <Pressable
          accessibilityRole="button"
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            padding: 20,
            zIndex: 100,
          }}
          onPress={onDismiss}>
          <TimesIcon width={24} style={{color: colors.white}} />
        </Pressable>
      )}

      <View
        testID="noSessionView"
        style={[a.h_full, a.flex_1, a.align_center, a.justify_between]}>
        <ErrorBoundary>
          <View style={[a.align_center, {paddingTop: 72}]}>
            <Logo width={kawaii ? 300 : 68} fill={colors.white} />

            {!kawaii && (
              <View style={[a.pt_lg, a.pb_sm]}>
                <Logotype width={120} fill={colors.white} />
              </View>
            )}

            <Text
              style={[
                a.text_sm,
                a.font_mono,
                a.text_center,
                {color: colors.white, opacity: 0.9},
              ]}>
              {brand.messages.splashTagline}
            </Text>
          </View>

          <View
            testID="signinOrCreateAccount"
            style={[a.w_full, a.px_xl, a.gap_md, {maxWidth: 380}]}>
            <Button
              testID="createAccountButton"
              onPress={onPressCreateAccount}
              label={_(msg`Create new account`)}
              accessibilityHint={_(
                msg`Opens flow to create a new ${brand.web.title} account`,
              )}
              size="large"
              color="primary"
              shape="rectangular"
              style={[a.rounded_full, {backgroundColor: colors.green2}]}>
              <ButtonText
                style={[
                  a.font_mono,
                  {color: ACCENT_TEXT, textTransform: 'uppercase'},
                ]}>
                <Trans>Create account</Trans>
              </ButtonText>
            </Button>
            <Button
              testID="signInButton"
              onPress={onPressSignin}
              label={_(msg`Sign in`)}
              accessibilityHint={_(
                msg`Opens flow to sign in to your existing ${brand.web.title} account`,
              )}
              size="large"
              color="primary"
              variant="ghost"
              style={[a.bg_transparent]}
              hoverStyle={[a.bg_transparent]}>
              <ButtonText
                style={[
                  a.font_mono,
                  {color: colors.white, textTransform: 'uppercase'},
                ]}>
                <Trans>Sign in</Trans>
              </ButtonText>
            </Button>
            {brand.messages.migrationMessage && (
              <Text
                style={[
                  a.text_sm,
                  a.leading_snug,
                  a.text_center,
                  a.pt_md,
                  {color: colors.white, opacity: 0.85},
                ]}>
                {brand.messages.migrationMessage}
              </Text>
            )}
          </View>

          <Footer />
        </ErrorBoundary>
      </View>

      <AppClipOverlay
        visible={showClipOverlay}
        setIsVisible={setShowClipOverlay}
      />
    </ImageBackground>
  )
}

function Footer() {
  const t = useTheme()
  const {_} = useLingui()
  const brand = useBrand()

  return (
    <View
      style={[
        a.w_full,
        a.px_xl,
        a.py_lg,
        a.border_t,
        a.flex_row,
        a.align_center,
        a.flex_wrap,
        a.gap_xl,
        t.atoms.bg,
        t.atoms.border_contrast_medium,
      ]}>
      <InlineLinkText
        label={_(msg`Learn more about ${brand.web.title}`)}
        to={brand.web.links.about}>
        <Trans>About</Trans>
      </InlineLinkText>
      <InlineLinkText
        label={_(msg`${brand.web.title} Terms of Service`)}
        to={brand.web.links.tos}>
        <Trans>Terms</Trans>
      </InlineLinkText>
      <InlineLinkText
        label={_(msg`${brand.web.title} Privacy Policy`)}
        to={brand.web.links.privacy}>
        <Trans>Privacy</Trans>
      </InlineLinkText>
      <InlineLinkText
        label={_(msg`${brand.web.title} on GitHub`)}
        to={brand.web.links.github}>
        <Trans>GitHub</Trans>
      </InlineLinkText>

      <View style={a.flex_1} />

      <AppLanguageDropdown />
    </View>
  )
}
