import {useState} from 'react'
import {View} from 'react-native'
import {Image} from 'expo-image'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {isBlackskyBrand, useBrand} from '#/lib/community/BrandContext'
import {HITSLOP_10} from '#/lib/constants'
import {Nux, useNux, useSaveNux} from '#/state/queries/nuxs'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button} from '#/components/Button'
import {TimesLarge_Stroke2_Corner0_Rounded as XIcon} from '#/components/icons/Times'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {useDemoMode} from '#/storage/hooks/demo-mode'

const MIDTERMS_BANNER_ENDS_AT = Date.UTC(2026, 10, 11, 5)
const BANNER_BG = '#8B8BFF'
const BANNER_TEXT = '#13133B'

export function MidtermsCard() {
  const t = useTheme()
  const {_} = useLingui()
  const brand = useBrand()
  const [isBeforeElection] = useState(
    () => Date.now() < MIDTERMS_BANNER_ENDS_AT,
  )
  const {hasSession} = useSession()
  const [demoMode] = useDemoMode()
  const {nux, status} = useNux(Nux.Midterms2026Card)
  const {mutate: save, variables} = useSaveNux()

  if (
    !hasSession ||
    demoMode ||
    !isBlackskyBrand(brand) ||
    !isBeforeElection ||
    status !== 'ready' ||
    variables ||
    nux?.completed
  ) {
    return null
  }

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
          <View
            style={[
              a.w_full,
              a.flex_row,
              a.align_center,
              a.gap_md,
              {backgroundColor: BANNER_BG},
            ]}>
            <Image
              source={require('../../../assets/images/midterms_ballot_box.png')}
              accessibilityIgnoresInvertColors
              style={{width: 96, height: 82}}
            />
            <View style={[a.flex_1, a.gap_2xs, a.py_lg, a.pr_5xl]}>
              <Text style={[a.text_md, a.font_bold, {color: BANNER_TEXT}]}>
                <Trans>Follow the 2026 midterms</Trans>
              </Text>
              <Text style={[a.text_sm, {color: BANNER_TEXT}]}>
                <Trans>Pick your states →</Trans>
              </Text>
            </View>
          </View>
        </Link>
        <Button
          label={_(msg`Dismiss`)}
          hitSlop={HITSLOP_10}
          onPress={close}
          style={[a.absolute, {top: 14, right: 14}]}
          hoverStyle={[a.bg_transparent, {opacity: 0.5}]}>
          <XIcon size="xs" style={{color: BANNER_TEXT}} />
        </Button>
      </View>
    </View>
  )
}
