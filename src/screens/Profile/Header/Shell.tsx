import {memo, useCallback, useEffect, useMemo} from 'react'
import {Pressable, View} from 'react-native'
import Animated, {
  measure,
  type MeasuredDimensions,
  runOnJS,
  runOnUI,
  useAnimatedRef,
} from 'react-native-reanimated'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {type AppBskyActorDefs, type ModerationDecision} from '@atproto/api'
import {utils} from '@bsky.app/alf'
import {msg, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {useNavigation} from '@react-navigation/native'

import {useActorStatus} from '#/lib/actor-status'
import {BACK_HITSLOP} from '#/lib/constants'
import {useHaptics} from '#/lib/haptics'
import {getModerationCauseKey, unique} from '#/lib/moderation'
import {type NavigationProp} from '#/lib/routes/types'
import {type Shadow} from '#/state/cache/types'
import {useLightboxControls} from '#/state/lightbox'
import {usePublicProfileQuery} from '#/state/queries/profile'
import {useSession} from '#/state/session'
import {LoadingPlaceholder} from '#/view/com/util/LoadingPlaceholder'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {UserBanner} from '#/view/com/util/UserBanner'
import {atoms as a, platform, useTheme} from '#/alf'
import {colors} from '#/components/Admonition'
import {Button} from '#/components/Button'
import {useDialogControl} from '#/components/Dialog'
import {ArrowLeft_Stroke2_Corner0_Rounded as ArrowLeftIcon} from '#/components/icons/Arrow'
import {ArrowRotateCounterClockwise_Stroke2_Corner0_Rounded as ArrowRotateIcon} from '#/components/icons/ArrowRotate'
import {EditLiveDialog} from '#/components/live/EditLiveDialog'
import {LiveIndicator} from '#/components/live/LiveIndicator'
import {LiveStatusDialog} from '#/components/live/LiveStatusDialog'
import {LabelsOnMe} from '#/components/moderation/LabelsOnMe'
import * as Pills from '#/components/Pills'
import * as Prompt from '#/components/Prompt'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {IS_IOS} from '#/env'
import {GrowableAvatar} from './GrowableAvatar'
import {GrowableBanner} from './GrowableBanner'
import {StatusBarShadow} from './StatusBarShadow'

interface Props {
  profile: Shadow<AppBskyActorDefs.ProfileViewDetailed>
  moderation: ModerationDecision
  hideBackButton?: boolean
  isPlaceholderProfile?: boolean
}

let ProfileHeaderShell = ({
  children,
  profile,
  moderation,
  hideBackButton = false,
  isPlaceholderProfile,
}: React.PropsWithChildren<Props>): React.ReactNode => {
  const t = useTheme()
  const ax = useAnalytics()
  const {currentAccount} = useSession()
  const {_} = useLingui()
  const {openLightbox} = useLightboxControls()
  const navigation = useNavigation<NavigationProp>()
  const {top: topInset} = useSafeAreaInsets()
  const playHaptic = useHaptics()
  const liveStatusControl = useDialogControl()

  const aviRef = useAnimatedRef()
  const bannerRef = useAnimatedRef<Animated.View>()

  const onPressBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack()
    } else {
      navigation.navigate('Home')
    }
  }, [navigation])

  const _openLightbox = useCallback(
    (
      uri: string,
      thumbRect: MeasuredDimensions | null,
      type: 'circle-avi' | 'rect-avi' | 'image' = 'circle-avi',
    ) => {
      openLightbox({
        images: [
          {
            uri,
            thumbUri: uri,
            thumbRect,
            dimensions:
              type === 'circle-avi' || type === 'rect-avi'
                ? {
                    // It's fine if it's actually smaller but we know it's 1:1.
                    height: 1000,
                    width: 1000,
                  }
                : {
                    // Banner aspect ratio is 3:1
                    width: 3000,
                    height: 1000,
                  },
            thumbDimensions: null,
            type,
          },
        ],
        index: 0,
      })
    },
    [openLightbox],
  )

  const isMe = useMemo(
    () => currentAccount?.did === profile.did,
    [currentAccount, profile],
  )

  const live = useActorStatus(profile)

  useEffect(() => {
    if (live.isActive) {
      ax.metric('live:view:profile', {subject: profile.did})
    }
  }, [ax, live.isActive, profile.did])

  const onPressAvi = useCallback(() => {
    if (live.isActive) {
      playHaptic('Light')
      ax.metric('live:card:open', {subject: profile.did, from: 'profile'})
      liveStatusControl.open()
    } else {
      const modui = moderation.ui('avatar')
      const avatar = profile.avatar
      const type = profile.associated?.labeler ? 'rect-avi' : 'circle-avi'
      if (avatar && !(modui.blur && modui.noOverride)) {
        runOnUI(() => {
          'worklet'
          const rect = measure(aviRef)
          runOnJS(_openLightbox)(avatar, rect, type)
        })()
      }
    }
  }, [
    ax,
    profile,
    moderation,
    _openLightbox,
    aviRef,
    liveStatusControl,
    live,
    playHaptic,
  ])

  const onPressBanner = useCallback(() => {
    const modui = moderation.ui('banner')
    const banner = profile.banner
    if (banner && !(modui.blur && modui.noOverride)) {
      runOnUI(() => {
        'worklet'
        const rect = measure(bannerRef)
        runOnJS(_openLightbox)(banner, rect, 'image')
      })()
    }
  }, [profile.banner, moderation, _openLightbox, bannerRef])

  return (
    <View style={t.atoms.bg} pointerEvents={IS_IOS ? 'auto' : 'box-none'}>
      <View
        pointerEvents={IS_IOS ? 'auto' : 'box-none'}
        style={[a.relative, {height: 150}]}>
        <StatusBarShadow />
        <GrowableBanner
          onPress={isPlaceholderProfile ? undefined : onPressBanner}
          bannerRef={bannerRef}
          backButton={
            !hideBackButton && (
              <Button
                testID="profileHeaderBackBtn"
                onPress={onPressBack}
                hitSlop={BACK_HITSLOP}
                label={_(msg`Back`)}
                style={[
                  a.absolute,
                  a.pointer,
                  {
                    top: platform({
                      web: 10,
                      default: topInset,
                    }),
                    left: platform({
                      web: 18,
                      default: 12,
                    }),
                  },
                ]}>
                {({hovered}) => (
                  <View
                    style={[
                      a.align_center,
                      a.justify_center,
                      a.rounded_full,
                      {
                        width: 31,
                        height: 31,
                        backgroundColor: utils.alpha('#000', 0.5),
                      },
                      hovered && {
                        backgroundColor: utils.alpha('#000', 0.75),
                      },
                    ]}>
                    <ArrowLeftIcon size="lg" fill="white" />
                  </View>
                )}
              </Button>
            )
          }>
          {isPlaceholderProfile ? (
            <LoadingPlaceholder
              width="100%"
              height="100%"
              style={{borderRadius: 0}}
            />
          ) : (
            <UserBanner
              type={profile.associated?.labeler ? 'labeler' : 'default'}
              banner={profile.banner}
              moderation={moderation.ui('banner')}
            />
          )}
        </GrowableBanner>
      </View>

      {children}

      {!isPlaceholderProfile &&
        (isMe ? (
          <LabelsOnMe
            type="account"
            labels={profile.labels}
            style={[
              a.px_lg,
              a.pt_xs,
              a.pb_sm,
              IS_IOS ? a.pointer_events_auto : {pointerEvents: 'box-none'},
            ]}
          />
        ) : (
          <ProfileHeaderPills profile={profile} moderation={moderation} />
        ))}

      <GrowableAvatar style={[a.absolute, {top: 104, left: 10}]}>
        <Pressable
          testID="profileHeaderAviButton"
          onPress={onPressAvi}
          accessibilityRole="image"
          accessibilityLabel={_(msg`View ${profile.handle}'s avatar`)}
          accessibilityHint="">
          <View
            style={[
              t.atoms.bg,
              a.rounded_full,
              {
                width: 94,
                height: 94,
                borderWidth: live.isActive ? 3 : 2,
                borderColor: live.isActive
                  ? t.palette.negative_500
                  : t.atoms.bg.backgroundColor,
              },
              profile.associated?.labeler && a.rounded_md,
            ]}>
            <Animated.View ref={aviRef} collapsable={false}>
              <UserAvatar
                type={profile.associated?.labeler ? 'labeler' : 'user'}
                size={live.isActive ? 88 : 90}
                avatar={profile.avatar}
                moderation={moderation.ui('avatar')}
                noBorder
              />
              {live.isActive && <LiveIndicator size="large" />}
            </Animated.View>
          </View>
        </Pressable>
      </GrowableAvatar>

      {live.isActive &&
        (isMe ? (
          <EditLiveDialog
            control={liveStatusControl}
            status={live}
            embed={live.embed}
          />
        ) : (
          <LiveStatusDialog
            control={liveStatusControl}
            status={live}
            embed={live.embed}
            profile={profile}
          />
        ))}
    </View>
  )
}

