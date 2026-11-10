import {useCallback, useState} from 'react'
import {View} from 'react-native'
import {TID} from '@atproto/common-web'
import {type Un$Typed} from '@atproto/lex'
import {type AtUriString, toDatetimeString} from '@atproto/syntax'
import {overwriteSavedFeeds, setInterestsPref, upsertProfile} from '@bsky/sdk'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {useQueryClient} from '@tanstack/react-query'

import {uploadBlob} from '#/lib/api'
import {useBrand} from '#/lib/community/BrandContext'
import {
  BLACKSKY_COMMUNITY_DID,
  BSKY_APP_ACCOUNT_DID,
  FEEDBACK_FORM_URL,
} from '#/lib/constants'
import {prioritizeForYouForBlackskyPds} from '#/lib/default-feeds'
import {useOpenLink} from '#/lib/hooks/useOpenLink'
import {useRequestNotificationsPermission} from '#/lib/notifications/notifications'
import {logger} from '#/logger'
import {useSetHasCheckedForStarterPack} from '#/state/preferences/used-starter-packs'
import {getAllListMembers} from '#/state/queries/list-members'
import {preferencesQueryKey} from '#/state/queries/preferences'
import {RQKEY as profileRQKey} from '#/state/queries/profile'
import {useAppviewClient, usePdsClient, useSession} from '#/state/session'
import {useOnboardingDispatch} from '#/state/shell'
import {
  useActiveStarterPack,
  useSetActiveStarterPack,
} from '#/state/shell/landing'
import {useProgressGuideControls} from '#/state/shell/progress-guide'
import {ConnectedApps} from '#/screens/Onboarding/ConnectedApps'
import {useOnboardingInternalState} from '#/screens/Onboarding/state'
import {
  bulkWriteFollows,
  resolveFollowDids,
  resolveStarterPackUri,
  subscribeToBrandModerationServices,
} from '#/screens/Onboarding/util'
import {atoms as a, useTheme} from '#/alf'
import {
  AppBar,
  Eyebrow,
  Footer,
  PrimaryButton,
} from '#/components/onboarding-chrome'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {app} from '#/lexicons'
import * as bsky from '#/types/bsky'

