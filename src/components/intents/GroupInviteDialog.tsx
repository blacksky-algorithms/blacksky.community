import {useCallback, useEffect, useRef, useState} from 'react'
import {View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {
  isGroupInviteE2EFailure,
  maybeFailGroupInviteE2E,
} from '#/lib/api/group-invite-e2e'
import {
  getDefaultGroupInviteFeedUris,
  getFirstSelectedGroupInviteFeed,
  getGroupInviteFeedMutations,
  getGroupInviteMembershipCopy,
  getGroupInviteNoPostCopy,
  groupInviteErrorCopy,
  groupInviteFailureName,
  shouldOpenGroupInviteFeedAfterPinning,
  shouldResetGroupInvitePinning,
  shouldTrackGroupInviteOpened,
  summarizeGroupInviteFeeds,
} from '#/lib/api/group-invite-ui'
import {
  type GroupInviteAcceptance,
  GroupInviteClientError,
  GroupInviteError,
} from '#/lib/api/group-invites'
import {type NavigationProp} from '#/lib/routes/types'
import {logger} from '#/logger'
import {
  useAcceptGroupInviteMutation,
  useGroupInvitePreviewQuery,
} from '#/state/queries/group-invites'
import {
  useAddSavedFeedsMutation,
  usePreferencesQuery,
  useUpdateSavedFeedsMutation,
} from '#/state/queries/preferences'
import {useSessionApi} from '#/state/session'
import {useSetActiveLanding} from '#/state/shell/landing'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {useSetSelectedFeed} from '#/state/shell/selected-feed'
import {atoms as a, useTheme, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import * as Toggle from '#/components/forms/Toggle'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {useIntentDialogs} from './IntentDialogs'

export function GroupInviteDialog() {
  const {groupInviteDialogControl, groupInviteState, setGroupInviteState} =
    useIntentDialogs()
  return (
    <Dialog.Outer
      control={groupInviteDialogControl}
      onClose={() => setGroupInviteState(undefined)}
      nativeOptions={{preventExpansion: true}}>
      <Dialog.Handle testID="groupInviteDialogHandle" />
      <GroupInviteDialogContent
        key={groupInviteState?.code ?? 'empty'}
        code={groupInviteState?.code}
      />
      <Dialog.Close />
    </Dialog.Outer>
  )
}

export function GroupInviteDialogContent({code}: {code?: string}) {
  const {t: l} = useLingui()
  const ax = useAnalytics()
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const {groupInviteDialogControl} = useIntentDialogs()
  const {logoutCurrentAccount} = useSessionApi()
  const {requestSwitchToAccount} = useLoggedOutViewControls()
  const setActiveLanding = useSetActiveLanding()
  const {
    data: preview,
    error: previewError,
    isPending: isPreviewPending,
    refetch: refetchPreview,
  } = useGroupInvitePreviewQuery(code)
  const {
    mutateAsync: acceptInvite,
    isPending: isAcceptPending,
    error: acceptError,
    reset: resetAccept,
  } = useAcceptGroupInviteMutation()
  const {mutateAsync: addSavedFeeds} = useAddSavedFeedsMutation()
  const {mutateAsync: updateSavedFeeds} = useUpdateSavedFeedsMutation()
  const preferencesQuery = usePreferencesQuery()
  const {data: preferences} = preferencesQuery
  const savedFeeds = preferences?.savedFeeds
  const preferencesReady = preferencesQuery.isSuccess
  const setSelectedFeed = useSetSelectedFeed()
  const [acceptance, setAcceptance] = useState<GroupInviteAcceptance>()
  const [selectedFeedUris, setSelectedFeedUris] = useState<string[]>([])
  const [hasPinned, setHasPinned] = useState(false)
  const [pinError, setPinError] = useState<'pinning' | 'navigation'>()
  const [isPinning, setIsPinning] = useState(false)
  const reportedPreviewError = useRef<unknown>(undefined)
  const acceptingRef = useRef(false)

  useEffect(() => {
    if (code && shouldTrackGroupInviteOpened(code)) {
      ax.metric('groupInvite:opened', {hasSession: true})
    }
  }, [ax, code])

  useEffect(() => {
    if (!previewError || reportedPreviewError.current === previewError) return
    reportedPreviewError.current = previewError
    ax.metric('groupInvite:failure', {
      errorName: groupInviteFailureName(previewError),
    })
  }, [ax, previewError])

  const openSelectedFeed = useCallback(() => {
    if (!acceptance) return
    const feed = getFirstSelectedGroupInviteFeed(
      acceptance.feeds,
      new Set(selectedFeedUris),
    )
    if (!feed?.uri) return
    maybeFailGroupInviteE2E('navigation')
    setSelectedFeed(`feedgen|${feed.uri}`)
    groupInviteDialogControl.close()
    navigation.navigate('HomeTab')
  }, [
    acceptance,
    groupInviteDialogControl,
    navigation,
    selectedFeedUris,
    setSelectedFeed,
  ])

  const pinAndOpen = useCallback(async () => {
    if (!acceptance || isPinning || !preferencesReady) return
    const selectedUris = new Set(selectedFeedUris)
    const {readable} = summarizeGroupInviteFeeds(acceptance.feeds)
    const selectedReadable = readable.filter(
      feed => feed.uri && selectedUris.has(feed.uri),
    )
    if (selectedReadable.length === 0) return

    setIsPinning(true)
    try {
      const {toAdd, toUpdate} = getGroupInviteFeedMutations(
        acceptance.feeds,
        savedFeeds,
        selectedUris,
      )
      if (toUpdate.length) {
        maybeFailGroupInviteE2E('saved-feed-update')
        await updateSavedFeeds(toUpdate)
      }
      if (toAdd.length) {
        maybeFailGroupInviteE2E('saved-feed-add')
        await addSavedFeeds(toAdd)
      }
      setHasPinned(true)
      setPinError(undefined)
      if (
        shouldOpenGroupInviteFeedAfterPinning(acceptance.feeds, selectedUris)
      ) {
        openSelectedFeed()
      }
    } catch (error) {
      setPinError(
        isGroupInviteE2EFailure(error, 'navigation') ? 'navigation' : 'pinning',
      )
      ax.metric('groupInvite:failure', {
        errorName: isGroupInviteE2EFailure(error, 'navigation')
          ? 'NavigationFailed'
          : 'PinningFailed',
      })
      logger.error('Failed to complete group invite feed setup', {
        errorName: isGroupInviteE2EFailure(error, 'navigation')
          ? 'NavigationFailed'
          : 'PinningFailed',
      })
    } finally {
      setIsPinning(false)
    }
  }, [
    acceptance,
    addSavedFeeds,
    ax,
    openSelectedFeed,
    isPinning,
    selectedFeedUris,
    updateSavedFeeds,
    savedFeeds,
    preferencesReady,
  ])

  const reauthenticate = useCallback(() => {
    if (!code) return
    setActiveLanding({type: 'groupinvite', uri: '', code})
    groupInviteDialogControl.close()
    logoutCurrentAccount('GroupInvite')
    requestSwitchToAccount({requestedAccount: 'groupinvite'})
  }, [
    code,
    groupInviteDialogControl,
    logoutCurrentAccount,
    requestSwitchToAccount,
    setActiveLanding,
  ])

  const onAccept = async () => {
    if (!code || !preview || acceptingRef.current || isAcceptPending) return
    acceptingRef.current = true
    resetAccept()
    setPinError(undefined)
    setHasPinned(false)
    try {
      ax.metric('groupInvite:acceptAttempted', {})
      const result = await acceptInvite({
        code,
        communityDid: preview.community.did,
      })
      setAcceptance(result)
      setSelectedFeedUris(getDefaultGroupInviteFeedUris(result.feeds))
      ax.metric('groupInvite:joined', {
        hasPosting: result.feeds.some(feed => feed.canView && feed.canPost),
      })
    } catch (error) {
      ax.metric('groupInvite:failure', {
        errorName: groupInviteFailureName(error),
      })
      logger.info('Group invite acceptance failed', {
        errorName: groupInviteFailureName(error),
      })
    } finally {
      acceptingRef.current = false
    }
  }

  const error = previewError || acceptError
  const isPending = isPreviewPending || isAcceptPending
  const onSelectedFeedUrisChange = useCallback(
    (nextUris: string[]) => {
      if (
        hasPinned &&
        shouldResetGroupInvitePinning(selectedFeedUris, nextUris)
      ) {
        setHasPinned(false)
        setPinError(undefined)
      }
      setSelectedFeedUris(nextUris)
    },
    [hasPinned, selectedFeedUris],
  )

  return (
    <Dialog.ScrollableInner
      label={l`Join group`}
      style={[web({maxWidth: 420, borderRadius: 36})]}>
      <View style={[a.gap_lg, a.p_lg]}>
        {isPending && !preview ? (
          <Loader size="xl" />
        ) : error ? (
          <InviteErrorState
            message={groupInviteErrorCopy(error)}
            onRetry={() => {
              if (previewError) void refetchPreview()
              else if (
                acceptError instanceof GroupInviteClientError &&
                acceptError.code === GroupInviteError.AuthenticationRequired
              )
                reauthenticate()
              else void onAccept()
            }}
          />
        ) : preview ? (
          <>
            <View style={[a.gap_xs]}>
              <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                <Trans>Group invite</Trans>
              </Text>
              <Text style={[a.text_2xl, a.font_bold]}>
                {preview.group.displayName}
              </Text>
              <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
                {preview.community.name}
              </Text>
            </View>
            {acceptance ? (
              <AcceptedState
                acceptance={acceptance}
                pinError={pinError}
                hasPinned={hasPinned}
                isPinning={isPinning}
                selectedFeedUris={selectedFeedUris}
                onSelectedFeedUrisChange={onSelectedFeedUrisChange}
                preferencesPending={preferencesQuery.isPending}
                preferencesError={preferencesQuery.isError}
                onRetryPreferences={() => void preferencesQuery.refetch()}
                onPinAndOpen={() => void pinAndOpen()}
                onOpenFeed={() => {
                  try {
                    openSelectedFeed()
                  } catch {
                    setPinError('navigation')
                    ax.metric('groupInvite:failure', {
                      errorName: 'NavigationFailed',
                    })
                  }
                }}
              />
            ) : (
              <Button
                testID="groupInviteAcceptButton"
                label={l`Accept group invite`}
                color="primary"
                size="large"
                onPress={() => void onAccept()}
                style={[a.w_full]}>
                <ButtonText>
                  <Trans>Join group</Trans>
                </ButtonText>
              </Button>
            )}
          </>
        ) : null}
      </View>
    </Dialog.ScrollableInner>
  )
}

function AcceptedState({
  acceptance,
  pinError,
  hasPinned,
  isPinning,
  selectedFeedUris,
  onSelectedFeedUrisChange,
  preferencesPending,
  preferencesError,
  onRetryPreferences,
  onPinAndOpen,
  onOpenFeed,
}: {
  acceptance: GroupInviteAcceptance
  pinError: 'pinning' | 'navigation' | undefined
  hasPinned: boolean
  isPinning: boolean
  selectedFeedUris: string[]
  onSelectedFeedUrisChange: (uris: string[]) => void
  preferencesPending: boolean
  preferencesError: boolean
  onRetryPreferences: () => void
  onPinAndOpen: () => void
  onOpenFeed: () => void
}) {
  const {t: l} = useLingui()
  const readable = acceptance.feeds.filter(feed => feed.canView)
  const membershipCopy = getGroupInviteMembershipCopy(acceptance.feeds)
  const hasSelectedReadable = readable.some(
    feed => feed.uri && selectedFeedUris.includes(feed.uri),
  )
  return (
    <View testID="groupInviteAcceptedMembership" style={[a.gap_md]}>
      <Text testID="groupInviteMembershipCopy" style={[a.font_semi_bold]}>
        <Trans>You joined {acceptance.groupName}.</Trans>
      </Text>
      {readable.length > 0 ? (
        <Toggle.Group
          type="checkbox"
          label={l`Feeds to pin`}
          values={selectedFeedUris}
          onChange={onSelectedFeedUrisChange}
          style={[a.gap_xs]}>
          {readable.map((feed, index) => {
            const capability = feed.canPost ? 'Post + read' : 'Read only'
            const label = `${feed.name} — ${capability}`
            return (
              <Toggle.Item
                key={feed.uri}
                testID={`groupInviteFeedOption-${index}`}
                name={feed.uri}
                label={label}
                highlightRow>
                <Toggle.Checkbox />
                <Toggle.LabelText>{label}</Toggle.LabelText>
              </Toggle.Item>
            )
          })}
        </Toggle.Group>
      ) : null}
      {membershipCopy && (
        <Text
          testID={
            readable.length === 0
              ? 'groupInviteNoReadableFeeds'
              : 'groupInviteNoPostableFeeds'
          }>
          {membershipCopy}
        </Text>
      )}
      {preferencesPending && (
        <Text testID="groupInvitePreferencesLoading">
          <Trans>Loading your saved feeds…</Trans>
        </Text>
      )}
      {preferencesError && (
        <InviteErrorState
          testID="groupInvitePreferencesError"
          message="We couldn't load your saved feeds. Membership is complete; try again to pin feeds."
          retryLabel="Retry loading feeds"
          retryTestID="groupInvitePreferencesRetryButton"
          onRetry={onRetryPreferences}
        />
      )}
      {readable.length === 0 && (
        <Text testID="groupInviteNoReadableWarning">
          {getGroupInviteNoPostCopy()}
        </Text>
      )}
      {readable.length > 0 && !hasPinned && (
        <Button
          testID="groupInvitePinOpenButton"
          label={l`Pin selected feeds`}
          color="primary"
          size="large"
          disabled={
            !hasSelectedReadable ||
            isPinning ||
            preferencesPending ||
            preferencesError
          }
          onPress={onPinAndOpen}>
          <ButtonText>
            <Trans>Pin selected feeds</Trans>
          </ButtonText>
        </Button>
      )}
      {pinError === 'pinning' && (
        <InviteErrorState
          testID="groupInvitePinError"
          message="We could not save your feeds. Please try again."
          retryLabel="Retry Pinning"
          retryTestID="groupInvitePinRetryButton"
          onRetry={onPinAndOpen}
        />
      )}
      {pinError === 'navigation' && (
        <InviteErrorState
          testID="groupInviteNavigationError"
          message="We couldn't open this feed. Your membership and saved feeds are preserved. Please try again."
          retryLabel="Retry Open Feed"
          retryTestID="groupInviteNavigationRetryButton"
          onRetry={onOpenFeed}
        />
      )}
      {hasPinned && hasSelectedReadable && (
        <Button
          testID="groupInviteOpenFeedButton"
          label={l`Open feed`}
          color="secondary"
          size="large"
          onPress={onOpenFeed}>
          <ButtonText>
            <Trans>Open feed</Trans>
          </ButtonText>
        </Button>
      )}
    </View>
  )
}

function InviteErrorState({
  message,
  onRetry,
  retryLabel,
  testID,
  retryTestID,
}: {
  message: string
  onRetry: () => void
  retryLabel?: string
  testID?: string
  retryTestID?: string
}) {
  const {t: l} = useLingui()
  return (
    <View testID={testID} style={[a.gap_md]}>
      <Text>{message}</Text>
      <Button
        testID={retryTestID ?? 'groupInviteRetryButton'}
        label={retryLabel ?? l`Try again`}
        color="secondary"
        size="large"
        onPress={onRetry}>
        <ButtonText>{retryLabel ?? <Trans>Try again</Trans>}</ButtonText>
      </Button>
    </View>
  )
}
