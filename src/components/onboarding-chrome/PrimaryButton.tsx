import {atoms as a} from '#/alf'
import {Button, ButtonText} from '#/components/Button'

export function PrimaryButton({
  label,
  onPress,
  disabled,
  testID,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  testID?: string
}) {
  return (
    <Button
      label={label}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      color="primary"
      variant="solid"
      size="large"
      style={[a.w_full]}>
      <ButtonText
        style={[
          a.font_mono,
          {
            fontWeight: '300',
            fontSize: 14,
            textTransform: 'uppercase',
          },
        ]}>
        {label}
      </ButtonText>
    </Button>
  )
}
