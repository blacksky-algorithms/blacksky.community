import {useLingui} from '@lingui/react/macro'

import {atoms as a, useTheme} from '#/alf'
import {Button} from '#/components/Button'
import {CalendarDays_Stroke2_Corner0_Rounded as CalendarIcon} from '#/components/icons/CalendarDays'
import {useAnalytics} from '#/analytics'

export function SelectEventBtn({
  onPress,
  disabled,
}: {
  onPress: () => void
  disabled?: boolean
}) {
  const ax = useAnalytics()
  const {t: l} = useLingui()
  const t = useTheme()

  return (
    <Button
      testID="openEventBtn"
      onPress={() => {
        ax.metric('composer:event:open', {})
        onPress()
      }}
      label={l({
        message: 'Add event',
        comment:
          'Accessibility label for the button in the post composer that attaches an event to the post.',
      })}
      accessibilityHint={l`Attaches an event to this post`}
      style={a.p_sm}
      variant="ghost"
      shape="round"
      color="primary"
      disabled={disabled}>
      <CalendarIcon size="lg" style={disabled && t.atoms.text_contrast_low} />
    </Button>
  )
}
