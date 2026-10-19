import {View} from 'react-native'
import {Image} from 'expo-image'
import {LinearGradient} from 'expo-linear-gradient'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {HITSLOP_10} from '#/lib/constants'
import {Nux, useNux, useSaveNux} from '#/state/queries/nuxs'
import {atoms as a, useTheme} from '#/alf'
import {Button} from '#/components/Button'
import {TimesLarge_Stroke2_Corner0_Rounded as XIcon} from '#/components/icons/Times'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'

export function MidtermsCard() {
  const t = useTheme()
  const {_} = useLingui()
  const {nux, status} = useNux(Nux.Midterms2026Card)
  const {mutate: save, variables} = useSaveNux()

  if (status !== 'ready' || variables || nux?.completed) return null

  const close = () => {
    save({id: Nux.Midterms2026Card, completed: true, data: undefined})
  }

  return (
    <View style={[a.w_full, a.p_lg, a.border_b, t.atoms.border_contrast_low]}>
      <View style={a.w_full}>
        <Link
          to={{screen: 'Midterms'}}
          label={_(msg`Follow the 2026 midterms and pick your states`)}
          style={[
            a.w_full,
            a.rounded_xl,
            a.curve_continuous,
            a.overflow_hidden,
          ]}>
          <LinearGradient
            colors={[t.palette.primary_200, t.palette.primary_50]}
            start={{x: 0, y: 0.5}}
            end={{x: 1, y: 0.5}}
            style={[a.w_full, a.flex_row, a.align_center, a.gap_md]}>
            <View style={[a.flex_1, a.gap_2xs, a.py_lg, a.pl_lg]}>
              <Text
                style={[
                  a.text_md,
                  a.font_bold,
                  {color: t.palette.primary_900},
                ]}>
                <Trans>Follow the 2026 midterms</Trans>
              </Text>
              <Text style={[a.text_sm, {color: t.palette.primary_800}]}>
                <Trans>Pick your states →</Trans>
              </Text>
            </View>
            <Image
              source={require('../../../assets/images/midterms_ballot.png')}
              accessibilityIgnoresInvertColors
              style={[a.self_end, {width: 82, height: 82}]}
            />
          </LinearGradient>
        </Link>
        <Button
          label={_(msg`Dismiss`)}
          hitSlop={HITSLOP_10}
          onPress={close}
          style={[a.absolute, {top: 14, right: 14}]}
          hoverStyle={[a.bg_transparent, {opacity: 0.5}]}>
          <XIcon size="xs" style={[t.atoms.text_contrast_low]} />
        </Button>
      </View>
    </View>
  )
}
