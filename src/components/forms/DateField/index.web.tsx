import {forwardRef, useCallback, useImperativeHandle, useRef} from 'react'
import {StyleSheet, type TextInput, type TextInputProps} from 'react-native'
// @ts-expect-error untyped
import {unstable_createElement} from 'react-native-web'

import {type DateFieldProps} from '#/components/forms/DateField/types'
import {toSimpleDateString} from '#/components/forms/DateField/utils'
import * as TextField from '#/components/forms/TextField'
import {CalendarDays_Stroke2_Corner0_Rounded as CalendarDays} from '#/components/icons/CalendarDays'

export * as utils from '#/components/forms/DateField/utils'
export const LabelText = TextField.LabelText

const InputBase = forwardRef<HTMLInputElement, TextInputProps>(
  ({style, ...props}, ref) => {
    return unstable_createElement('input', {
      ...props,
      ref,
      type: 'date',
      style: [
        StyleSheet.flatten(style),
        {
          background: 'transparent',
          border: 0,
        },
      ],
    })
  },
)

InputBase.displayName = 'InputBase'

const Input = TextField.createInput(InputBase as unknown as typeof TextInput)

export function DateField({
  value,
  inputRef,
  onChangeDate,
  onConfirm,
  label,
  isInvalid,
  testID,
  accessibilityHint,
  maximumDate,
  minimumDate,
}: DateFieldProps) {
  const input = useRef<HTMLInputElement>(null)

  /*
   * On native, focusing the field opens its picker. The browser only opens one
   * from a user gesture and not on focus alone, so ask for it; where that is
   * refused or unsupported the field is still focused and can be typed into.
   */
  useImperativeHandle(
    inputRef,
    () => ({
      focus: () => {
        input.current?.focus()
        try {
          input.current?.showPicker()
        } catch {}
      },
      blur: () => input.current?.blur(),
    }),
    [],
  )

  const handleOnChange = useCallback(
    (e: any) => {
      const date = e.target.valueAsDate || e.target.value

      if (date) {
        const formatted = toSimpleDateString(date)
        onChangeDate(formatted)
        onConfirm?.(formatted)
      }
    },
    [onChangeDate, onConfirm],
  )

  return (
    <TextField.Root isInvalid={isInvalid}>
      <TextField.Icon icon={CalendarDays} />
      <Input
        value={value === '' ? '' : toSimpleDateString(value)}
        inputRef={
          input as unknown as React.Ref<React.ComponentRef<typeof TextInput>>
        }
        label={label}
        onChange={handleOnChange}
        testID={testID}
        accessibilityHint={accessibilityHint}
        // @ts-expect-error not typed as <input type="date"> even though it is one
        max={maximumDate ? toSimpleDateString(maximumDate) : undefined}
        min={minimumDate ? toSimpleDateString(minimumDate) : undefined}
      />
    </TextField.Root>
  )
}
