// @ts-check
const pkg = require('./package.json')
const {getNativeQueries} = require('./src/components/ShareDialog/catalog.ts')

/**
 * @param {import('@expo/config-types').ExpoConfig} _config
 * @returns {{ expo: import('@expo/config-types').ExpoConfig }}
 */
module.exports = function (_config) {
  /**
   * App version number. Should be incremented as part of a release cycle.
   */
  const VERSION = pkg.version

  /**
   * Uses built-in Expo env vars
   *
   * @see https://docs.expo.dev/build-reference/variables/#built-in-environment-variables
   */
  const PLATFORM = process.env.EAS_BUILD_PLATFORM ?? 'web'

  const IS_TESTFLIGHT = process.env.EXPO_PUBLIC_ENV === 'testflight'
  const IS_PRODUCTION = process.env.EXPO_PUBLIC_ENV === 'production'
  const IS_E2E = process.env.EXPO_PUBLIC_ENV === 'e2e'
  const IS_DEV = !IS_TESTFLIGHT && !IS_PRODUCTION
  // True only when building on EAS (EAS sets EAS_BUILD=true / EAS_BUILD_PLATFORM).
  // Used to scope OTA update code signing to EAS builds so local dev doesn't
  // require the production update-signing private key.
  const IS_EAS_BUILD =
    process.env.EAS_BUILD === 'true' || !!process.env.EAS_BUILD_PLATFORM

  const ASSOCIATED_DOMAINS = [
    'applinks:blacksky.community',
    'applinks:staging.blacksky.community',
    'appclips:blacksky.community',
    'appclips:go.blacksky.community', // Allows App Clip to work when scanning QR codes
    // When testing local services, enter an ngrok (et al) domain here. It must use a standard HTTP/HTTPS port.
    ...(IS_DEV || IS_TESTFLIGHT ? [] : []),
  ]

  /*
   * EXPO_PUBLIC_ENV is also an EAS environment secret, which wins over a build
   * profile's env, so profiles opt out of OTA updates with their own flag. A
   * dev client with updates on rejects unsigned manifests from a local Metro.
   */
  const UPDATES_ENABLED =
    (IS_TESTFLIGHT || IS_PRODUCTION) && !process.env.DISABLE_UPDATES

  const USE_SENTRY = Boolean(process.env.SENTRY_AUTH_TOKEN)

  /**
   * Apps the share sheet can detect, generated from the share platform
   * catalog. Changing these needs a native build.
   */
  const SHARE_PLATFORM_QUERIES = getNativeQueries()

  const IOS_ICON_FILE =
    PLATFORM === 'web' // web build doesn't like .icon files
      ? './assets/app-icons/ios_icon_default_next.png'
      : IS_TESTFLIGHT
        ? './assets/app-icons/ios_icon_testflight.icon'
        : './assets/app-icons/ios_icon_default.icon'

  return {
    expo: {
      version: VERSION,
      name: 'Blacksky',
      slug: 'blacksky',
      scheme: ['blacksky', 'community.blacksky'],
      owner: 'blacksky-algorithms',
      runtimeVersion: {
        policy: 'appVersion',
      },
      icon: './assets/app-icons/ios_icon_default_next.png',
      userInterfaceStyle: 'automatic',
      primaryColor: '#006AFF',
      ios: {
        supportsTablet: false,
        bundleIdentifier: 'community.blacksky.app',
        buildNumber: process.env.BSKY_IOS_BUILD_NUMBER ?? '1',
        appleTeamId: process.env.EXPO_APPLE_TEAM_ID,
        config: {
          usesNonExemptEncryption: false,
        },
        icon: IOS_ICON_FILE,
        infoPlist: {
          UISupportedInterfaceOrientations: ['UIInterfaceOrientationPortrait'],
          'UISupportedInterfaceOrientations~ipad': [
            'UIInterfaceOrientationPortrait',
            'UIInterfaceOrientationPortraitUpsideDown',
            'UIInterfaceOrientationLandscapeLeft',
            'UIInterfaceOrientationLandscapeRight',
          ],
          CADisableMinimumFrameDurationOnPhone: true,
          UIBackgroundModes: ['remote-notification'],
          NSUserActivityTypes: ['INSendMessageIntent'],
          LSApplicationQueriesSchemes: SHARE_PLATFORM_QUERIES.iosSchemes,
          NSCameraUsageDescription:
            'Used for profile pictures, posts, and other kinds of content.',
          NSPhotoLibraryAddUsageDescription:
            'Used to save images to your library.',
          NSPhotoLibraryUsageDescription:
            'Used for profile pictures, posts, and other kinds of content',
          CFBundleSpokenName: 'Blacksky',
          CFBundleLocalizations: [
            'en',
            'an',
            'ast',
            'ca',
            'cs',
            'cy',
            'da',
            'de',
            'el',
            'eo',
            'es',
            'eu',
            'fi',
            'fr',
            'fy',
            'ga',
            'gd',
            'gl',
            'hi',
            'hu',
            'ia',
            'id',
            'it',
            'ja',
            'km',
            'ko',
            'ne',
            'nl',
            'pl',
            'pt-BR',
            'pt-PT',
            'ro',
            'ru',
            'sv',
            'th',
            'tr',
            'uk',
            'vi',
            'yue',
            'zh-Hans',
            'zh-Hant',
          ],
        },
        associatedDomains: ASSOCIATED_DOMAINS,
        entitlements: {
          'com.apple.developer.kernel.increased-memory-limit': true,
          'com.apple.developer.kernel.extended-virtual-addressing': true,
          'com.apple.security.application-groups': [
            'group.community.blacksky.app',
          ],
          'com.apple.developer.usernotifications.communication': true,
          // 'com.apple.developer.device-information.user-assigned-device-name': true,
          'com.apple.developer.declared-age-range': true,
        },
        privacyManifests: {
          NSPrivacyCollectedDataTypes: [
            {
              NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeCrashData',
              NSPrivacyCollectedDataTypeLinked: false,
              NSPrivacyCollectedDataTypeTracking: false,
              NSPrivacyCollectedDataTypePurposes: [
                'NSPrivacyCollectedDataTypePurposeAppFunctionality',
              ],
            },
            {
              NSPrivacyCollectedDataType:
                'NSPrivacyCollectedDataTypePerformanceData',
              NSPrivacyCollectedDataTypeLinked: false,
              NSPrivacyCollectedDataTypeTracking: false,
              NSPrivacyCollectedDataTypePurposes: [
                'NSPrivacyCollectedDataTypePurposeAppFunctionality',
              ],
            },
            {
              NSPrivacyCollectedDataType:
                'NSPrivacyCollectedDataTypeOtherDiagnosticData',
              NSPrivacyCollectedDataTypeLinked: false,
              NSPrivacyCollectedDataTypeTracking: false,
              NSPrivacyCollectedDataTypePurposes: [
                'NSPrivacyCollectedDataTypePurposeAppFunctionality',
              ],
            },
          ],
          NSPrivacyAccessedAPITypes: [
            {
              NSPrivacyAccessedAPIType:
                'NSPrivacyAccessedAPICategoryFileTimestamp',
              NSPrivacyAccessedAPITypeReasons: ['C617.1', '3B52.1', '0A2A.1'],
            },
            {
              NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
              NSPrivacyAccessedAPITypeReasons: ['E174.1', '85F4.1'],
            },
            {
              NSPrivacyAccessedAPIType:
                'NSPrivacyAccessedAPICategorySystemBootTime',
              NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
            },
            {
              NSPrivacyAccessedAPIType:
                'NSPrivacyAccessedAPICategoryUserDefaults',
              NSPrivacyAccessedAPITypeReasons: ['CA92.1', '1C8F.1'],
            },
          ],
        },
      },
      android: {
        icon: './assets/app-icons/android_icon_default_next.png',
        adaptiveIcon: {
          foregroundImage: './assets/icon-android-foreground.png',
          monochromeImage: './assets/icon-android-monochrome.png',
          backgroundColor: '#000000',
        },
        googleServicesFile: './google-services.json',
        package: 'community.blacksky.app',
        blockedPermissions: ['android.permission.ACCESS_FINE_LOCATION'],
        intentFilters: [
          {
            action: 'VIEW',
            autoVerify: true,
            data: [
              {
                scheme: 'https',
                host: 'blacksky.community',
              },
              ...(IS_DEV
                ? [
                    {
                      scheme: 'http',
                      host: 'localhost:19006',
                    },
                  ]
                : []),
            ],
            category: ['BROWSABLE', 'DEFAULT'],
          },
        ],
      },
      web: {
        bundler: 'metro',
        favicon: './assets/favicon.png',
      },
      updates: {
        url: 'https://updates.blacksky.community/manifest',
        enabled: true,
        fallbackToCacheTimeout: 30000,
        // OTA manifest code signing is only applied on EAS builds (which have the
        // private key as a managed secret). Local dev builds omit it so developers
        // don't need the production update-signing key just to serve a dev
        // manifest from Metro (`expo start` otherwise errors: "Must specify
        // --private-key-path ...").
        ...(IS_EAS_BUILD
          ? {
              codeSigningCertificate: './code-signing/certificate.pem',
              codeSigningMetadata: {
                keyid: 'main',
                alg: 'rsa-v1_5-sha256',
              },
            }
          : {}),
        checkAutomatically: 'NEVER',
        // Enables Updates.setUpdateURLAndRequestHeadersOverride at runtime, which
        // is how non-production builds retarget to a pull-request-<n> channel for
        // OTA previews (see useOTAUpdates.ts). It weakens the embedded-update
        // brick-recovery safety net, so it is kept off in production builds only.
        disableAntiBrickingMeasures: !IS_PRODUCTION,
        requestHeaders: {
          'expo-channel-name': IS_TESTFLIGHT ? 'testflight' : 'production',
        },
      },
      plugins: [
        [
          'expo-dev-client',
          {
            toolsButton: false,
            ...(IS_E2E
              ? {
                  launchMode: 'most-recent',
                  skipOnboarding: true,
                  showMenuAtLaunch: false,
                  ios: {
                    defaultLaunchURL: 'http://localhost:8081',
                  },
                  android: {
                    defaultLaunchURL: 'http://10.0.2.2:8081',
                  },
                }
              : {}),
          },
        ],
        'expo-asset',
        'expo-sharing',
        'expo-video',
        [
          'expo-camera',
          {
            microphonePermission: false,
            recordAudioAndroid: false,
          },
        ],
        [
          'expo-image-picker',
          {
            microphonePermission: false,
          },
        ],
        [
          'expo-localization',
          {
            /*
             * React Native 0.88 fixed Android RTL detection, which until then
             * always reported LTR. Opt out so Android keeps rendering LTR like
             * iOS, until RTL layouts get a proper QA pass.
             */
            supportsRTL: false,
          },
        ],
        'expo-web-browser',
        'expo-background-task',
        /*
         * Mods run in reverse registration order. Register the system bars
         * plugin before expo-navigation-bar, which removes
         * `android:windowLightNavigationBar` when no `style` is set.
         */
        './plugins/withAndroidStylesSystemBarsPlugin.js',
        ['expo-navigation-bar', {enforceContrast: false}],
        /*
         * Expo runs Gradle mods in reverse registration order. Keep Bitdrift
         * before Sentry so its plugins block is prepended after Sentry's apply
         * statement and remains at the top, as required by Gradle.
         */
        [
          '@bitdrift/react-native',
          {
            networkInstrumentation: true,
          },
        ],
        ...(USE_SENTRY
          ? [
              /** @type {[string, any]} */ ([
                '@sentry/react-native/expo',
                {
                  organization: 'blacksky-algorithms',
                  project: 'social-app',
                  url: 'https://sentry.io',
                  experimental_android: {
                    enableAndroidGradlePlugin: true,
                  },
                },
              ]),
            ]
          : []),
        [
          'expo-build-properties',
          {
            ios: {
              deploymentTarget: '16.4',
              buildReactNativeFromSource: true,
              ccacheEnabled: IS_DEV,
              cxxLanguageStandard: 'c++23',
              extraPods: [
                {
                  name: 'MCEmojiPicker',
                  git: 'https://github.com/bluesky-social/MCEmojiPicker.git',
                  branch: 'main',
                },
              ],
            },
            android: {
              compileSdkVersion: 37,
              targetSdkVersion: 36,
              buildToolsVersion: '37.0.0',
              buildReactNativeFromSource: true,
              enableMinifyInReleaseBuilds: true,
            },
          },
        ],
        [
          'expo-notifications',
          {
            icon: './assets/icon-android-notification.png',
            color: '#1185fe',
            sounds: PLATFORM === 'ios' ? ['assets/dm.aiff'] : ['assets/dm.mp3'],
          },
        ],
        './plugins/withIosEmbeddedBuildVersions.js',
        './plugins/starterPackAppClipExtension/withStarterPackAppClip.js',
        './plugins/withGradleJVMHeapSizeIncrease.js',
        './plugins/withAndroidManifestLargeHeapPlugin.js',
        './plugins/withAndroidManifestFCMIconPlugin.js',
        './plugins/withAndroidManifestIntentQueriesPlugin.js',
        [
          './plugins/withAndroidManifestSharePlatformQueriesPlugin.js',
          {
            packages: SHARE_PLATFORM_QUERIES.androidPackages,
            schemes: SHARE_PLATFORM_QUERIES.androidSchemes,
          },
        ],
        './plugins/withAndroidManifestOptionalCameraPlugin.js',
        './plugins/withAndroidStylesAccentColorPlugin.js',
        './plugins/withAndroidNoJitpackPlugin.js',
        './plugins/withIosCppLanguageStandard.js',
        './plugins/withAndroidPreparedTextLayoutPlugin.js',
        './plugins/withAndroidComposeVersion.js',
        './plugins/withIOSWindowingControlStyle.js',
        './plugins/shareExtension/withShareExtensions.js',
        './plugins/notificationsExtension/withNotificationsExtension.js',
        [
          'expo-font',
          {
            ios: {
              /*
               * Uncompressed TTF rather than WOFF2: iOS decompresses WOFF2
               * fonts on every launch, which took ~200 ms of the startup
               * critical path. These are the same Inter 4.001 fonts as the
               * WOFF2 files used on web.
               */
              fonts: [
                './assets/fonts/inter/InterVariable.ttf',
                './assets/fonts/inter/InterVariable-Italic.ttf',
              ],
            },
            android: {
              fonts: [
                './assets/fonts/inter/InterVariable.woff2',
                './assets/fonts/inter/InterVariable-Italic.woff2',
                './assets/fonts/inter/Inter-Regular.otf',
                './assets/fonts/inter/Inter-Italic.otf',
                './assets/fonts/inter/Inter-Medium.otf',
                './assets/fonts/inter/Inter-MediumItalic.otf',
                './assets/fonts/inter/Inter-SemiBold.otf',
                './assets/fonts/inter/Inter-SemiBoldItalic.otf',
                './assets/fonts/inter/Inter-Bold.otf',
                './assets/fonts/inter/Inter-BoldItalic.otf',
              ],
            },
          },
        ],
        [
          'expo-splash-screen',
          {
            ios: {
              enableFullScreenImage_legacy: true, // iOS only
              backgroundColor: '#8686FF', // matches the splash gradient's top stop
              image: './assets/splash/splash.png',
              resizeMode: 'cover',
              dark: {
                enableFullScreenImage_legacy: true, // iOS only
                backgroundColor: '#8686FF', // matches the splash gradient's top stop
                image: './assets/splash/splash-dark.png',
                resizeMode: 'cover',
              },
            },
            android: {
              backgroundColor: '#00007F', // Blacksky navy (matches adaptive icon background)
              image: './assets/splash/android-splash-logo-white.png',
              imageWidth: 102, // even division of 306px
              dark: {
                backgroundColor: '#000040', // darker Blacksky navy
                image: './assets/splash/android-splash-logo-white.png',
                imageWidth: 102,
              },
            },
          },
        ],
        [
          '@bsky.app/expo-dynamic-app-icon',
          {
            /**
             * Default set
             */
            default_light: {
              ios: './assets/app-icons/ios_icon_legacy_light.png',
              android: './assets/app-icons/android_icon_legacy_light.png',
              prerendered: true,
            },
            default_dark: {
              ios: './assets/app-icons/ios_icon_legacy_dark.png',
              android: './assets/app-icons/android_icon_legacy_dark.png',
              prerendered: true,
            },
          },
        ],
        ['expo-screen-orientation'],
        [
          'expo-location',
          {
            locationWhenInUsePermission:
              'Blacksky uses your approximate location via GPS to determine the content and features available in your region.',
            locationAlwaysAndWhenInUsePermission: false,
            locationAlwaysPermission: false,
            motionUsagePermission: false,
            locationFullAccuracyPermission: false,
            isIosReducedAccuracyByDefault: true,
          },
        ],
        [
          'expo-contacts',
          {
            contactsPermission:
              'I agree to allow Blacksky to use my contacts for friend discovery until I opt out.',
          },
        ],
      ],
      extra: {
        eas: {
          build: {
            experimental: {
              ios: {
                appExtensions: [
                  {
                    targetName: 'Share-with-Blacksky',
                    bundleIdentifier:
                      'community.blacksky.app.Share-with-Blacksky',
                    entitlements: {
                      'com.apple.security.application-groups': [
                        'group.community.blacksky.app',
                      ],
                    },
                  },
                  {
                    targetName: 'BlackskyNSE',
                    bundleIdentifier: 'community.blacksky.app.BlackskyNSE',
                    entitlements: {
                      'com.apple.security.application-groups': [
                        'group.community.blacksky.app',
                      ],
                    },
                  },
                  {
                    targetName: 'BlackskyClip',
                    bundleIdentifier: 'community.blacksky.app.AppClip',
                    parentBundleIdentifier: 'community.blacksky.app',
                    entitlements: {
                      'com.apple.security.application-groups': [
                        'group.community.blacksky.app',
                      ],
                      'com.apple.developer.parent-application-identifiers': [
                        '$(AppIdentifierPrefix)community.blacksky.app',
                      ],
                      'com.apple.developer.associated-domains':
                        ASSOCIATED_DOMAINS,
                    },
                  },
                ],
              },
            },
          },
          projectId: '680dd4a3-7b77-4a43-8f10-f14617b73b9b',
        },
      },
      experiments: {
        baseUrl: '/static',
        buildCacheProvider: 'eas',
      },
    },
  }
}
