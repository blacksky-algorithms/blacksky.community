import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {atoms as a} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'

export function LiveOffline({onRetry}: {onRetry: () => void}) {
  const {_} = useLingui()
  return (
    <View
      style={[
        a.absolute,
        a.inset_0,
        a.align_center,
        a.justify_center,
        a.gap_md,
        {backgroundColor: 'rgba(0,0,0,0.7)'},
      ]}>
      <Text style={[a.text_md, {color: 'white'}]}>
        <Trans>This stream is offline</Trans>
      </Text>
      <Button
        label={_(msg`Try again`)}
        onPress={onRetry}
        size="small"
        color="secondary"
        variant="solid">
        <ButtonText>
          <Trans>Try again</Trans>
        </ButtonText>
      </Button>
    </View>
  )
}
