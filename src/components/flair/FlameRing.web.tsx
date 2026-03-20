import {memo} from 'react'
import {View} from 'react-native'

import {type FlairSpec} from '#/lib/flair/registry'

const flameRingSrc = require('./assets/flame-ring.webp') as string

function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

interface FlameRingProps {
  flair: FlairSpec
  size: number
  shape: 'circle' | 'square'
}

let FlameRing = ({flair, size, shape}: FlameRingProps): React.ReactNode => {
  const colors = flair.colors

  // <32px: static colored border
  if (size < 32) {
    const br = shape === 'circle' ? size / 2 : 3
    return (
      <View
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: br,
          borderWidth: 2,
          borderColor: colors[0],
          pointerEvents: 'none',
        }}
      />
    )
  }

  // >=32px: flame ring image with baked-in alpha transparency.
  // No mix-blend-mode needed — the WebP has a proper alpha channel.
  // The flame image is scaled up then clipped to a tight circle.
  const ringPad = size >= 64 ? 8 : 5
  const clipSize = size + ringPad * 2
  const imageScale = size >= 64 ? 1.45 : 1.35
  const imgSize = Math.round(size * imageScale)
  const imgOffset = Math.round((clipSize - imgSize) / 2)
  const isLarge = size >= 64

  return (
    <div
      style={{
        position: 'absolute',
        top: -ringPad,
        left: -ringPad,
        width: clipSize,
        height: clipSize,
        borderRadius: '50%',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}>
      {/* Warm glow */}
      {isLarge && (
        <div
          className="flair-glow"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            boxShadow: `inset 0 0 ${ringPad}px 2px ${hexAlpha(colors[1], 0.4)}`,
            animation: 'flairGlowPulse 2s ease-in-out infinite alternate',
          }}
        />
      )}

      {/* Primary flame layer: slow rotation */}
      <img
        className="flair-tendrils-a"
        src={flameRingSrc}
        alt=""
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: imgOffset,
          left: imgOffset,
          width: imgSize,
          height: imgSize,
          animation: 'flairRotate 8s linear infinite',
          willChange: 'transform',
        }}
      />

      {/* Secondary flame layer: counter-rotating, slight hue shift */}
      <img
        className="flair-tendrils-b"
        src={flameRingSrc}
        alt=""
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: imgOffset,
          left: imgOffset,
          width: imgSize,
          height: imgSize,
          opacity: isLarge ? 0.6 : 0.4,
          filter: 'hue-rotate(15deg)',
          animation: 'flairRotate 12s linear infinite reverse',
          willChange: 'transform',
        }}
      />

      {/* Third flame layer: different speed, brightness boost (large only) */}
      {isLarge && (
        <img
          className="flair-ring-rotate"
          src={flameRingSrc}
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: imgOffset,
            left: imgOffset,
            width: imgSize,
            height: imgSize,
            opacity: 0.35,
            filter: 'hue-rotate(-10deg) brightness(1.3)',
            animation: 'flairRotate 15s linear infinite',
            willChange: 'transform',
          }}
        />
      )}
    </div>
  )
}

FlameRing = memo(FlameRing)
export {FlameRing}
