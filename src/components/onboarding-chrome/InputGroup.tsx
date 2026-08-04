import {
  type KeyboardTypeOptions,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native'

import {applyFonts, atoms as a, useAlf} from '#/alf'
import {type Props as SVGIconProps} from '#/components/icons/common'
import {Text} from '#/components/Typography'

const FIELD_BG = '#262644'
const FIELD_BORDER = '#464985'
const PLACEHOLDER = '#7878A5'
const LABEL_COLOR = '#F8FAF9'
const SUPPORTING_COLOR = '#9393B7'
const ERROR_COLOR = '#F40B42'
const RADIUS = 8

export type InputGroupPosition = 'top' | 'middle' | 'bottom' | 'single'

export function InputGroup({
  label,
  value,
  onChangeText,
  placeholder,
  icon: Icon,
  trailing,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  supportingText,
  errorText,
  position = 'single',
  testID,
}: {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  icon?: React.ComponentType<SVGIconProps>
  trailing?: React.ReactNode
  secureTextEntry?: boolean
  keyboardType?: KeyboardTypeOptions
  autoCapitalize?: TextInputProps['autoCapitalize']
  supportingText?: string
  errorText?: string
  position?: InputGroupPosition
  testID?: string
}) {
  const {fonts} = useAlf()

  const isTop = position === 'top' || position === 'single'
  const isBottom = position === 'bottom' || position === 'single'

  const inputStyle = StyleSheet.flatten([
    a.flex_1,
    a.font_mono,
    {
      fontSize: 14,
      color: LABEL_COLOR,
      padding: 0,
      textTransform: 'uppercase' as const,
    },
  ])
  applyFonts(inputStyle, fonts.family)

  return (
    <View style={[a.w_full]}>
      <Text
        style={[
          a.font_mono,
          a.mb_xs,
          {
            fontSize: 12,
            fontWeight: '300',
            letterSpacing: -0.5,
            textTransform: 'uppercase',
            color: LABEL_COLOR,
          },
        ]}>
        {label}
      </Text>

      <View
        style={[
          a.flex_row,
          a.align_center,
          a.gap_sm,
          {
            backgroundColor: FIELD_BG,
            borderColor: FIELD_BORDER,
            borderWidth: 1,
            borderBottomWidth: isBottom ? 1 : 0,
            borderTopLeftRadius: isTop ? RADIUS : 0,
            borderTopRightRadius: isTop ? RADIUS : 0,
            borderBottomLeftRadius: isBottom ? RADIUS : 0,
            borderBottomRightRadius: isBottom ? RADIUS : 0,
            paddingHorizontal: 12,
            paddingVertical: 14,
          },
        ]}>
        {Icon ? (
          <Icon width={24} style={{color: PLACEHOLDER, flexShrink: 0}} />
        ) : null}

        <TextInput
          testID={testID}
          accessibilityLabel={label}
          accessibilityHint=""
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ? placeholder.toUpperCase() : undefined}
          placeholderTextColor={PLACEHOLDER}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          style={inputStyle}
        />

        {trailing ? <View style={{flexShrink: 0}}>{trailing}</View> : null}
      </View>

      {errorText != null ? (
        <Text style={[a.mt_xs, {fontSize: 12, color: ERROR_COLOR}]}>
          {errorText}
        </Text>
      ) : supportingText != null ? (
        <Text style={[a.mt_xs, {fontSize: 12, color: SUPPORTING_COLOR}]}>
          {supportingText}
        </Text>
      ) : null}
    </View>
  )
}
