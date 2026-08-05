import {View} from 'react-native'
import Animated, {FadeIn, FadeOut} from 'react-native-reanimated'
import {ImageBackground} from 'expo-image'
import {LinearGradient} from 'expo-linear-gradient'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {useBrand} from '#/lib/community/BrandContext'
import {useHaptics} from '#/lib/haptics'
import {colors} from '#/lib/styles'
import {Logo} from '#/view/icons/Logo'
import {Logotype} from '#/view/icons/Logotype'
import {atoms as a} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'

const cookoutImage = require('../../../../assets/splash-cookout.jpg')

const ACCENT_TEXT = '#1D1B20'

export const SplashScreen = ({
  onPressSignin,
  onPressCreateAccount,
}: {
  onPressSignin: () => void
  onPressCreateAccount: () => void
}) => {
  const {_} = useLingui()
  const brand = useBrand()
  const playHaptic = useHaptics()

  return (
    <ImageBackground
      accessibilityIgnoresInvertColors
      source={cookoutImage}
      contentFit="cover"
      contentPosition="top center"
      style={[a.flex_1]}>
      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']}
        style={[a.absolute, {top: 0, left: 0, right: 0, height: 260}]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.75)']}
        style={[a.absolute, {bottom: 0, left: 0, right: 0, height: 320}]}
        pointerEvents="none"
      />

      <Animated.View
        entering={FadeIn.duration(90)}
        exiting={FadeOut.duration(90)}
        style={[a.flex_1]}>
        <View
          style={[a.justify_center, a.align_center, {gap: 8, paddingTop: 70}]}>
          <Logo width={64} fill="white" />
          <Logotype width={88} fill="white" />
          <Text
            style={[
              a.text_sm,
              a.font_mono,
              a.text_center,
              a.pt_sm,
              {color: colors.white, opacity: 0.9},
            ]}>
            {brand.messages.splashTagline}
          </Text>
        </View>

        <View style={[a.flex_1]} />

        <View
          testID="signinOrCreateAccount"
          style={[a.px_xl, a.gap_md, a.pb_5xl]}>
          <Button
            testID="createAccountButton"
            onPress={() => {
              onPressCreateAccount()
              playHaptic('Light')
            }}
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
            onPress={() => {
              onPressSignin()
              playHaptic('Light')
            }}
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
        </View>
      </Animated.View>
    </ImageBackground>
  )
}
