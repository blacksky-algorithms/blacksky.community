import {Pressable, View} from 'react-native'

import {colors} from '#/lib/styles'
import {atoms as a, useTheme} from '#/alf'
import {CheckThick_Stroke2_Corner0_Rounded as Checkmark} from '#/components/icons/Check'
import {Text} from '#/components/Typography'

const LIME = colors.green2
const CONTROL_SIZE = 24
const ICON_SLOT = 40
const SELECTED_ROW_BG = 'rgba(210, 252, 81, 0.08)'

export function SelectionRow({
  mode,
  selected,
  onPress,
  title,
  subtitle,
  icon,
  testID,
}: {
  mode: 'radio' | 'checkbox'
  selected: boolean
  onPress: () => void
  title: string
  subtitle?: string
  icon?: React.ReactNode
  testID?: string
}) {
  const t = useTheme()

  return (
    <Pressable
      testID={testID}
      accessibilityRole={mode}
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{selected}}
      aria-checked={selected}
      onPress={onPress}
      style={[
        a.flex_row,
        a.align_center,
        a.gap_md,
        a.rounded_sm,
        {paddingHorizontal: 12, paddingVertical: 10},
        selected && {backgroundColor: SELECTED_ROW_BG},
      ]}>
      {icon != null ? (
        <View
          style={[
            a.align_center,
            a.justify_center,
            {width: ICON_SLOT, height: ICON_SLOT, flexShrink: 0},
          ]}>
          {icon}
        </View>
      ) : null}

      <View style={[a.flex_1]}>
        <Text
          style={[a.text_md, a.font_semi_bold, a.leading_tight, t.atoms.text]}>
          {title}
        </Text>
        {subtitle != null ? (
          <Text
            style={[
              a.text_xs,
              a.leading_tight,
              t.atoms.text_contrast_medium,
              {marginTop: 2},
            ]}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {mode === 'radio' ? (
        <View
          style={[
            a.align_center,
            a.justify_center,
            a.rounded_full,
            {
              width: CONTROL_SIZE,
              height: CONTROL_SIZE,
              borderWidth: 2,
              borderColor: selected ? LIME : t.palette.contrast_400,
              flexShrink: 0,
            },
          ]}>
          {selected ? (
            <View
              style={[
                a.rounded_full,
                {width: 12, height: 12, backgroundColor: LIME},
              ]}
            />
          ) : null}
        </View>
      ) : (
        <View
          style={[
            a.align_center,
            a.justify_center,
            {
              width: CONTROL_SIZE,
              height: CONTROL_SIZE,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: selected ? LIME : t.palette.contrast_400,
              backgroundColor: selected ? LIME : 'transparent',
              flexShrink: 0,
            },
          ]}>
          {selected ? <Checkmark width={14} fill={colors.black} /> : null}
        </View>
      )}
    </Pressable>
  )
}
