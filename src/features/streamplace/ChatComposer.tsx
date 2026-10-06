import {useState} from 'react'
import {Pressable, TextInput, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {countGraphemes} from 'unicode-segmenter/grapheme'

import {atoms as a, useTheme} from '#/alf'
import {PaperPlaneVertical_Filled_Stroke2_Corner1_Rounded as PaperPlaneIcon} from '#/components/icons/PaperPlane'

const MAX_GRAPHEMES = 300

export function ChatComposer({
  onSend,
  disabled: notReady,
}: {
  onSend: (text: string) => void
  disabled?: boolean
}) {
  const {_} = useLingui()
  const t = useTheme()
  const [text, setText] = useState('')
  const trimmed = text.trim()
  const disabled =
    notReady || trimmed.length === 0 || countGraphemes(text) > MAX_GRAPHEMES

  const submit = () => {
    if (disabled) return
    setText('')
    onSend(trimmed)
  }

  return (
    <View
      style={[
        a.px_md,
        a.py_sm,
        a.flex_row,
        a.gap_sm,
        a.align_center,
        a.border_t,
        t.atoms.border_contrast_low,
      ]}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={_(msg`Send a message…`)}
        accessibilityLabel={_(msg`Chat message`)}
        accessibilityHint={_(msg`Press return to send`)}
        returnKeyType="send"
        submitBehavior="submit"
        placeholderTextColor={t.atoms.text_contrast_medium.color}
        style={[
          a.flex_1,
          a.px_md,
          a.py_sm,
          a.rounded_full,
          a.border,
          a.text_md,
          t.atoms.bg_contrast_25,
          t.atoms.border_contrast_low,
          t.atoms.text,
          {minHeight: 40},
        ]}
        onSubmitEditing={submit}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={_(msg`Send`)}
        accessibilityHint=""
        accessibilityState={{disabled}}
        onPress={submit}
        disabled={disabled}
        style={[
          a.rounded_full,
          a.align_center,
          a.justify_center,
          {
            width: 40,
            height: 40,
            backgroundColor: t.palette.primary_500,
            opacity: disabled ? 0.5 : 1,
          },
        ]}>
        <PaperPlaneIcon size="md" fill={t.palette.white} />
      </Pressable>
    </View>
  )
}