ProfileHeaderShell = memo(ProfileHeaderShell)
export {ProfileHeaderShell}

function ProfileHeaderPills({
  profile,
  moderation,
}: {
  profile: Shadow<AppBskyActorDefs.ProfileViewDetailed>
  moderation: ModerationDecision
}) {
  const modui = moderation.ui('profileView')
  const {data: publicProfile} = usePublicProfileQuery({did: profile.did})

  const isPartiallyBackfilled = useMemo(() => {
    if (!publicProfile) return false
    const THRESHOLD_PCT = 0.05
    const THRESHOLD_ABS = 10
    const isLower = (local: number, canonical: number) => {
      const diff = canonical - local
      return diff > THRESHOLD_ABS && diff > canonical * THRESHOLD_PCT
    }
    return (
      isLower(profile.followersCount ?? 0, publicProfile.followersCount ?? 0) ||
      isLower(profile.followsCount ?? 0, publicProfile.followsCount ?? 0) ||
      isLower(profile.postsCount ?? 0, publicProfile.postsCount ?? 0)
    )
  }, [profile, publicProfile])

  const hasAlerts = modui.alert || modui.inform
  if (!isPartiallyBackfilled && !hasAlerts) return null

  return (
    <Pills.Row
      size="lg"
      style={[
        a.px_lg,
        a.pt_xs,
        a.pb_sm,
        IS_IOS ? a.pointer_events_auto : {pointerEvents: 'box-none'},
      ]}>
      {isPartiallyBackfilled && <BackfillPill />}
      {modui.alerts.filter(unique).map(cause => (
        <Pills.Label
          size="lg"
          key={getModerationCauseKey(cause)}
          cause={cause}
        />
      ))}
      {modui.informs.filter(unique).map(cause => (
        <Pills.Label
          size="lg"
          key={getModerationCauseKey(cause)}
          cause={cause}
        />
      ))}
    </Pills.Row>
  )
}

