import {memo} from 'react'
import {View} from 'react-native'

import {type FlairSpec} from '#/lib/flair/registry'
import {FlameRing} from '#/components/flair/FlameRing'
import {IS_WEB} from '#/env'

interface FlairRingProps {
  flair: FlairSpec
  size: number
  shape: 'circle' | 'square'
}

let FlairRing = ({flair, size, shape}: FlairRingProps): React.ReactNode => {
  switch (flair.renderer) {
    case 'flame':
      return <FlameRing flair={flair} size={size} shape={shape} />
    case 'pulse':
    case 'shimmer':
    case 'static':
    default: {
      // Fallback: static colored ring
      const borderRadius = shape === 'circle' ? size / 2 : size > 32 ? 8 : 3
      const borderWidth = IS_WEB ? 2 : size > 16 ? 2 : 1
      return (
        <View
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius,
            borderWidth,
            borderColor: flair.colors[0],
            pointerEvents: 'none',
          }}
        />
      )
    }
  }
}

FlairRing = memo(FlairRing)
export {FlairRing}
