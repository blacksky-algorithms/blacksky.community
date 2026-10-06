import {ScrollView, View} from 'react-native'

import {useIsKeyboardVisible} from '#/lib/hooks/useIsKeyboardVisible'
import {atoms as a, useTheme} from '#/alf'

export function Screen({children}: React.PropsWithChildren) {
  const t = useTheme()
  const [keyboardVisible] = useIsKeyboardVisible()
  return (
    <ScrollView
      style={[a.flex_1, t.atoms.bg]}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: 0,
        paddingBottom: keyboardVisible ? 300 : 24,
      }}>
      <View
        style={[
          a.flex_1,
          a.w_full,
          a.self_center,
          {maxWidth: 420, paddingHorizontal: 24, paddingTop: 12},
        ]}>
        {children}
      </View>
    </ScrollView>
  )
}

export function Footer({children}: React.PropsWithChildren) {
  return (
    <View style={[a.gap_md, {marginTop: 'auto', paddingTop: 24}]}>
      {children}
    </View>
  )
}
