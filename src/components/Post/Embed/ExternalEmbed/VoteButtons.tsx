import {Pressable, StyleSheet, View} from 'react-native'
import {useLingui} from '@lingui/react/macro'

import {type PollVoteValue} from '#/lib/api/poll'
import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'

const AGREE = '#61C554'
const DISAGREE = '#F40B42'

export function VoteButtons({
  onVote,
  disabled,
  pending,
  passLabel,
}: {
  onVote: (value: PollVoteValue) => void
  disabled?: boolean
  pending?: boolean
  passLabel?: string
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const idle = t.atoms.bg_contrast_25.backgroundColor
  const passColor = t.atoms.text_contrast_medium.color

  const options: {
    value: PollVoteValue
    label: string
    hint: string
    color: string
    border: string
    hover: string
  }[] = [
    {
      value: 'agree',
      label: l`Agree`,
      hint: l`Vote agree on this statement`,
      color: AGREE,
      border: AGREE,
      hover: 'rgba(97, 197, 84, 0.15)',
    },
    {
      value: 'disagree',
      label: l`Disagree`,
      hint: l`Vote disagree on this statement`,
      color: DISAGREE,
      border: DISAGREE,
      hover: 'rgba(244, 11, 66, 0.12)',
    },
    {
      value: 'pass',
      label: passLabel ?? l`Pass`,
      hint: l`Pass on this statement`,
      color: passColor,
      border: t.atoms.border_contrast_low.borderColor,
      hover: t.atoms.bg_contrast_50.backgroundColor,
    },
  ]

  return (
    <View style={styles.row} onStartShouldSetResponder={() => true}>
      {options.map(option => (
        <Pressable
          key={option.value}
          testID={`pollVote-${option.value}`}
          style={({hovered}: {hovered?: boolean}) => [
            styles.button,
            {
              borderColor: option.border,
              backgroundColor: hovered ? option.hover : idle,
            },
          ]}
          onPress={() => onVote(option.value)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={option.label}
          accessibilityHint={option.hint}
          accessibilityState={{disabled: !!disabled}}>
          <Text style={[a.text_sm, a.font_semi_bold, {color: option.color}]}>
            {pending ? '...' : option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
  },
})
