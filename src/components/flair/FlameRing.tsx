import {memo} from 'react'
import {View} from 'react-native'

import {type FlairSpec} from '#/lib/flair/registry'

interface FlameRingProps {
  flair: FlairSpec
  size: number
  shape: 'circle' | 'square'
}

let FlameRing = ({flair, size, shape}: FlameRingProps): React.ReactNode => {
  const borderRadius = shape === 'circle' ? size / 2 : size > 32 ? 8 : 3

  return (
    <View
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius,
        borderWidth: size > 16 ? 2 : 1,
        borderColor: flair.colors[0],
        pointerEvents: 'none',
      }}
    />
  )
}

FlameRing = memo(FlameRing)
export {FlameRing}
