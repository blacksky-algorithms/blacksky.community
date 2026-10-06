import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'

export function PrimaryButton({
  label,
  onPress,
  disabled,
  testID,
  variant = 'solid',
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  testID?: string
  variant?: 'solid' | 'outline'
}) {
  const t = useTheme()
  return (
    <Button
      label={label}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      color="primary"
      variant={variant}
      size="large"
      style={[
        a.w_full,
        {
          minHeight: 48,
          borderRadius: 999,
          backgroundColor: variant === 'solid' ? '#6060E9' : 'transparent',
          borderColor: '#8686ff',
          opacity: disabled ? 0.5 : 1,
        },
      ]}>
      <ButtonText
        style={[
          a.font_mono,
          {
            color: variant === 'solid' ? '#F8FAF9' : t.atoms.text.color,
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
