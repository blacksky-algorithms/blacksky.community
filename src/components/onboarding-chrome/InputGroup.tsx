import {forwardRef, useState} from 'react'
import {
  type KeyboardTypeOptions,
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native'

import {applyFonts, atoms as a, useAlf, useTheme} from '#/alf'
import {type Props as SVGIconProps} from '#/components/icons/common'
import {Text} from '#/components/Typography'

export const FIELD_BG = '#262644'
export const FIELD_BORDER = '#464985'
const PLACEHOLDER = '#7878A5'
const INPUT_TEXT_COLOR = '#F8FAF9'
const RADIUS = 8

export type InputGroupProps = {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  icon?: React.ComponentType<SVGIconProps>
  trailing?: React.ReactNode
  secureTextEntry?: boolean
  keyboardType?: KeyboardTypeOptions
  autoCapitalize?: TextInputProps['autoCapitalize']
  autoComplete?: TextInputProps['autoComplete']
  textContentType?: TextInputProps['textContentType']
  autoCorrect?: TextInputProps['autoCorrect']
  autoFocus?: boolean
  maxLength?: number
  returnKeyType?: TextInputProps['returnKeyType']
  blurOnSubmit?: boolean
  onSubmitEditing?: TextInputProps['onSubmitEditing']
  onFocus?: TextInputProps['onFocus']
  onBlur?: TextInputProps['onBlur']
  editable?: boolean
  onPress?: () => void
  uppercaseValue?: boolean
  supportingText?: string
  errorText?: string
  showDivider?: boolean
  testID?: string
}

export const InputGroup = forwardRef<TextInput, InputGroupProps>(
  function InputGroup(
    {
      label,
      value,
      onChangeText,
      placeholder,
      icon: Icon,
      trailing,
      secureTextEntry,
      keyboardType,
      autoCapitalize,
      autoComplete,
      textContentType,
      autoCorrect,
      autoFocus,
      maxLength,
      returnKeyType,
      blurOnSubmit,
      onSubmitEditing,
      onFocus,
      onBlur,
      editable = true,
      onPress,
      uppercaseValue = false,
      supportingText,
      errorText,
      showDivider = false,
      testID,
    },
    ref,
  ) {
    const {fonts} = useAlf()
    const t = useTheme()
    const [focused, setFocused] = useState(false)

    const hasError = errorText != null

    const borderColor = hasError
      ? t.palette.negative_500
      : focused
        ? t.palette.primary_500
        : 'transparent'

    const inputStyle = StyleSheet.flatten([
      a.flex_1,
      a.font_mono,
      {
        fontSize: 14,
        color: INPUT_TEXT_COLOR,
        padding: 0,
        textTransform: uppercaseValue ? ('uppercase' as const) : undefined,
      },
    ])
    applyFonts(inputStyle, fonts.family)

    const fieldStyle = [
      a.flex_row,
      a.align_center,
      a.gap_sm,
      {
        backgroundColor: FIELD_BG,
        borderColor,
        borderWidth: 1,
        borderRadius: RADIUS,
        paddingHorizontal: 12,
        paddingVertical: 14,
      },
    ]

    const iconEl = Icon ? (
      <Icon width={24} style={{color: PLACEHOLDER, flexShrink: 0}} />
    ) : null

    const input = (
      <TextInput
        ref={ref}
        testID={testID}
        accessibilityLabel={editable ? label : undefined}
        accessibilityHint={editable ? errorText : undefined}
        aria-invalid={hasError}
        accessibilityState={{disabled: !editable}}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ? placeholder.toUpperCase() : undefined}
        placeholderTextColor={PLACEHOLDER}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        textContentType={textContentType}
        autoCorrect={autoCorrect}
        autoFocus={autoFocus}
        maxLength={maxLength}
        returnKeyType={returnKeyType}
        blurOnSubmit={blurOnSubmit}
        onSubmitEditing={onSubmitEditing}
        editable={editable}
        pointerEvents={editable ? undefined : 'none'}
        onFocus={e => {
          setFocused(true)
          onFocus?.(e)
        }}
        onBlur={e => {
          setFocused(false)
          onBlur?.(e)
        }}
        style={inputStyle}
      />
    )

    const trailingEl = trailing ? (
      <View style={{flexShrink: 0}}>{trailing}</View>
    ) : null

    return (
      <View style={[a.w_full]}>
        <Text
          style={[
            a.font_mono,
            a.mb_sm,
            t.atoms.text,
            {
              fontSize: 12,
              fontWeight: '300',
              letterSpacing: -0.5,
              textTransform: 'uppercase',
            },
          ]}>
          {label}
        </Text>

        {editable ? (
          <View style={fieldStyle}>
            {iconEl}
            {input}
            {trailingEl}
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={errorText}
            onPress={onPress}
            style={fieldStyle}>
            {iconEl}
            {input}
            {trailingEl}
          </Pressable>
        )}

        {errorText != null ? (
          <Text
            style={[a.mt_xs, {fontSize: 12, color: t.palette.negative_500}]}>
            {errorText}
          </Text>
        ) : supportingText != null ? (
          <Text style={[a.mt_xs, t.atoms.text_contrast_medium, {fontSize: 12}]}>
            {supportingText}
          </Text>
        ) : null}

        {showDivider ? (
          <View
            style={{
              height: 1,
              marginTop: 16,
              marginBottom: 16,
              backgroundColor: FIELD_BORDER,
            }}
          />
        ) : null}
      </View>
    )
  },
)
