import {useLayoutEffect, useSyncExternalStore} from 'react'
import {type ColorSchemeName, useColorScheme} from 'react-native'
import {type ThemeName} from '@bsky.app/alf'

import {useThemePrefs} from '#/state/shell'
import {dark, dim, light} from '#/alf/themes'
import {IS_WEB} from '#/env'

let forceDarkCount = 0
const forceDarkListeners = new Set<() => void>()

function subscribeForceDark(listener: () => void) {
  forceDarkListeners.add(listener)
  return () => {
    forceDarkListeners.delete(listener)
  }
}

function changeForceDarkCount(delta: number) {
  forceDarkCount += delta
  forceDarkListeners.forEach(listener => listener())
}

export function useForceDarkTheme() {
  useLayoutEffect(() => {
    changeForceDarkCount(1)
    return () => changeForceDarkCount(-1)
  }, [])
}

export function useColorModeTheme(): ThemeName {
  const theme = useThemeName()

  useLayoutEffect(() => {
    updateDocument(theme)
  }, [theme])

  return theme
}

export function useThemeName(): ThemeName {
  const colorScheme = useColorScheme()
  const {colorMode, darkTheme} = useThemePrefs()
  const isForcedDark = useSyncExternalStore(
    subscribeForceDark,
    () => forceDarkCount > 0,
  )

  if (isForcedDark) return 'dim'

  return getThemeName(colorScheme, colorMode, darkTheme)
}

function getThemeName(
  colorScheme: ColorSchemeName,
  colorMode: 'system' | 'light' | 'dark',
  darkTheme?: ThemeName,
) {
  if (
    (colorMode === 'system' && colorScheme === 'light') ||
    colorMode === 'light'
  ) {
    return 'light'
  } else {
    return darkTheme ?? 'dim'
  }
}

function updateDocument(theme: ThemeName) {
  // @ts-ignore web only
  if (IS_WEB && typeof window !== 'undefined') {
    // @ts-ignore web only
    const html = window.document.documentElement
    // @ts-ignore web only
    const meta = window.document.querySelector('meta[name="theme-color"]')

    // remove any other color mode classes
    html.className = html.className.replace(/(theme)--\w+/g, '')
    html.classList.add(`theme--${theme}`)
    // set color to 'theme-color' meta tag
    meta?.setAttribute('content', getBackgroundColor(theme))
    window.localStorage.setItem('ALF_THEME', theme)
  }
}

export function getBackgroundColor(theme: ThemeName): string {
  switch (theme) {
    case 'light':
      return light.atoms.bg.backgroundColor
    case 'dark':
      return dark.atoms.bg.backgroundColor
    case 'dim':
      return dim.atoms.bg.backgroundColor
  }
}
