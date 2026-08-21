import {useLayoutEffect, useRef} from 'react'
import {Gesture, GestureDetector} from 'react-native-gesture-handler'
import Animated, {
  type AnimatedRef,
  measure,
  runOnJS,
  scrollTo,
  type SharedValue,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import {useHaptics} from '#/lib/haptics'
import {IS_IOS} from '#/env'

const AUTO_SCROLL_THRESHOLD = 50
const AUTO_SCROLL_SPEED = 4

export type GridRect = {x: number; y: number; w: number; h: number}

export type GridSpan = 1 | 2

export function packGridLayout(
  spans: GridSpan[],
  colW: number,
  rowH: number,
): GridRect[] {
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
    rects.push({x: col * colW, y: row * rowH, w: colW * span, h: rowH})
    if (span === 2 || col === 1) {
      row += 1
      col = 0
    } else {
      col = 1
    }
  }
  return rects
}

export function gridHeight(rects: GridRect[]): number {
  'worklet'
  let height = 0
  for (let i = 0; i < rects.length; i++) {
    const bottom = rects[i].y + rects[i].h
    if (bottom > height) height = bottom
  }
  return height
}

export function pointToSlot(
  rects: GridRect[],
  x: number,
  y: number,
  rowH: number,
): number {
  'worklet'
  if (rects.length === 0) return 0
  const maxRow = Math.floor(rects[rects.length - 1].y / rowH)
  const row = Math.max(0, Math.min(Math.floor(y / rowH), maxRow))
  let closest = -1
  let closestDistance = Infinity
  for (let i = 0; i < rects.length; i++) {
    if (Math.floor(rects[i].y / rowH) !== row) continue
    const distance = Math.abs(x - (rects[i].x + rects[i].w / 2))
    if (distance < closestDistance) {
      closest = i
      closestDistance = distance
    }
  }
  if (closest === -1) closest = rects.length - 1
  return closest
}

export function previewSlot(mySlot: number, from: number, to: number): number {
  'worklet'
  if (mySlot === from) return to
  if (from < to && mySlot > from && mySlot <= to) return mySlot - 1
  if (from > to && mySlot >= to && mySlot < from) return mySlot + 1
  return mySlot
}

interface GridDragState {
  slots: Record<string, number>
  // Rects are frozen at drag start and only re-derived on commit; tiles
  // translate between frozen rects so sizes never change under the finger.
  rects: GridRect[]
  activeKey: string
  dragStartSlot: number
  targetSlot: number
}

interface SortableGridProps<T> {
  data: T[]
  keyExtractor: (item: T) => string
  spanExtractor: (item: T, index: number) => GridSpan
  renderItem: (item: T, index: number) => React.ReactNode
  onReorder: (data: T[]) => void
  onDragStart?: () => void
  onDragEnd?: () => void
  editable: boolean
  colW: number
  rowH: number
  scrollRef?: AnimatedRef<Animated.ScrollView>
  scrollOffset?: SharedValue<number>
}

