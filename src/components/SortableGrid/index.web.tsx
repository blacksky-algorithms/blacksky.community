import {View} from 'react-native'

import {
  gridHeight,
  type GridSpan,
  packGridLayout,
} from './layout'

export * from './layout'

/**
 * Web version renders the packed grid statically — drag reorder is
 * native-only for now; web edits order via the SavedFeeds screen.
 * See the native implementation for the gesture layer.
 */
export function SortableGrid<T>({
  data,
  keyExtractor,
  spanExtractor,
  renderItem,
  colW,
  rowH,
}: {
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
  scrollRef?: unknown
  scrollOffset?: unknown
}) {
  const rects = packGridLayout(data.map(spanExtractor), colW, rowH)
  return (
    <View style={{height: gridHeight(rects)}}>
      {data.map((item, index) => {
        const rect = rects[index]
        return (
          <View
            key={keyExtractor(item)}
            style={{
              position: 'absolute',
              left: rect.x,
              top: rect.y,
              width: rect.w,
              height: rect.h,
            }}>
            {renderItem(item, index)}
          </View>
        )
      })}
    </View>
  )
}
