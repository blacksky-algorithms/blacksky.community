import {useMemo} from 'react'
import {Pressable, View} from 'react-native'
import {Image as ExpoImage} from 'expo-image'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {AvatarCreatorCircle} from '#/screens/Onboarding/StepProfile/AvatarCreatorCircle'
import {useAvatar} from '#/screens/Onboarding/StepProfile/index'
import {atoms as a} from '#/alf'
import {Person_Stroke2_Corner0_Rounded as Person} from '#/components/icons/Person'

export function AvatarCircle({
  openLibrary,
  openCreator,
}: {
  openLibrary: () => unknown
  openCreator: () => unknown
}) {
  const {_} = useLingui()
  const {avatar} = useAvatar()

  const styles = useMemo(
    () => ({
      imageContainer: [
        a.rounded_full,
        a.overflow_hidden,
        a.align_center,
        a.justify_center,
        a.border,
        {borderColor: '#8686ff'},
        {backgroundColor: '#262644'},
        {
          height: 200,
          width: 200,
        },
      ],
    }),
    [],
  )

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint=""
      accessibilityLabel={_(msg`Select an avatar`)}
      onPress={avatar.useCreatedAvatar ? openCreator : openLibrary}>
      {avatar.useCreatedAvatar ? (
        <AvatarCreatorCircle avatar={avatar} size={200} />
      ) : avatar.image ? (
        <ExpoImage
          source={avatar.image.path}
          style={styles.imageContainer}
          accessibilityIgnoresInvertColors
          transition={{duration: 300, effect: 'cross-dissolve'}}
        />
      ) : (
        <View style={styles.imageContainer}>
          <Person height={72} width={72} style={{color: '#8686ff'}} />
        </View>
      )}
    </Pressable>
  )
}