export function StepFinished() {
  const {state, dispatch} = useOnboardingInternalState()
  const ax = useAnalytics()
  const onboardDispatch = useOnboardingDispatch()
  const [saving, setSaving] = useState(false)
  const queryClient = useQueryClient()
  const pdsClient = usePdsClient()
  const appviewClient = useAppviewClient()
  const {currentAccount} = useSession()
  const requestNotificationsPermission = useRequestNotificationsPermission()
  const brand = useBrand()
  const activeStarterPack = useActiveStarterPack()
  const setActiveStarterPack = useSetActiveStarterPack()
  const setHasCheckedForStarterPack = useSetHasCheckedForStarterPack()
  const {startProgressGuide} = useProgressGuideControls()

  const finishOnboarding = useCallback(async () => {
    setSaving(true)

    let starterPack: app.bsky.graph.defs.StarterPackView | undefined
    let listItems: app.bsky.graph.defs.ListItemView[] | undefined

    // Use the active starter pack (from link) or fall back to community config default
    const starterPackUri = resolveStarterPackUri(activeStarterPack?.uri, brand)

    if (starterPackUri) {
      try {
        const spRes = await appviewClient.call(app.bsky.graph.getStarterPack, {
          starterPack: starterPackUri as AtUriString,
        })
        starterPack = spRes.starterPack
      } catch (e) {
        logger.error('Failed to fetch starter pack', {safeMessage: e})
        // don't tell the user, just get them through onboarding.
      }
      try {
        if (starterPack?.list) {
          listItems = await getAllListMembers(
            appviewClient,
            starterPack.list.uri,
          )
        }
      } catch (e) {
        logger.error('Failed to fetch starter pack list items', {
          safeMessage: e,
        })
        // don't tell the user, just get them through onboarding.
      }
    }

    try {
      const {pinFeedsStepResults, profileStepResults} = state
      const {selectedFeedUris} = pinFeedsStepResults

      await Promise.all([
        bulkWriteFollows(
          pdsClient,
          appviewClient,
          resolveFollowDids(
            [BSKY_APP_ACCOUNT_DID, BLACKSKY_COMMUNITY_DID],
            brand,
            listItems?.map(i => i.subject.did) ?? [],
          ),
          starterPack
            ? {uri: starterPack.uri, cid: starterPack.cid}
            : undefined,
        ),
        subscribeToBrandModerationServices(pdsClient, brand),
        (async () => {
          // Preferences ordering: write interests before feeds so the two
          // preference updates don't race.
          await pdsClient.call(setInterestsPref, {tags: []})

          // Feeds the user pinned in the pin-feeds step take priority; when
          // they picked none, fall back to the active brand's default set so
          // non-Blacksky brands don't end up with Blacksky's feed URIs.
          const feedsToSave: app.bsky.actor.defs.SavedFeed[] =
            selectedFeedUris.length > 0
              ? selectedFeedUris.map(uri => ({
                  type: 'feed',
                  value: uri,
                  pinned: true,
                  id: TID.nextStr(),
                }))
              : prioritizeForYouForBlackskyPds(
                  brand.feeds.defaultPinned,
                  currentAccount?.service,
                ).map(f => ({
                  ...f,
                  id: TID.nextStr(),
                }))

          // Any starter pack feeds will be pinned _after_ the defaults
          if (starterPack && starterPack.feeds?.length) {
            feedsToSave.push(
              ...starterPack.feeds.map(f => ({
                type: 'feed',
                value: f.uri,
                pinned: true,
                id: TID.nextStr(),
              })),
            )
          }

          await pdsClient.call(overwriteSavedFeeds, feedsToSave)
        })(),
        (async () => {
          const {imageUri, imageMime} = profileStepResults
          const blobPromise =
            imageUri && imageMime
              ? uploadBlob(pdsClient, imageUri, imageMime)
              : undefined

          await pdsClient.call(upsertProfile, async existing => {
            let next: Un$Typed<app.bsky.actor.profile.Main> = existing ?? {}

            if (blobPromise) {
              const res = await blobPromise
              if (res.blob) {
                next.avatar = res.blob
              }
            }

            if (starterPack) {
              next.joinedViaStarterPack = {
                uri: starterPack.uri,
                cid: starterPack.cid,
              }
            }

            next.displayName = ''

            if (!next.createdAt) {
              next.createdAt = toDatetimeString(new Date())
            }
            return next
          })

          ax.metric('onboarding:finished:avatarResult', {
            avatarResult: profileStepResults.isCreatedAvatar
              ? 'created'
              : profileStepResults.image
                ? 'uploaded'
                : 'default',
          })
        })(),
        requestNotificationsPermission('AfterOnboarding'),
      ])
    } catch (e: any) {
      logger.info(`onboarding: bulk save failed`)
      logger.error(e)
      // don't alert the user, just let them into their account
    }

    // Try to ensure that prefs and profile are up-to-date by the time we render Home.
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: preferencesQueryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: profileRQKey(pdsClient.did ?? ''),
      }),
    ]).catch(e => {
      logger.error(e)
      // Keep going.
    })

    setSaving(false)
    setActiveStarterPack(undefined)
    setHasCheckedForStarterPack(true)
    startProgressGuide('welcome')
    dispatch({type: 'finish'})
    onboardDispatch({type: 'finish'})
    ax.metric('onboarding:finished:nextPressed', {
      usedStarterPack: Boolean(starterPack),
      starterPackName:
        starterPack &&
        bsky.isType(app.bsky.graph.starterpack, starterPack.record)
          ? starterPack.record.name
          : undefined,
      starterPackCreator: starterPack?.creator.did,
      starterPackUri: starterPack?.uri,
      profilesFollowed: listItems?.length ?? 0,
      feedsPinned: starterPack?.feeds?.length ?? 0,
    })
    if (starterPack && listItems?.length) {
      ax.metric('starterPack:followAll', {
        logContext: 'Onboarding',
        starterPack: starterPack.uri,
        count: listItems?.length,
      })
    }
  }, [
    ax,
    queryClient,
    pdsClient,
    appviewClient,
    currentAccount,
    brand,
    dispatch,
    onboardDispatch,
    activeStarterPack,
    state,
    requestNotificationsPermission,
    setActiveStarterPack,
    setHasCheckedForStarterPack,
    startProgressGuide,
  ])

  return (
    <ValueProposition
      finishOnboarding={finishOnboarding}
      saving={saving}
      dispatch={dispatch}
    />
  )
}

function ValueProposition({
  finishOnboarding,
  saving,
  dispatch,
}: {
  finishOnboarding: () => void
  saving: boolean
  dispatch: ReturnType<typeof useOnboardingInternalState>['dispatch']
}) {
  const {_} = useLingui()
  const openLink = useOpenLink()
  const t = useTheme()
  const brand = useBrand()

  return (
    <View style={[a.flex_1, a.gap_lg]}>
      <AppBar
        showBack
        onBack={() => dispatch({type: 'prev'})}
        onHelp={() => openLink(FEEDBACK_FORM_URL({}))}
      />

      <Eyebrow label={_(msg`Connected apps`)} />

      <View style={[a.gap_xs]}>
        <Text style={[a.font_heading, a.text_3xl, a.leading_snug]}>
          <Trans>One account, a whole network</Trans>
        </Text>
        <Text
          style={[
            a.text_md,
            a.leading_snug,
            t.atoms.text,
            {fontWeight: '300', fontSize: 14, lineHeight: 22},
          ]}>
          <Trans>
            Use your {brand.metadata.displayName} account to blog, live stream,
            post short videos, and more, across a growing ecosystem of apps.
          </Trans>
        </Text>
      </View>

      <ConnectedApps />

      <Footer>
        <PrimaryButton
          testID="onboardingFinish"
          label={saving ? _(msg`Finalizing`) : _(msg`Continue`)}
          disabled={saving}
          onPress={() => finishOnboarding()}
        />
      </Footer>
    </View>
  )
}