export function SortableGrid<T>({
  data,
  keyExtractor,
  spanExtractor,
  renderItem,
  onReorder,
  onDragStart,
  onDragEnd,
  editable,
  colW,
  rowH,
  scrollRef,
  scrollOffset,
}: SortableGridProps<T>) {
  const state = useSharedValue<GridDragState>({
    slots: Object.fromEntries(data.map((item, i) => [keyExtractor(item), i])),
    rects: packGridLayout(data.map(spanExtractor), colW, rowH),
    activeKey: '',
    dragStartSlot: -1,
    targetSlot: -1,
  })
  const dragX = useSharedValue(0)
  const dragY = useSharedValue(0)
  const scrollCompensation = useSharedValue(0)
  const trackedScrollY = useSharedValue(0)
  const isGestureActive = useSharedValue(false)
  const measureDone = useSharedValue(false)
  const gridRef = useAnimatedRef<Animated.View>()
  const gridContentOffset = useSharedValue(0)
  const viewportHeight = useSharedValue(0)
  const playHaptic = useHaptics()

  const skipNextSync = useRef(false)
  const currentKeys = data.map(item => keyExtractor(item)).join(',')
  useLayoutEffect(() => {
    if (skipNextSync.current) {
      skipNextSync.current = false
      return
    }
    if (isGestureActive.get()) {
      return
    }
    state.set({
      slots: Object.fromEntries(data.map((item, i) => [keyExtractor(item), i])),
      rects: packGridLayout(data.map(spanExtractor), colW, rowH),
      activeKey: '',
      dragStartSlot: -1,
      targetSlot: -1,
    })
    dragX.set(0)
    dragY.set(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKeys, colW, rowH])

  const handleReorder = (sortedKeys: string[]) => {
    const byKey = new Map(data.map(item => [keyExtractor(item), item]))
    onReorder(sortedKeys.map(key => byKey.get(key)!))
    onDragEnd?.()
  }

  useFrameCallback(() => {
    if (!isGestureActive.get()) return
    if (!scrollRef || !scrollOffset || !gridRef) return
    const s = state.get()
    if (s.activeKey === '') return

    if (!measureDone.get()) {
      const scrollM = measure(scrollRef as unknown as AnimatedRef<Animated.View>)
      const gridM = measure(gridRef)
      if (!scrollM || !gridM) return
      trackedScrollY.set(scrollOffset.get())
      gridContentOffset.set(gridM.pageY - scrollM.pageY + trackedScrollY.get())
      viewportHeight.set(scrollM.height)
      measureDone.set(true)
    }

    const rect = s.rects[s.dragStartSlot]
    const scrollY = trackedScrollY.get()
    const itemContentY = gridContentOffset.get() + rect.y + dragY.get()
    const itemViewportY = itemContentY - scrollY
    const itemBottomViewportY = itemViewportY + rect.h

    let scrollDelta = 0
    if (itemViewportY < AUTO_SCROLL_THRESHOLD) {
      scrollDelta = -AUTO_SCROLL_SPEED
    } else if (
      itemBottomViewportY >
      viewportHeight.get() - AUTO_SCROLL_THRESHOLD
    ) {
      scrollDelta = AUTO_SCROLL_SPEED
    }
    if (scrollDelta === 0) return
    if (scrollDelta < 0 && scrollY <= 0) return
    const maxY = gridHeight(s.rects)
    if (scrollDelta > 0 && rect.y + dragY.get() + rect.h >= maxY) return

    const newScrollY = Math.max(0, scrollY + scrollDelta)
    scrollTo(scrollRef, 0, newScrollY, false)
    trackedScrollY.set(newScrollY)
    scrollCompensation.set(scrollCompensation.get() + (newScrollY - scrollY))
  })

  // Render in stable key order so React never reorders native views —
  // Android ViewGroup child reordering causes a visual flash.
  const sortedData = [...data].sort((a, b) => {
    const ka = keyExtractor(a)
    const kb = keyExtractor(b)
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
  const height = gridHeight(
    packGridLayout(data.map(spanExtractor), colW, rowH),
  )

  return (
    <Animated.View ref={gridRef} style={{height}}>
      {sortedData.map(item => {
        const key = keyExtractor(item)
        const index = data.findIndex(d => keyExtractor(d) === key)
        return (
          <GridItem
            key={key}
            itemKey={key}
            itemCount={data.length}
            state={state}
            dragX={dragX}
            dragY={dragY}
            scrollCompensation={scrollCompensation}
            isGestureActive={isGestureActive}
            measureDone={measureDone}
            rowH={rowH}
            editable={editable}
            playHaptic={playHaptic}
            onCommitReorder={handleReorder}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}>
            {renderItem(item, index)}
          </GridItem>
        )
      })}
    </Animated.View>
  )
}

function GridItem({
  itemKey,
  itemCount,
  state,
  dragX,
  dragY,
  scrollCompensation,
  isGestureActive,
  measureDone,
  rowH,
  editable,
  playHaptic,
  onCommitReorder,
  onDragStart,
  onDragEnd,
  children,
}: {
  itemKey: string
  itemCount: number
  state: SharedValue<GridDragState>
  dragX: SharedValue<number>
  dragY: SharedValue<number>
  scrollCompensation: SharedValue<number>
  isGestureActive: SharedValue<boolean>
  measureDone: SharedValue<boolean>
  rowH: number
  editable: boolean
  playHaptic: ReturnType<typeof useHaptics>
  onCommitReorder: (sortedKeys: string[]) => void
  onDragStart?: () => void
  onDragEnd?: () => void
  children: React.ReactNode
}) {
  const gesture = Gesture.Pan()
    .enabled(editable)
    .activateAfterLongPress(150)
    .onStart(() => {
      'worklet'
      const s = state.get()
      const mySlot = s.slots[itemKey]
      state.set({
        ...s,
        activeKey: itemKey,
        dragStartSlot: mySlot,
        targetSlot: mySlot,
      })
      dragX.set(0)
      dragY.set(0)
      scrollCompensation.set(0)
      measureDone.set(false)
      isGestureActive.set(true)
      if (onDragStart) {
        runOnJS(onDragStart)()
      }
      runOnJS(playHaptic)()
    })
    .onChange(e => {
      'worklet'
      const s = state.get()
      const rect = s.rects[s.dragStartSlot]
      if (!rect) return
      dragX.set(e.translationX)
      dragY.set(e.translationY + scrollCompensation.get())
      const to = pointToSlot(
        s.rects,
        rect.x + rect.w / 2 + dragX.get(),
        rect.y + rect.h / 2 + dragY.get(),
        rowH,
      )
      if (to !== s.targetSlot) {
        state.set({...s, targetSlot: to})
        if (IS_IOS) {
          runOnJS(playHaptic)('Light')
        }
      }
    })
    .onEnd(() => {
      'worklet'
      isGestureActive.set(false)
      const s = state.get()
      const from = s.dragStartSlot
      const to = s.targetSlot
      const fromRect = s.rects[from]
      const toRect = s.rects[to]
      if (!fromRect || !toRect) return
      const snapX = toRect.x - fromRect.x
      const snapY = toRect.y - fromRect.y
      dragX.set(withTiming(snapX, {duration: 200}))
      dragY.set(
        withTiming(snapY, {duration: 200}, finished => {
          if (!finished) return
          if (to !== from) {
            const cur = state.get()
            const sorted: string[] = new Array(itemCount)
            for (const key in cur.slots) {
              sorted[cur.slots[key]] = key
            }
            const movedKey = sorted[from]
            sorted.splice(from, 1)
            sorted.splice(to, 0, movedKey)
            runOnJS(onCommitReorder)(sorted)
          } else {
            const cur = state.get()
            state.set({...cur, activeKey: '', dragStartSlot: -1, targetSlot: -1})
            dragX.set(0)
            dragY.set(0)
            if (onDragEnd) {
              runOnJS(onDragEnd)()
            }
          }
        }),
      )
    })
    .onFinalize(() => {
      'worklet'
      isGestureActive.set(false)
      const s = state.get()
      if (s.activeKey === itemKey && dragX.get() === 0 && dragY.get() === 0) {
        state.set({...s, activeKey: '', dragStartSlot: -1, targetSlot: -1})
        if (onDragEnd) {
          runOnJS(onDragEnd)()
        }
      }
    })

  const animatedStyle = useAnimatedStyle(() => {
    const s = state.get()
    const mySlot = s.slots[itemKey]
    if (mySlot === undefined) {
      return {}
    }
    const myRect = s.rects[mySlot]
    if (!myRect) {
      return {}
    }

    if (s.activeKey === itemKey) {
      const startRect = s.rects[s.dragStartSlot]
      return {
        width: startRect.w,
        height: startRect.h,
        transform: [
          {translateX: startRect.x + dragX.get()},
          {translateY: startRect.y + dragY.get()},
          {scale: withSpring(1.03)},
        ],
        zIndex: 999,
      }
    }

    if (s.activeKey !== '') {
      const shifted = previewSlot(mySlot, s.dragStartSlot, s.targetSlot)
      const rect = s.rects[shifted] ?? myRect
      return {
        width: myRect.w,
        height: myRect.h,
        transform: [
          {translateX: withTiming(rect.x, {duration: 200})},
          {translateY: withTiming(rect.y, {duration: 200})},
          {scale: withSpring(1)},
        ],
        zIndex: 0,
      }
    }

    return {
      width: withTiming(myRect.w, {duration: 200}),
      height: myRect.h,
      transform: [
        {translateX: withTiming(myRect.x, {duration: 200})},
        {translateY: withTiming(myRect.y, {duration: 200})},
        {scale: 1},
      ],
      zIndex: 0,
    }
  })

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{position: 'absolute', top: 0, left: 0}, animatedStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  )
}
