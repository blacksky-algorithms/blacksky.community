import {useCallback, useEffect} from 'react'
import {View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'
import {useIsFocused} from '@react-navigation/native'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'

import {useAppState} from '#/lib/appState'
import {CHAT_RELAY_ENABLED} from '#/lib/constants'
import {type CommonNavigatorParams} from '#/lib/routes/types'
import {useUpdateActorDeclaration} from '#/state/queries/messages/actor-declaration'
import {
  useChatRelayDisconnectMutation,
  useChatRelayEnrollmentMutation,
  useChatRelayPreferencesMutation,
  useChatRelayStatusQuery,
} from '#/state/queries/notifications/chat-relay'
import {useProfileQuery} from '#/state/queries/profile'
import {useSession} from '#/state/session'
import {ExportCarDialog} from '#/screens/Settings/components/ExportCarDialog'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {Divider} from '#/components/Divider'
import {resolveAllowGroupInvites} from '#/components/dms/util'
import * as Toggle from '#/components/forms/Toggle'
import {Bell_Stroke2_Corner0_Rounded as BellIcon} from '#/components/icons/Bell'
import {Car_Stroke2_Corner2_Rounded as CarIcon} from '#/components/icons/Car'
import {ChevronRight_Stroke2_Corner0_Rounded as ChevronRightIcon} from '#/components/icons/Chevron'
import * as Layout from '#/components/Layout'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {IS_NATIVE} from '#/env'
import {useBackgroundNotificationPreferences} from '../../../modules/expo-background-notification-handler/src/BackgroundNotificationHandlerProvider'

type AllowIncoming = 'all' | 'none' | 'following'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'MessagesSettings'>

export function MessagesSettingsScreen(props: Props) {
  return <MessagesSettingsScreenInner {...props} />
}

export function MessagesSettingsScreenInner({}: Props) {
  const t = useTheme()
  const {t: l} = useLingui()
  const ax = useAnalytics()
  const {currentAccount} = useSession()
  const {data: profile} = useProfileQuery({
    did: currentAccount!.did,
  })
  const {preferences, setPref} = useBackgroundNotificationPreferences()

  const exportCarControl = Dialog.useDialogControl()

  const isGroupChatEnabled = !ax.features.enabled(ax.features.GroupChatsDisable)
  const groupInvitesLocked = false

  const allowMessagesFromOptions: {name: AllowIncoming; label: string}[] = [
    {
      name: 'all',
      label: l({context: 'allow messages from', message: `Everyone`}),
    },
    {
      name: 'following',
      label: l({context: 'allow messages from', message: `People I follow`}),
    },
    {
      name: 'none',
      label: l({context: 'allow messages from', message: `No one`}),
    },
  ]

  const allowGroupInvitesFromOptions: {name: AllowIncoming; label: string}[] = [
    {
      name: 'all',
      label: l({context: 'allow group chat invites from', message: `Everyone`}),
    },
    {
      name: 'following',
      label: l({
        context: 'allow group chat invites from',
        message: `People I follow`,
      }),
    },
    {
      name: 'none',
      label: l({context: 'allow group chat invites from', message: `No one`}),
    },
  ]

  const {mutate: updateDeclaration} = useUpdateActorDeclaration({
    onError: () => {
      Toast.show(l`Failed to update settings`, {
        type: 'error',
      })
    },
  })

  const onSelectMessagesFrom = useCallback(
    (keys: string[]) => {
      const key = keys[0]
      if (!key) return
      updateDeclaration({allowIncoming: key as AllowIncoming})
    },
    [updateDeclaration],
  )

  const onSelectGroupInvitesFrom = useCallback(
    (keys: string[]) => {
      const key = keys[0]
      if (!key) return
      updateDeclaration({allowGroupInvites: key as AllowIncoming})
    },
    [updateDeclaration],
  )

  const onSelectSoundSetting = useCallback(
    (selected: boolean) => {
      setPref('playSoundChat', selected)
    },
    [setPref],
  )

  return (
    <Layout.Screen testID="messagesSettingsScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Chat Settings</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <View style={[a.py_xl, a.gap_md]}>
          <View style={[a.px_xl]}>
            <Text style={[a.pb_xs, a.text_md, a.font_semi_bold, t.atoms.text]}>
              <Trans>Allow direct messages from</Trans>
            </Text>
            <Text
              style={[
                a.pb_md,
                a.text_sm,
                a.leading_snug,
                t.atoms.text_contrast_high,
              ]}>
              <Trans>
                You can continue ongoing conversations regardless of which
                setting you choose.
              </Trans>
            </Text>
            <Toggle.Group
              label={l`Allow direct messages from`}
              type="radio"
              values={[
                (profile?.associated?.chat?.allowIncoming as AllowIncoming) ??
                  'following',
              ]}
              onChange={onSelectMessagesFrom}>
              <View>
                {allowMessagesFromOptions.map(option => (
                  <Toggle.Item
                    key={option.name}
                    highlightRow
                    name={option.name}
                    label={option.label}>
                    {({selected}) => (
                      <Toggle.RadioWithLabel
                        label={option.label}
                        selected={selected}
                      />
                    )}
                  </Toggle.Item>
                ))}
              </View>
            </Toggle.Group>
          </View>
          <Divider style={{marginVertical: 10}} />
          {isGroupChatEnabled ? (
            <>
              <View style={[a.px_xl]}>
                <Text
                  style={[a.pb_xs, a.text_md, a.font_semi_bold, t.atoms.text]}>
                  <Trans>Allow group chat invites from</Trans>
                </Text>
                <Text
                  style={[
                    a.pb_md,
                    a.text_sm,
                    a.leading_snug,
                    t.atoms.text_contrast_high,
                  ]}>
                  {groupInvitesLocked ? (
                    <Trans>
                      Group chats are only available to users 18 and over.
                    </Trans>
                  ) : (
                    <Trans>
                      You can continue ongoing conversations regardless of which
                      setting you choose.
                    </Trans>
                  )}
                </Text>
                <Toggle.Group
                  disabled={groupInvitesLocked}
                  label={l`Allow group chat invites from`}
                  type="radio"
                  values={[
                    groupInvitesLocked
                      ? 'none'
                      : resolveAllowGroupInvites(profile?.associated?.chat),
                  ]}
                  onChange={onSelectGroupInvitesFrom}>
                  <View>
                    {allowGroupInvitesFromOptions.map(option => (
                      <Toggle.Item
                        key={option.name}
                        highlightRow
                        name={option.name}
                        label={option.label}>
                        {({selected}) => (
                          <Toggle.RadioWithLabel
                            label={option.label}
                            selected={selected}
                          />
                        )}
                      </Toggle.Item>
                    ))}
                  </View>
                </Toggle.Group>
              </View>
              <Divider style={{marginVertical: 10}} />
            </>
          ) : null}
          {IS_NATIVE && (
            <>
              <View style={[a.px_xl]}>
                <Toggle.Item
                  label={l`Notification sounds`}
                  name="playSoundChat"
                  value={preferences.playSoundChat}
                  style={[a.flex_row, a.align_center, a.justify_between]}
                  onChange={onSelectSoundSetting}>
                  <BellIcon style={[a.mr_2xs, t.atoms.text]} size="lg" />
                  <Text
                    style={[
                      a.flex_1,
                      a.text_md,
                      a.font_semi_bold,
                      t.atoms.text,
                    ]}>
                    <Trans>Notification sounds</Trans>
                  </Text>
                  <Toggle.Switch />
                </Toggle.Item>
              </View>
              <Divider style={{marginVertical: 10}} />
            </>
          )}
          {CHAT_RELAY_ENABLED && <ChatRelaySettings />}
          <View style={[a.px_xl]}>
            <Toggle.Item
              label={l`Export my chat data`}
              name="playSoundChat"
              value={preferences.playSoundChat}
              style={[a.flex_row, a.align_center, a.justify_between]}
              onChange={() => {
                exportCarControl.open()
              }}>
              <CarIcon style={[a.mr_2xs, t.atoms.text]} size="lg" />
              <Text
                style={[a.flex_1, a.text_md, a.font_semi_bold, t.atoms.text]}>
                <Trans>Export my chat data</Trans>
              </Text>
              <ChevronRightIcon style={[a.ml_2xs, t.atoms.text]} size="lg" />
            </Toggle.Item>
          </View>
          <Divider style={{marginVertical: 10}} />
        </View>
      </Layout.Content>
      <ExportCarDialog control={exportCarControl} />
    </Layout.Screen>
  )
}

function ChatRelaySettings() {
  const t = useTheme()
  const {t: l} = useLingui()
  const {currentAccount} = useSession()
  const {
    data: relay,
    error: relayError,
    isError,
    isFetching,
    isPending,
    refetch,
  } = useChatRelayStatusQuery()
  const enrollment = useChatRelayEnrollmentMutation()
  const disconnect = useChatRelayDisconnectMutation()
  const update = useChatRelayPreferencesMutation()
  const isFocused = useIsFocused()
  const appState = useAppState()

  useEffect(() => {
    if (isFocused && appState === 'active') {
      void refetch().catch(() => undefined)
    }
  }, [appState, isFocused, refetch])

  const busy = enrollment.isPending || disconnect.isPending || update.isPending
  const retry = () => {
    void refetch().catch(() => undefined)
  }

  const preferences = relay?.preferences
  const connected = relay?.status === 'active' && !!preferences
  const enroll = () => {
    if (!currentAccount?.did || !currentAccount.handle) return
    void enrollment
      .mutateAsync({did: currentAccount.did, handle: currentAccount.handle})
      .catch(() => {
        Toast.show(l`Could not connect chat notifications`, {type: 'error'})
      })
  }
  const disconnectRelay = () => {
    if (!currentAccount?.did) return
    void disconnect.mutateAsync({did: currentAccount.did}).catch(() => {
      Toast.show(l`Could not disconnect chat notifications`, {type: 'error'})
    })
  }
  const updatePreferences = (
    patch: Parameters<typeof update.mutate>[0]['patch'],
  ) => {
    if (!currentAccount?.did) return
    void update.mutateAsync({did: currentAccount.did, patch}).catch(() => {
      Toast.show(l`Could not update chat notification settings`, {
        type: 'error',
      })
    })
  }

  return (
    <>
      <Divider style={{marginVertical: 10}} />
      <View style={[a.px_xl, a.gap_sm]}>
        <Text style={[a.text_md, a.font_semi_bold, t.atoms.text]}>
          <Trans>Chat notifications</Trans>
        </Text>
        <Text style={[a.text_sm, a.leading_snug, t.atoms.text_contrast_high]}>
          {isPending ? (
            <Trans>Loading chat notification settings...</Trans>
          ) : isError ? (
            __DEV__ && relayError instanceof Error ? (
              relayError.message
            ) : (
              <Trans>Could not load chat notification settings.</Trans>
            )
          ) : connected ? (
            <Trans>
              Connected. Blacksky checks your Bluesky chats while this app is
              closed. Alerts say “New message” and may take a few minutes to
              arrive.
            </Trans>
          ) : relay?.status === 'reauth_required' ? (
            <Trans>Chat notifications need to be reconnected.</Trans>
          ) : relay?.status === 'disconnected' ? (
            <Trans>Chat notifications are disabled.</Trans>
          ) : (
            <Trans>
              Enable chat notifications to receive alerts when a Bluesky chat
              arrives while the app is closed.
            </Trans>
          )}
        </Text>
        {!isPending && !isError && !connected ? (
          <Text style={[a.text_sm, a.leading_snug, t.atoms.text_contrast_high]}>
            <Trans>
              A sign-in page will ask you to let Blacksky check your chats, then
              bring you back here. Alerts may take a few minutes to arrive.
            </Trans>
          </Text>
        ) : null}
        {isPending ? null : isError ? (
          <Button
            label={l`Retry chat notification settings`}
            color="secondary"
            variant="outline"
            onPress={retry}
            disabled={isFetching || busy}>
            <ButtonText>
              <Trans>Retry</Trans>
            </ButtonText>
          </Button>
        ) : !connected ? (
          <Button
            label={
              relay?.status === 'reauth_required'
                ? l`Reconnect chat notifications`
                : l`Enable chat notifications`
            }
            color="primary"
            variant="solid"
            onPress={enroll}
            disabled={busy}>
            <ButtonText>
              {relay?.status === 'reauth_required' ? (
                <Trans>Reconnect</Trans>
              ) : (
                <Trans>Enable</Trans>
              )}
            </ButtonText>
          </Button>
        ) : (
          <>
            <Text style={[a.text_sm, a.font_semi_bold, t.atoms.text]}>
              <Trans>Messages</Trans>
            </Text>
            <Toggle.Item
              label={l`Push notifications for messages`}
              name="relay-chat-push"
              value={preferences.chat.push}
              disabled={busy}
              onChange={push => updatePreferences({chat: {push}})}>
              <Toggle.LabelText>
                <Trans>Push notifications</Trans>
              </Toggle.LabelText>
              <Toggle.Switch />
            </Toggle.Item>
            <Toggle.Group
              type="radio"
              label={l`Messages from`}
              values={[preferences.chat.include]}
              disabled={busy}
              onChange={([include]) => {
                if (include === 'all' || include === 'follows') {
                  updatePreferences({chat: {include}})
                }
              }}>
              <Toggle.Item highlightRow label={l`Everyone`} name="all">
                {({selected}) => (
                  <Toggle.RadioWithLabel
                    label={l`Everyone`}
                    selected={selected}
                  />
                )}
              </Toggle.Item>
              <Toggle.Item
                highlightRow
                label={l`People you follow`}
                name="follows">
                {({selected}) => (
                  <Toggle.RadioWithLabel
                    label={l`People you follow`}
                    selected={selected}
                  />
                )}
              </Toggle.Item>
            </Toggle.Group>
            <Text style={[a.text_sm, a.font_semi_bold, t.atoms.text]}>
              <Trans>Chat requests</Trans>
            </Text>
            <Toggle.Item
              label={l`Push notifications for chat requests`}
              name="relay-chat-request-push"
              value={preferences.chatRequest.push}
              disabled={busy}
              onChange={push => updatePreferences({chatRequest: {push}})}>
              <Toggle.LabelText>
                <Trans>Push notifications</Trans>
              </Toggle.LabelText>
              <Toggle.Switch />
            </Toggle.Item>
            <Toggle.Group
              type="radio"
              label={l`Chat requests from`}
              values={[preferences.chatRequest.include]}
              disabled={busy}
              onChange={([include]) => {
                if (include === 'all' || include === 'follows') {
                  updatePreferences({chatRequest: {include}})
                }
              }}>
              <Toggle.Item highlightRow label={l`Everyone`} name="all">
                {({selected}) => (
                  <Toggle.RadioWithLabel
                    label={l`Everyone`}
                    selected={selected}
                  />
                )}
              </Toggle.Item>
              <Toggle.Item
                highlightRow
                label={l`People you follow`}
                name="follows">
                {({selected}) => (
                  <Toggle.RadioWithLabel
                    label={l`People you follow`}
                    selected={selected}
                  />
                )}
              </Toggle.Item>
            </Toggle.Group>
            <Button
              label={l`Disconnect chat notifications`}
              color="secondary"
              variant="outline"
              onPress={disconnectRelay}
              disabled={busy}>
              <ButtonText>
                <Trans>Disconnect</Trans>
              </ButtonText>
            </Button>
          </>
        )}
      </View>
    </>
  )
}
