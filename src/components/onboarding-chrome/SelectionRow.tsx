import {Pressable, View} from 'react-native'

import {atoms as a, useTheme} from '#/alf'
import {CheckThick_Stroke2_Corner0_Rounded as Checkmark} from '#/components/icons/Check'
import {
  ChevronBottom_Stroke2_Corner0_Rounded as ChevronDown,
  ChevronTop_Stroke2_Corner0_Rounded as ChevronUp,
} from '#/components/icons/Chevron'
import {useChromeColors} from '#/components/onboarding-chrome/useChromeColors'
import {Text} from '#/components/Typography'

const CONTROL_SIZE = 24
const ICON_SLOT = 40

export function SelectionRow({
  mode,
  selected,
  expanded,
  onPress,
  title,
  description,
  subtitle,
  icon,
  testID,
  emphasize,
}: {
  mode: 'radio' | 'checkbox' | 'disclosure'
  selected: boolean
  expanded?: boolean
  onPress: () => void
  title: string
  description?: string
  subtitle?: string
  icon?: React.ReactNode
  testID?: string
  emphasize?: boolean
}) {
  const t = useTheme()
  const {accent, onAccent, accentSubtle} = useChromeColors()

  return (
    <Pressable
      testID={testID}
      accessibilityRole={mode === 'disclosure' ? 'button' : mode}
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={
        mode === 'disclosure' ? {expanded: !!expanded} : {selected}
      }
      aria-checked={mode === 'disclosure' ? undefined : selected}
      onPress={onPress}
      style={[
        a.flex_row,
        a.align_center,
        a.gap_md,
        a.rounded_sm,
        {paddingHorizontal: 12, paddingVertical: 10},
        selected && {backgroundColor: accentSubtle},
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
          style={[
            a.text_md,
            a.font_semi_bold,
            a.leading_tight,
            t.atoms.text,
            emphasize && {color: accent, fontWeight: '300', fontSize: 12},
          ]}>
          {title}
        </Text>
        {description != null ? (
          <Text
            style={[a.text_xs, a.leading_tight, {color: accent, marginTop: 2}]}>
            {description}
          </Text>
        ) : null}
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

      {mode === 'disclosure' ? (
        expanded ? (
          <ChevronUp
            width={CONTROL_SIZE}
            fill={t.palette.contrast_500}
            style={{flexShrink: 0}}
          />
        ) : (
          <ChevronDown
            width={CONTROL_SIZE}
            fill={t.palette.contrast_500}
            style={{flexShrink: 0}}
          />
        )
      ) : mode === 'radio' ? (
        <View
          style={[
            a.align_center,
            a.justify_center,
            a.rounded_full,
            {
              width: CONTROL_SIZE,
              height: CONTROL_SIZE,
              borderWidth: 2,
              borderColor: selected ? accent : t.palette.contrast_400,
              flexShrink: 0,
            },
          ]}>
          {selected ? (
            <View
              style={[
                a.rounded_full,
                {width: 12, height: 12, backgroundColor: accent},
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
              borderColor: selected ? accent : t.palette.contrast_400,
              backgroundColor: selected ? accent : 'transparent',
              flexShrink: 0,
            },
          ]}>
          {selected ? <Checkmark width={14} fill={onAccent} /> : null}
        </View>
      )}
    </Pressable>
  )
}
