import {Text, View} from 'react-native'

/** Native WebViews cannot reproduce the Tile loader's service-worker isolation. */
export function TilesPrototypeScreen() {
  return (
    <View style={{padding: 24}}>
      <Text>Web Tiles are currently available in Blacksky for web only.</Text>
      <Text style={{marginTop: 12}}>
        This is intentional: the native host must be designed as a separate,
        capability-limited adapter before it can execute untrusted Tiles.
      </Text>
    </View>
  )
}
