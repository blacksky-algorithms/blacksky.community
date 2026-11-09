import {renderHook} from '@testing-library/react-native'

import {useForceDarkTheme, useThemeName} from '#/alf/util/useColorModeTheme'

const mockColorMode = {current: 'system'}

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: () => 'light',
}))
jest.mock('#/alf/themes', () => ({light: {}, dark: {}, dim: {}}))
jest.mock('#/state/shell', () => ({
  useThemePrefs: () => ({colorMode: mockColorMode.current}),
}))

describe('useThemeName', () => {
  afterEach(() => {
    mockColorMode.current = 'system'
  })

  it('follows the system when nothing forces dark', () => {
    expect(renderHook(() => useThemeName()).result.current).toBe('light')
  })

  it.each(['system', 'light'])(
    'returns dim while forced, with colorMode %s',
    colorMode => {
      mockColorMode.current = colorMode
      const name = renderHook(() => useThemeName())
      const forced = renderHook(() => useForceDarkTheme())
      name.rerender({})
      expect(name.result.current).toBe('dim')
      forced.unmount()
      name.rerender({})
      expect(name.result.current).toBe('light')
    },
  )

  it('stays forced until every caller unmounts', () => {
    const name = renderHook(() => useThemeName())
    const first = renderHook(() => useForceDarkTheme())
    const second = renderHook(() => useForceDarkTheme())
    first.unmount()
    name.rerender({})
    expect(name.result.current).toBe('dim')
    second.unmount()
    name.rerender({})
    expect(name.result.current).toBe('light')
  })
})
