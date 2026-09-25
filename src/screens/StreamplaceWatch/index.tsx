import {useEffect, useMemo} from 'react'
import {Pressable, View} from 'react-native'
import {KeyboardAvoidingView} from 'react-native-keyboard-controller'
import {moderateProfile} from '@atproto/api'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {useExternalEmbedsPrefs} from '#/state/preferences'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {useProfileQuery} from '#/state/queries/profile'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {EmbedConsentDialog} from '#/components/dialogs/EmbedConsent'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {ChatComposer} from '#/features/streamplace/ChatComposer'
import {ChatList} from '#/features/streamplace/ChatList'
import {LivePlayer} from '#/features/streamplace/LivePlayer'
import {useChatProfiles} from '#/features/streamplace/useChatProfiles'
import {useSendChat} from '#/features/streamplace/useSendChat'
import {useStreamplaceLive} from '#/features/streamplace/useStreamplaceLive'
import {visibleMessages} from '#/features/streamplace/visible'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'StreamplaceWatch'>

export function StreamplaceWatchScreen({route}: Props) {
  const {actor} = route.params
  const prefs = useExternalEmbedsPrefs()
  const pref = prefs?.streamplace

  return (
    <Layout.Screen
      minimalShell
      testID="streamplaceWatchScreen"
      style={web([{minHeight: 0}, a.flex_1])}>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Live</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      {pref === 'show' ? (
        <Watch actor={actor} />
      ) : (
        <ConsentGate hidden={pref === 'hide'} />
      )}
    </Layout.Screen>
  )
}

function ConsentGate({hidden}: {hidden: boolean}) {
  const {_} = useLingui()
  const control = Dialog.useDialogControl()

  return (
    <View
      style={[a.flex_1, a.align_center, a.justify_center, a.px_lg, a.gap_lg]}>
      <EmbedConsentDialog
        control={control}
        source="streamplace"
        onAccept={() => undefined}
      />
      <Text style={[a.text_md, a.text_center]}>
        {hidden ? (
          <Trans>
            Streamplace media is turned off. Turn it on in Settings → Content &
            media → External media.
          </Trans>
        ) : (
          <Trans>Watch Streamplace media inside Blacksky.</Trans>
        )}
      </Text>
      {!hidden && (
        <Button
          label={_(msg`Watch on Blacksky`)}
          onPress={control.open}
          color="primary">
          <ButtonText>
            <Trans>Watch on Blacksky</Trans>
          </ButtonText>
        </Button>
      )}
    </View>
  )
}

function Watch({actor}: {actor: string}) {
  const t = useTheme()
  const ax = useAnalytics()
  const navigation = useNavigation<NavigationProp>()
  const live = useStreamplaceLive(actor)
  const {data: profile} = useProfileQuery({did: actor})
  const profiles = useChatProfiles(
    live.messages.map(message => message.authorDid),
  )
  const moderationOpts = useModerationOpts()
  const visible = useMemo(
    () =>
      moderationOpts
        ? visibleMessages(live.messages, profiles, moderationOpts)
        : [],
    [live.messages, moderationOpts, profiles],
  )
  const {pending, send} = useSendChat(profile?.did, live.messages)

  useEffect(() => {
    ax.metric('live:watch:open', {subject: actor})
  }, [actor, ax])

  const onSend = (text: string) => {
    ax.metric('live:chat:send', {subject: actor})
    void send(text)
  }

  const chat = moderationOpts ? (
    <>
      <ChatList
        messages={visible}
        pending={pending}
        moderationOpts={moderationOpts}
        onRetry={message => void send(message.text, message)}
      />
      <ChatComposer onSend={onSend} />
    </>
  ) : null

  return (
    <Layout.Center style={a.flex_1}>
      <LivePlayer actor={actor} />
      <ProfileInfo
        actor={actor}
        profile={profile}
        live={live}
        onPress={() => {
          navigation.push('Profile', {name: profile?.did ?? actor})
        }}
      />
      <Text
        style={[
          a.px_md,
          a.py_sm,
          a.font_semi_bold,
          a.border_t,
          t.atoms.border_contrast_low,
        ]}>
        <Trans>Live chat</Trans>
      </Text>
      <KeyboardAvoidingView
        behavior="padding"
        style={[a.flex_1, {minHeight: 0}]}>
        {chat}
      </KeyboardAvoidingView>
    </Layout.Center>
  )
}

function ProfileInfo({
  actor,
  profile,
  live,
  onPress,
}: {
  actor: string
  profile: ReturnType<typeof useProfileQuery>['data']
  live: ReturnType<typeof useStreamplaceLive>
  onPress: () => void
}) {
  const {_} = useLingui()
  const t = useTheme()
  const moderationOpts = useModerationOpts()
  const moderation =
    profile && moderationOpts
      ? moderateProfile(profile, moderationOpts)
      : undefined
  const viewerText =
    live.viewerCount === undefined
      ? undefined
      : _(msg`${live.viewerCount} watching`)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={profile?.displayName || profile?.handle || actor}
      accessibilityHint={_(msg`Opens profile`)}
      style={[a.flex_row, a.align_center, a.gap_sm, a.px_md, a.py_sm]}>
      {profile && (
        <UserAvatar
          type="user"
          size={32}
          avatar={profile.avatar}
          moderation={moderation?.ui('avatar')}
        />
      )}
      <View style={a.flex_1}>
        <Text>{profile?.displayName || profile?.handle || actor}</Text>
        {live.title && (
          <Text style={t.atoms.text_contrast_medium}>{live.title}</Text>
        )}
      </View>
      {live.isLive && (
        <Text style={[a.rounded_sm, a.px_xs, t.atoms.bg_contrast_500]}>
          <Trans>LIVE</Trans>
        </Text>
      )}
      {viewerText && (
        <Text style={t.atoms.text_contrast_medium}>{viewerText}</Text>
      )}
    </Pressable>
  )
}