function BackfillPill() {
  const t = useTheme()
  const {_} = useLingui()
  const control = Prompt.usePromptControl()

  return (
    <>
      <Button
        label={_(msg`Backfill in progress`)}
        onPress={e => {
          e.preventDefault()
          e.stopPropagation()
          control.open()
        }}>
        {({hovered, pressed}) => (
          <View
            style={[
              a.flex_row,
              a.align_center,
              a.rounded_full,
              t.atoms.bg_contrast_25,
              (hovered || pressed) && t.atoms.bg_contrast_50,
              {
                gap: 5,
                paddingHorizontal: 5,
                paddingVertical: 5,
              },
            ]}>
            <ArrowRotateIcon width={16} fill={colors.warning} />
            <Text
              style={[
                a.text_sm,
                a.font_semi_bold,
                a.leading_tight,
                t.atoms.text_contrast_medium,
                {paddingRight: 3},
              ]}>
              <Trans>Backfill in progress</Trans>
            </Text>
          </View>
        )}
      </Button>

      <Prompt.Outer control={control}>
        <Prompt.Content>
          <Prompt.TitleText>
            <Trans>Backfill in progress</Trans>
          </Prompt.TitleText>
          <Prompt.DescriptionText>
            <Trans>
              Blacksky is still indexing this account's data from the AT
              Protocol network. The follower, following, and post counts shown
              may be lower than the actual totals. Relationship indicators (like
              whether this account follows you) may also be incomplete until
              backfill is finished.
            </Trans>
          </Prompt.DescriptionText>
        </Prompt.Content>
        <Prompt.Actions>
          <Prompt.Action cta={_(msg`Okay`)} onPress={() => {}} />
        </Prompt.Actions>
      </Prompt.Outer>
    </>
  )
}
