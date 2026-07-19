import {useCallback} from 'react'
import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {useBrand} from '#/lib/community/BrandContext'
import {useOpenLink} from '#/lib/hooks/useOpenLink'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'

// Stripe's embedded checkout can't run in React Native, so on native we hand
// card donors off to the hosted web support page in a browser instead.
export function SupportStripeCheckout() {
  const {_} = useLingui()
  const t = useTheme()
  const brand = useBrand()
  const openLink = useOpenLink()

  const contribute = brand.web.links.contribute
  const supportUrl = contribute?.startsWith('http')
    ? contribute
    : `${brand.web.domains.main.replace(/\/$/, '')}${contribute ?? '/support'}`

  const onPress = useCallback(() => {
    void openLink(supportUrl)
  }, [openLink, supportUrl])

  return (
    <View
      style={[
        a.p_lg,
        a.rounded_md,
        a.border,
        t.atoms.border_contrast_low,
        t.atoms.bg_contrast_25,
        a.gap_md,
      ]}>
      <Text style={[a.text_lg, a.font_bold]}>
        <Trans>Support with Card</Trans>
      </Text>
      <Text style={[a.leading_snug, t.atoms.text_contrast_medium]}>
        <Trans>
          Make a one-time or recurring card contribution on the web. This will
          open in your browser.
        </Trans>
      </Text>
      <Button
        label={_(msg`Support with Card`)}
        size="large"
        variant="solid"
        color="primary"
        onPress={onPress}>
        <ButtonText>
          <Trans>Support with Card</Trans>
        </ButtonText>
      </Button>
    </View>
  )
}

export default SupportStripeCheckout
