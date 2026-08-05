import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {View} from 'react-native'
import {Image as ExpoImage} from 'expo-image'
import {ImageManipulator, SaveFormat} from 'expo-image-manipulator'
import {
  type ImagePickerOptions,
  launchImageLibraryAsync,
  UIImagePickerPreferredAssetRepresentationMode,
} from 'expo-image-picker'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {IMAGE_SIZE_CONFIG_2K_1MB} from '#/lib/constants'
import {usePhotoLibraryPermission} from '#/lib/hooks/usePermissions'
import {compressIfNeeded} from '#/lib/media/manip'
import {openCropper} from '#/lib/media/picker'
import {getDataUriSize} from '#/lib/media/util'
import {useRequestNotificationsPermission} from '#/lib/notifications/notifications'
import {isCancelledError} from '#/lib/strings/errors'
import {logger} from '#/logger'
import {useOnboardingInternalState} from '#/screens/Onboarding/state'
import {AvatarCircle} from '#/screens/Onboarding/StepProfile/AvatarCircle'
import {AvatarCreatorCircle} from '#/screens/Onboarding/StepProfile/AvatarCreatorCircle'
import {AvatarCreatorItems} from '#/screens/Onboarding/StepProfile/AvatarCreatorItems'
import {
  PlaceholderCanvas,
  type PlaceholderCanvasRef,
} from '#/screens/Onboarding/StepProfile/PlaceholderCanvas'
import {atoms as a, useBreakpoints, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {useSheetWrapper} from '#/components/Dialog/sheet-wrapper'
import {CircleInfo_Stroke2_Corner0_Rounded} from '#/components/icons/CircleInfo'
import {AppBar, Eyebrow, PrimaryButton} from '#/components/onboarding-chrome'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {IS_NATIVE, IS_WEB} from '#/env'
import {type AvatarColor, avatarColors, type Emoji, emojiItems} from './types'

export interface Avatar {
  image?: {
    path: string
    mime: string
    size: number
    width: number
    height: number
  }
  backgroundColor: AvatarColor
  placeholder: Emoji
  useCreatedAvatar: boolean
}

interface IAvatarContext {
  avatar: Avatar
  setAvatar: React.Dispatch<React.SetStateAction<Avatar>>
}

const AvatarContext = createContext<IAvatarContext>({} as IAvatarContext)
AvatarContext.displayName = 'AvatarContext'
export const useAvatar = () => useContext(AvatarContext)

const randomColor =
  avatarColors[Math.floor(Math.random() * avatarColors.length)]

export function StepProfile() {
  const ax = useAnalytics()
  const {_} = useLingui()
  const t = useTheme()
  const {gtMobile} = useBreakpoints()
  const {requestPhotoAccessIfNeeded} = usePhotoLibraryPermission()
  const requestNotificationsPermission = useRequestNotificationsPermission()

  const creatorControl = Dialog.useDialogControl()
  const [error, setError] = useState('')

  const {state, dispatch} = useOnboardingInternalState()
  const [avatar, setAvatar] = useState<Avatar>({
    image: state.profileStepResults?.image,
    placeholder: state.profileStepResults.creatorState?.emoji || emojiItems.at,
    backgroundColor:
      state.profileStepResults.creatorState?.backgroundColor || randomColor,
    useCreatedAvatar: state.profileStepResults.isCreatedAvatar,
  })

  const canvasRef = useRef<PlaceholderCanvasRef>(null)

  useEffect(() => {
    requestNotificationsPermission('StartOnboarding')
  }, [requestNotificationsPermission])

  const sheetWrapper = useSheetWrapper()
  const openPicker = useCallback(
    async (opts?: ImagePickerOptions) => {
      const response = await sheetWrapper(
        launchImageLibraryAsync({
          exif: false,
          mediaTypes: ['images'],
          quality: 1,
          ...opts,
          legacy: true,
          preferredAssetRepresentationMode:
            UIImagePickerPreferredAssetRepresentationMode.Automatic,
        }),
      )

      const asset = (response.assets ?? [])[0]
      if (!asset) return []

      try {
        const context = ImageManipulator.manipulate(asset.uri)
        const rendered = await context.renderAsync()
        const result = await rendered.saveAsync({
          format: SaveFormat.JPEG,
          compress: 1.0,
        })
        return [
          {
            mime: 'image/jpeg',
            height: rendered.height,
            width: rendered.width,
            path: result.uri,
            size: getDataUriSize(result.uri),
          },
        ]
      } catch {
        setError(
          _(
            msg`This image could not be used. Try a different format like .jpg or .png.`,
          ),
        )
        return []
      }
    },
    [_, setError, sheetWrapper],
  )

  const onContinue = useCallback(async () => {
    let imageUri = avatar?.image?.path

    // In the event that view-shot didn't load in time and the user pressed continue, this will just be undefined
    // and the default avatar will be used. We don't want to block getting through create if this fails for some
    // reason
    if (!imageUri || avatar.useCreatedAvatar) {
      imageUri = await canvasRef.current?.capture()
    }

    if (imageUri) {
      dispatch({
        type: 'setProfileStepResults',
        image: avatar.image,
        imageUri,
        imageMime: avatar.image?.mime ?? 'image/jpeg',
        isCreatedAvatar: avatar.useCreatedAvatar,
        creatorState: {
          emoji: avatar.placeholder,
          backgroundColor: avatar.backgroundColor,
        },
      })
    }

    dispatch({type: 'next'})
    ax.metric('onboarding:profile:nextPressed', {})
  }, [ax, avatar, dispatch])

  const onDoneCreating = useCallback(() => {
    setAvatar(prev => ({
      ...prev,
      image: undefined,
      useCreatedAvatar: true,
    }))
    creatorControl.close()
  }, [creatorControl])

  const openLibrary = useCallback(async () => {
    if (!(await requestPhotoAccessIfNeeded())) {
      return
    }

    setError('')

    const items = await sheetWrapper(
      openPicker({
        aspect: [1, 1],
      }),
    )
    let image = items[0]
    if (!image) return

    if (!IS_WEB) {
      try {
        image = await openCropper({
          imageUri: image.path,
          shape: 'circle',
          aspectRatio: 1 / 1,
        })
      } catch (e) {
        if (!isCancelledError(e)) {
          logger.error('Failed to crop avatar in onboarding', {error: e})
        }
      }
    }
    image = await compressIfNeeded(image, IMAGE_SIZE_CONFIG_2K_1MB)

    // If we are on mobile, prefetching the image will load the image into memory before we try and display it,
    // stopping any brief flickers.
    if (IS_NATIVE) {
      await ExpoImage.prefetch(image.path)
    }

    setAvatar(prev => ({
      ...prev,
      image,
      useCreatedAvatar: false,
    }))
  }, [
    requestPhotoAccessIfNeeded,
    setAvatar,
    openPicker,
    setError,
    sheetWrapper,
  ])

  const onSecondaryPress = useCallback(() => {
    if (avatar.useCreatedAvatar) {
      openLibrary()
    } else {
      creatorControl.open()
    }
  }, [avatar.useCreatedAvatar, creatorControl, openLibrary])

  const value = useMemo(
    () => ({
      avatar,
      setAvatar,
    }),
    [avatar],
  )

  return (
    <AvatarContext.Provider value={value}>
      <View style={[a.gap_lg]}>
        <AppBar
          showBack={state.canGoBack}
          onBack={() => dispatch({type: 'prev'})}
        />

        <Eyebrow label={_(msg`Profile`)} />

        <View style={[a.gap_xs]}>
          <Text style={[a.font_heading, a.text_3xl, a.leading_snug]}>
            <Trans>Add a profile picture</Trans>
          </Text>
          <Text
            style={[a.text_md, a.leading_snug, t.atoms.text_contrast_medium]}>
            <Trans>Upload a photo to personalize your page.</Trans>
          </Text>
        </View>

        <View
          style={[
            a.w_full,
            a.align_center,
            {paddingVertical: gtMobile ? 48 : 32},
          ]}>
          <AvatarCircle
            openLibrary={openLibrary}
            openCreator={creatorControl.open}
          />

          {error && (
            <View
              style={[
                a.flex_row,
                a.gap_sm,
                a.align_center,
                a.mt_xl,
                a.py_md,
                a.px_lg,
                a.border,
                a.rounded_md,
                t.atoms.bg_contrast_25,
                t.atoms.border_contrast_low,
              ]}>
              <CircleInfo_Stroke2_Corner0_Rounded size="sm" />
              <Text style={[a.leading_snug]}>{error}</Text>
            </View>
          )}
        </View>

        <View style={[a.w_full, a.gap_md]}>
          <Button
            testID="onboardingAvatarCreator"
            color="primary"
            variant="outline"
            size="large"
            label={
              avatar.useCreatedAvatar
                ? _(msg`Upload a photo`)
                : _(msg`Create an avatar`)
            }
            onPress={onSecondaryPress}
            style={[a.w_full]}>
            <ButtonText
              style={[
                a.font_mono,
                {fontWeight: '300', fontSize: 14, textTransform: 'uppercase'},
              ]}>
              {avatar.useCreatedAvatar ? (
                <Trans>Upload a photo</Trans>
              ) : (
                <Trans>Create an avatar</Trans>
              )}
            </ButtonText>
          </Button>

          <PrimaryButton
            testID="onboardingContinue"
            label={_(msg`Continue`)}
            onPress={onContinue}
          />
        </View>
      </View>

      <Dialog.Outer control={creatorControl}>
        <Dialog.Inner
          label="Avatar creator"
          style={[
            {
              width: 'auto',
              maxWidth: 410,
            },
          ]}>
          <View style={[a.align_center, {paddingTop: 20}]}>
            <AvatarCreatorCircle avatar={avatar} />
          </View>

          <View style={[a.pt_3xl, a.gap_lg]}>
            <AvatarCreatorItems
              type="emojis"
              avatar={avatar}
              setAvatar={setAvatar}
            />
            <AvatarCreatorItems
              type="colors"
              avatar={avatar}
              setAvatar={setAvatar}
            />
          </View>
          <View style={[a.pt_4xl]}>
            <Button
              color="primary"
              size="large"
              label={_(msg`Done`)}
              onPress={onDoneCreating}>
              <ButtonText>
                <Trans>Done</Trans>
              </ButtonText>
            </Button>
          </View>
        </Dialog.Inner>
      </Dialog.Outer>

      <PlaceholderCanvas ref={canvasRef} />
    </AvatarContext.Provider>
  )
}
