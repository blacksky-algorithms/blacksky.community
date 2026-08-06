import {View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'

export function NavIndicator() {
  const insets = useSafeAreaInsets()
  return <View style={{height: insets.bottom}} />
}
