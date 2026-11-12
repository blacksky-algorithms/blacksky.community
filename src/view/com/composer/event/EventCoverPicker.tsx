import {type ReactNode, useState} from 'react'
import {Pressable, View} from 'react-native'
import {Image} from 'expo-image'
import {Trans, useLingui} from '@lingui/react/macro'

import {IMAGE_SIZE_CONFIG_2K_1MB} from '#/lib/constants'
import {
  useCameraPermission,
  usePhotoLibraryPermission,
} from '#/lib/hooks/usePermissions'
import {compressIfNeeded} from '#/lib/media/manip'
import {openCamera, openCropper, openPicker} from '#/lib/media/picker'
import {type PickerImage} from '#/lib/media/picker.shared'
import {isCancelledError} from '#/lib/strings/errors'
import {logger} from '#/logger'
import {
  type ComposerImage,
  compressImage,
  createComposerImage,
} from '#/state/gallery'
import {EditImageDialog} from '#/view/com/composer/photos/EditImageDialog'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {useDialogControl} from '#/components/Dialog'
import {useSheetWrapper} from '#/components/Dialog/sheet-wrapper'
import {Camera_Stroke2_Corner0_Rounded as CameraIcon} from '#/components/icons/Camera'
import {StreamingLive_Stroke2_Corner0_Rounded as LibraryIcon} from '#/components/icons/StreamingLive'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import * as Menu from '#/components/Menu'
import {IS_NATIVE, IS_WEB} from '#/env'

const ASPECT = 2

export function EventCoverPicker({
  cover,
  onChange,
  children,
}: {
  cover?: string
  onChange: (image: PickerImage | null) => void
  children?: ReactNode
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const {requestCameraAccessIfNeeded} = useCameraPermission()
  const {requestPhotoAccessIfNeeded} = usePhotoLibraryPermission()
  const sheetWrapper = useSheetWrapper()
  const editControl = useDialogControl()
  const [rawImage, setRawImage] = useState<ComposerImage | undefined>()

  const onCamera = async () => {
    if (!(await requestCameraAccessIfNeeded())) return
    try {
      const image = await openCamera({aspect: [ASPECT, 1]})
      if (!image) return
      onChange(await compressIfNeeded(image, IMAGE_SIZE_CONFIG_2K_1MB))
    } catch (e) {
      if (!isCancelledError(e)) {
        logger.warn('Failed to take event cover photo', {error: e})
      }
    }
  }

  const onLibrary = async () => {
    if (!(await requestPhotoAccessIfNeeded())) return
    const items = await sheetWrapper(openPicker())
    if (!items[0]) return
    try {
      if (IS_NATIVE) {
        onChange(
          await compressIfNeeded(
            await openCropper({imageUri: items[0].path, aspectRatio: ASPECT}),
            IMAGE_SIZE_CONFIG_2K_1MB,
          ),
        )
      } else {
        setRawImage(await createComposerImage(items[0]))
        editControl.open()
      }
    } catch (e) {
      if (!isCancelledError(e)) {
        logger.error('Failed to pick event cover', {error: e})
      }
    }
  }

  const field = children ?? (
    <View
      testID="eventCoverField"
      style={[
        a.w_full,
        a.align_center,
        a.justify_center,
        a.overflow_hidden,
        t.atoms.bg_contrast_50,
        {height: 150, borderRadius: 10},
      ]}>
      {cover && (
        <Image
          testID="eventCoverImage"
          source={{uri: cover}}
          style={[a.absolute, a.inset_0]}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      )}
      <View
        style={[
          a.align_center,
          a.justify_center,
          a.rounded_full,
          {width: 56, height: 56, backgroundColor: t.palette.primary_50},
        ]}>
        <CameraIcon size="xl" style={t.atoms.text} />
      </View>
    </View>
  )

  return (
    <>
      {IS_WEB ? (
        <View style={children ? a.self_center : undefined}>
          <Pressable
            testID="eventCoverPickBtn"
            accessibilityRole="button"
            accessibilityLabel={l`Choose event image`}
            accessibilityHint={l`Opens your files`}
            onPress={() => void onLibrary()}>
            {field}
          </Pressable>
          {cover && (
            <Button
              testID="eventCoverRemoveBtn"
              label={l`Remove image`}
              size="tiny"
              variant="solid"
              color="secondary"
              style={[a.absolute, {top: 8, right: 8}]}
              onPress={() => onChange(null)}>
              <ButtonText>
                <Trans>Remove</Trans>
              </ButtonText>
            </Button>
          )}
        </View>
      ) : (
        <Menu.Root>
          <Menu.Trigger label={l`Choose event image`}>
            {({props}) => (
              <Pressable {...props} testID="eventCoverPickBtn">
                {field}
              </Pressable>
            )}
          </Menu.Trigger>
          <Menu.Outer showCancel>
            <Menu.Group>
              <Menu.Item
                label={l`Upload from Camera`}
                onPress={() => void onCamera()}>
                <Menu.ItemText>
                  <Trans>Upload from Camera</Trans>
                </Menu.ItemText>
                <Menu.ItemIcon icon={CameraIcon} />
              </Menu.Item>
              <Menu.Item
                label={l`Upload from Library`}
                onPress={() => void onLibrary()}>
                <Menu.ItemText>
                  <Trans>Upload from Library</Trans>
                </Menu.ItemText>
                <Menu.ItemIcon icon={LibraryIcon} />
              </Menu.Item>
            </Menu.Group>
            {cover && (
              <>
                <Menu.Divider />
                <Menu.Group>
                  <Menu.Item
                    label={l`Remove image`}
                    onPress={() => onChange(null)}>
                    <Menu.ItemText>
                      <Trans>Remove image</Trans>
                    </Menu.ItemText>
                    <Menu.ItemIcon icon={TrashIcon} />
                  </Menu.Item>
                </Menu.Group>
              </>
            )}
          </Menu.Outer>
        </Menu.Root>
      )}
      <EditImageDialog
        control={editControl}
        image={rawImage}
        onChange={image =>
          void compressImage(image, IMAGE_SIZE_CONFIG_2K_1MB).then(onChange)
        }
        aspectRatio={ASPECT}
        preselectCrop
      />
    </>
  )
}
