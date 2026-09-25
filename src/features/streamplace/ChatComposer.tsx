import {useState} from 'react'
import {TextInput, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {countGraphemes} from 'unicode-segmenter/grapheme'

import {atoms as a} from '#/alf'
import {Button, ButtonText} from '#/components/Button'

const MAX_GRAPHEMES = 300

export function ChatComposer({onSend}: {onSend: (text: string) => void}) {
  const {_} = useLingui()
  const [text, setText] = useState('')
  const trimmed = text.trim()
  const disabled = trimmed.length === 0 || countGraphemes(text) > MAX_GRAPHEMES

  const submit = () => {
    if (disabled) return
    setText('')
    onSend(trimmed)
  }

  return (
    <View style={[a.p_sm, a.flex_row, a.gap_sm, a.align_end]}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={_(msg`Send a message…`)}
        accessibilityLabel={_(msg`Chat message`)}
        accessibilityHint={_(msg`Press return to send`)}
        multiline
        maxLength={MAX_GRAPHEMES * 2}
        style={[a.flex_1, a.p_sm, {minHeight: 40, maxHeight: 100}]}
        onSubmitEditing={submit}
      />
      <Button
        label={_(msg`Send`)}
        onPress={submit}
        disabled={disabled}
        size="small"
        color="primary"
        variant="solid">
        <ButtonText>{_(msg`Send`)}</ButtonText>
      </Button>
    </View>
  )
}
