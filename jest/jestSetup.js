/* global jest */
import 'react-native-gesture-handler/jestSetup'

import {Platform} from 'react-native'
import {configure} from '@testing-library/react-native'

configure({asyncUtilTimeout: 20000})

// The jest-expo/ios preset sets Platform.OS but leaves Platform.Version
// undefined; native modules that parse it (e.g. bottom-sheet) crash without it.
Object.defineProperty(Platform, 'Version', {
  value: '17.0',
  configurable: true,
})

jest.mock('react-native-worklets', () =>
  require('react-native-worklets/src/mock'),
)

// Reanimated registers a CSS event handler on import, which its JS-only test
// module rejects, so nothing that imports Reanimated loads under Jest.
jest.mock('react-native-reanimated/lib/module/initializers.native', () => ({
  initializeReanimatedModule: () => {},
}))

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

// The library's own mock keeps the real contexts (e.g. SafeAreaInsetsContext,
// read by React Navigation) and supplies zero insets.
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn().mockResolvedValue({exists: true, size: 100}),
  deleteAsync: jest.fn(),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  createDownloadResumable: jest.fn(),
}))

jest.mock('expo-image-manipulator', () => {
  const createContext = () => {
    const image = {
      height: 100,
      release: jest.fn(),
      saveAsync: jest.fn().mockResolvedValue({
        height: 100,
        uri: 'file://resized-image',
        width: 100,
      }),
      width: 100,
    }
    return {
      crop: jest.fn(),
      release: jest.fn(),
      renderAsync: jest.fn().mockResolvedValue(image),
      resize: jest.fn(),
    }
  }

  return {
    ImageManipulator: {
      manipulate: jest.fn(createContext),
    },
    SaveFormat: {
      JPEG: 'jpeg',
      WEBP: 'webp',
    },
  }
})

jest.mock('expo-camera', () => ({
  Camera: {
    useCameraPermissions: jest.fn(() => [true]),
  },
}))

jest.mock('expo-media-library', () => ({
  __esModule: true, // this property makes it work
  default: jest.fn(),
  usePermissions: jest.fn(() => [true]),
  requestPermissionsAsync: jest.fn().mockResolvedValue({granted: true}),
  saveToLibraryAsync: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('expo-media-library/legacy', () => ({
  __esModule: true,
  default: jest.fn(),
  usePermissions: jest.fn(() => [true]),
  requestPermissionsAsync: jest.fn().mockResolvedValue({granted: true}),
  saveToLibraryAsync: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@bsky.app/expo-guess-language', () => ({
  guessLanguageSync: jest
    .fn()
    .mockReturnValue([{language: 'en', confidence: 1}]),
  guessLanguageAsync: jest
    .fn()
    .mockResolvedValue([{language: 'en', confidence: 1}]),
}))

jest.mock('sentry-expo', () => ({
  init: () => jest.fn(),
  Native: {
    ReactNativeTracing: jest.fn().mockImplementation(() => ({
      start: jest.fn(),
      stop: jest.fn(),
    })),
    ReactNavigationInstrumentation: jest.fn(),
  },
}))

jest.mock('crypto', () => ({}))

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
  nativeBuildVersion: '1',
}))

jest.mock('expo-modules-core', () => ({
  requireNativeModule: jest.fn().mockImplementation(
    /** @param {string} moduleName */
    moduleName => {
      if (moduleName === 'ExpoPlatformInfo') {
        return {
          getIsReducedMotionEnabled: () => false,
        }
      }
      if (moduleName === 'BottomSheet') {
        return {
          dismissAll: () => {},
        }
      }

      const expoModules = /** @type {Record<string, unknown> | undefined} */ (
        globalThis.expo?.modules
      )
      return expoModules?.[moduleName]
    },
  ),
  requireNativeViewManager: jest.fn().mockImplementation(_ => {
    return () => null
  }),
  createPermissionHook: () => () => [true],
}))

jest.mock('expo-localization', () => ({
  getCalendars: jest.fn(() => [{uses24hourClock: null}]),
  getLocales: () => [],
}))

// Lingui throws on any `t` outside an activated locale, so a message string is
// unreachable in tests until one is set — including the guard messages.
const {i18n} = require('@lingui/core')
i18n.loadAndActivate({locale: 'en', messages: {}})
