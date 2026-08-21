import {useLayoutEffect, useRef} from 'react'
import {Gesture, GestureDetector} from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import {useHaptics} from '#/lib/haptics'

export type GridRect = {x: number; y: number; w: number; h: number; span: 1 | 2}

type GridState = {
  slots: Record<string, number>
  rects: GridRect[]
  activeKey: string
  dragStartSlot: number
}

export function packGridLayout(spans: (1 | 2)[], colW: number, rowH: number): GridRect[] {
  'worklet'
  const rects: GridRect[] = []
  let row = 0
  let col = 0
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i]
    if (span === 2 && col === 1) {
      row += 1
      col = 0
    }
    rects.push({x: col * colW, y: row * rowH, w: colW * span, h: rowH, span})
    if (span === 2) {
      row += 1
      col = 0
    } else if (col === 0) {
      col = 1
    } else {
      row += 1
      col = 0
    }
  }
  return rects
}

export function pointToSlot(rects: GridRect[], x: number, y: number, rowH: number) {
  'worklet'
  const row = Math.max(0, Math.floor(y / rowH))
  let closest = 0
  let closestDistance = Infinity
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i]
    if (Math.floor(rect.y / rowH) !== row) continue
    const distance = Math.abs(x - (rect.x + rect.w / 2))
    if (distance < closestDistance) {
      closest = i
      closestDistance = distance
    }
  }
  return Math.max(0, Math.min(closest, rects.length - 1))
}

export function reorderPinned<T>(pinned: T[], unpinned: T[], from: number, to: number) {
  const next = [...pinned]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return [...next, ...unpinned]
}

export function SortableGrid<T>({
  data,
  keyExtractor,
  spanExtractor,
  renderItem,
  onReorder,
  colW,
  rowH,
}: {
  data: T[]
  keyExtractor: (item: T) => string
  spanExtractor: (item: T, index: number) => 1 | 2
  renderItem: (item: T) => React.ReactNode
  onReorder: (items: T[]) => void
  colW: number
  rowH: number
}) {
  const spans = data.map(spanExtractor)
  const state = useSharedValue<GridState>({
    slots: Object.fromEntries(data.map((item, index) => [keyExtractor(item), index])),
    rects: packGridLayout(spans, colW, rowH),
    activeKey: '',
    dragStartSlot: -1,
  })
  const dragX = useSharedValue(0)
  const dragY = useSharedValue(0)
  const isGestureActive = useSharedValue(false)
  const skipNextSync = useRef(false)
  const deferredSync = useRef(false)
  const playHaptic = useHaptics()
  const keys = data.map(keyExtractor).join(',')

  useLayoutEffect(() => {
    if (skipNextSync.current) {
      skipNextSync.current = false
      return
    }
    if (isGestureActive.get()) {
      deferredSync.current = true
      return
    }
    state.set({
      slots: Object.fromEntries(data.map((item, index) => [keyExtractor(item), index])),
      rects: packGridLayout(data.map(spanExtractor), colW, rowH),
      activeKey: '',
      dragStartSlot: -1,
    })
  }, [colW, data, isGestureActive, keyExtractor, keys, rowH, spanExtractor, state])

  const commit = (sortedKeys: string[]) => {
    skipNextSync.current = true
    const byKey = new Map(data.map(item => [keyExtractor(item), item]))
    onReorder(sortedKeys.map(key => byKey.get(key)!))
  }

  const stableData = [...data].sort((a, b) => keyExtractor(a).localeCompare(keyExtractor(b)))
  return (
    <Animated.View style={{height: Math.max(0, ...state.get().rects.map(rect => rect.y + rect.h))}}>
      {stableData.map(item => (
        <GridItem
          key={keyExtractor(item)}
          itemKey={keyExtractor(item)}
          itemCount={data.length}
          state={state}
          dragX={dragX}
          dragY={dragY}
          isGestureActive={isGestureActive}
          rowH={rowH}
          onCommit={commit}
          onHaptic={playHaptic}
          renderItem={() => renderItem(item)}
        />
      ))}
    </Animated.View>
  )
}

function GridItem({itemKey, itemCount, state, dragX, dragY, isGestureActive, rowH, onCommit, onHaptic, renderItem}: any) {
  const gesture = Gesture.Pan().activateAfterLongPress(150)
    .onStart(() => {
      const current = state.get()
      state.set({...current, activeKey: itemKey, dragStartSlot: current.slots[itemKey]})
      dragX.set(0); dragY.set(0); isGestureActive.set(true); runOnJS(onHaptic)()
    })
    .onChange((event: any) => {
      dragX.set(event.translationX); dragY.set(event.translationY)
    })
    .onEnd(() => {
      const current = state.get()
      const from = current.dragStartSlot
      const rect = current.rects[from]
      const to = pointToSlot(current.rects, rect.x + rect.w / 2 + dragX.get(), rect.y + rect.h / 2 + dragY.get(), rowH)
      const sorted: string[] = new Array(itemCount)
      for (const key in current.slots) sorted[current.slots[key]] = key
      const [moved] = sorted.splice(from, 1); sorted.splice(to, 0, moved)
      const nextSlots = Object.fromEntries(sorted.map((key, index) => [key, index]))
      state.set({...current, slots: nextSlots, rects: current.rects, activeKey: '', dragStartSlot: -1})
      dragX.set(0); dragY.set(0); isGestureActive.set(false)
      if (from !== to) runOnJS(onCommit)(sorted)
    })
  const animatedStyle = useAnimatedStyle(() => {
    const current = state.get()
    const slot = current.slots[itemKey]
    const rect = current.rects[slot]
    if (!rect) return {}
    if (current.activeKey === itemKey) return {transform: [{translateX: rect.x + dragX.get()}, {translateY: rect.y + dragY.get()}], zIndex: 2}
    return {transform: [{translateX: withTiming(rect.x)}, {translateY: withTiming(rect.y)}]}
  })
  return <GestureDetector gesture={gesture}><Animated.View style={[{position: 'absolute', top: 0, left: 0}, animatedStyle]}>{renderItem()}</Animated.View></GestureDetector>
}
