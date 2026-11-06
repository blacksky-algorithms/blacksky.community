import {useEffect} from 'react'
import {type DimensionValue, View} from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import {LinearGradient} from 'expo-linear-gradient'

import {atoms as a} from '#/alf'

const SWEEP_WIDTH = 120

/**
 * A light band that travels across the tile once on mount, staggered by
 * position so the board catches the light tile by tile.
 */
export function Sheen({
  index,
  width,
  isDark,
}: {
  index: number
  width: number
  isDark: boolean
}) {
  const x = useSharedValue(-SWEEP_WIDTH)

  useEffect(() => {
    x.set(-SWEEP_WIDTH)
    x.set(
      withDelay(
        200 + index * 110,
        withTiming(width + SWEEP_WIDTH, {
          duration: 900,
          easing: Easing.inOut(Easing.cubic),
        }),
      ),
    )
  }, [index, width, x])

  const style = useAnimatedStyle(() => ({
    transform: [{translateX: x.get()}, {rotateZ: '18deg'}],
  }))

  return (
    <View style={[a.absolute, a.inset_0, a.overflow_hidden]} pointerEvents="none">
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: -40,
            bottom: -40,
            width: SWEEP_WIDTH,
          },
          style,
        ]}>
        <LinearGradient
          colors={[
            'rgba(255,255,255,0)',
            isDark ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.75)',
            'rgba(255,255,255,0)',
          ]}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 0}}
          style={a.flex_1}
        />
      </Animated.View>
    </View>
  )
}

/**
 * Static specular highlight — a soft bloom in the top-left corner so the tile
 * reads as a lit surface rather than a flat fill.
 */
export function Gloss({isDark}: {isDark: boolean}) {
  return (
    <LinearGradient
      colors={[
        isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.85)',
        'rgba(255,255,255,0)',
      ]}
      start={{x: 0, y: 0}}
      end={{x: 0.75, y: 0.85}}
      style={[a.absolute, a.inset_0]}
      pointerEvents="none"
    />
  )
}

const TWINKLES: {
  top: DimensionValue
  left: DimensionValue
  size: number
  delay: number
}[] = [
  {top: '14%', left: '68%', size: 3, delay: 0},
  {top: '32%', left: '88%', size: 2, delay: 900},
  {top: '9%', left: '82%', size: 2.5, delay: 1800},
]

/** Slow, low-opacity glints. Hero tile only — everywhere would be noise. */
export function Twinkles({isDark}: {isDark: boolean}) {
  return (
    <View style={[a.absolute, a.inset_0]} pointerEvents="none">
      {TWINKLES.map((tw, i) => (
        <Twinkle key={i} {...tw} isDark={isDark} />
      ))}
    </View>
  )
}

function Twinkle({
  top,
  left,
  size,
  delay,
  isDark,
}: {
  top: DimensionValue
  left: DimensionValue
  size: number
  delay: number
  isDark: boolean
}) {
  const v = useSharedValue(0)

  useEffect(() => {
    v.set(
      withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(1, {duration: 700, easing: Easing.out(Easing.quad)}),
            withTiming(0, {duration: 900, easing: Easing.in(Easing.quad)}),
            withTiming(0, {duration: 1600}),
          ),
          -1,
          false,
        ),
      ),
    )
  }, [delay, v])

  const style = useAnimatedStyle(() => ({
    opacity: v.get() * (isDark ? 0.7 : 0.9),
    transform: [{scale: 0.6 + v.get() * 0.6}],
  }))

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top,
          left,
          width: size * 2,
          height: size * 2,
          borderRadius: size,
          backgroundColor: '#fff',
        },
        style,
      ]}
    />
  )
}
