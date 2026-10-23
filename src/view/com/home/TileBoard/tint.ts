export type TileTint = {
  from: string
  to: string
  ring: string
  title: string
  body: string
}

/**
 * Stable hue per feed so a feed keeps the same colour forever — recognising a
 * tile by colour before reading its label is the point.
 */
export function hueForFeed(key: string): number {
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) % 360
}

export function tintForFeed(key: string, isDark: boolean): TileTint {
  const hue = hueForFeed(key)
  const to = (hue + 18) % 360
  if (isDark) {
    return {
      from: `hsl(${hue}, 38%, 17%)`,
      to: `hsl(${to}, 34%, 12%)`,
      ring: `hsl(${hue}, 30%, 22%)`,
      title: '#f4f4f6',
      body: 'rgba(244, 244, 246, 0.62)',
    }
  }
  return {
    from: `hsl(${hue}, 58%, 94%)`,
    to: `hsl(${to}, 52%, 89%)`,
    ring: `hsl(${hue}, 45%, 86%)`,
    title: '#16161a',
    body: 'rgba(22, 22, 26, 0.62)',
  }
}
