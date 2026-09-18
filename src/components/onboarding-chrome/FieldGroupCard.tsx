import {type StyleProp, View, type ViewStyle} from 'react-native'

import {atoms as a} from '#/alf'
import {FIELD_BORDER} from '#/components/onboarding-chrome/InputGroup'

export function FieldGroupCard({
  children,
  style,
}: {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View
      style={[
        a.w_full,
        a.rounded_sm,
        {
          borderWidth: 1,
          borderColor: FIELD_BORDER,
          paddingHorizontal: 16,
          paddingVertical: 16,
        },
        style,
      ]}>
      {children}
    </View>
  )
}
