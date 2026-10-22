import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {Button, ButtonText} from '#/components/Button'
import {useWatchStreamplace} from '../useStreamplace'

export function LiveWatchButton({url}: {url: string}) {
  const {_} = useLingui()
  const watch = useWatchStreamplace()
  return (
    <Button
      label={_(msg`Live now, watch on Streamplace`)}
      size="tiny"
      color="negative"
      onPress={e => {
        e.preventDefault()
        e.stopPropagation()
        watch(url)
      }}>
      <ButtonText>
        <Trans>LIVE · Watch</Trans>
      </ButtonText>
    </Button>
  )
}
