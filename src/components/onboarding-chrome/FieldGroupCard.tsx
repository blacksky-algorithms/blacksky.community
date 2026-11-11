import {type StyleProp, View, type ViewStyle} from 'react-native'

import {atoms as a} from '#/alf'
import {useChromeColors} from '#/components/onboarding-chrome/useChromeColors'

export function FieldGroupCard({
  children,
  style,
}: {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const c = useChromeColors()
  return (
    <View
      style={[
        a.w_full,
        a.rounded_sm,
        {
          borderWidth: 1,
          borderColor: c.fieldBorder,
          paddingHorizontal: 16,
          paddingVertical: 16,
        },
        style,
      ]}>
      {children}
    </View>
  )
}
