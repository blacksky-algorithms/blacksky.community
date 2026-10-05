import {useCallback} from 'react'
import {View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'

import {Nux, useNux, useSaveNux} from '#/state/queries/nuxs'
import {atoms as a, useTheme} from '#/alf'
import {Button} from '#/components/Button'
import {Poll_Stroke2_Corner0_Rounded as PollIcon} from '#/components/icons/Poll'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'

type Props = {
  onPress: () => void
  disabled?: boolean
}

export function SelectPollBtn({onPress, disabled}: Props) {
  const ax = useAnalytics()
  const {t: l} = useLingui()
  const t = useTheme()
  const nux = useNux(Nux.ComposerPoll)
  const {mutate: saveNux} = useSaveNux()
  const isNew = nux.status === 'ready' && !nux.nux?.completed

  const onPressAddPoll = useCallback(() => {
    ax.metric('composer:poll:open', {})
    if (isNew) {
      saveNux({id: Nux.ComposerPoll, data: undefined, completed: true})
    }
    onPress()
  }, [ax, isNew, saveNux, onPress])

  return (
    <View style={[a.relative]}>
      <Button
        testID="openPollBtn"
        onPress={onPressAddPoll}
        label={l({
          message: 'Add poll',
          comment:
            'Accessibility label for the button in the post composer that attaches a poll to the post.',
        })}
        accessibilityHint={l({
          message: 'Attaches a poll to this post',
          comment:
            'Accessibility hint announced after the poll button label, describing what activating it will do.',
        })}
        style={a.p_sm}
        variant="ghost"
        shape="round"
        color="primary"
        disabled={disabled}>
        <PollIcon size="lg" style={disabled && t.atoms.text_contrast_low} />
      </Button>
      {isNew && !disabled && (
        <View
          pointerEvents="none"
          style={[
            a.absolute,
            a.rounded_full,
            a.px_xs,
            {top: -2, right: -10, backgroundColor: t.palette.primary_500},
          ]}>
          <Text style={[a.text_2xs, a.font_bold, {color: t.palette.white}]}>
            <Trans comment="Short badge marking the poll button in the composer as a new feature">
              New
            </Trans>
          </Text>
        </View>
      )}
    </View>
  )
}
