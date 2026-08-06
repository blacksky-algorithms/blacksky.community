import {useCallback, useState} from 'react'
import {View} from 'react-native'
import {
  type AppBskyActorDefs,
  type AppBskyActorProfile,
  type AppBskyGraphDefs,
  AppBskyGraphStarterpack,
  type Un$Typed,
} from '@atproto/api'
import {TID} from '@atproto/common-web'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {useQueryClient} from '@tanstack/react-query'

import {uploadBlob} from '#/lib/api'
import {useBrand} from '#/lib/community/BrandContext'
import {BLACKSKY_COMMUNITY_DID, BSKY_APP_ACCOUNT_DID} from '#/lib/constants'
import {useRequestNotificationsPermission} from '#/lib/notifications/notifications'
import {logger} from '#/logger'
import {useSetHasCheckedForStarterPack} from '#/state/preferences/used-starter-packs'
import {getAllListMembers} from '#/state/queries/list-members'
import {preferencesQueryKey} from '#/state/queries/preferences'
import {RQKEY as profileRQKey} from '#/state/queries/profile'
import {useAgent} from '#/state/session'
import {useOnboardingDispatch} from '#/state/shell'
import {
  useActiveStarterPack,
  useSetActiveStarterPack,
} from '#/state/shell/landing'
import {useProgressGuideControls} from '#/state/shell/progress-guide'
import {Logomark} from '#/view/icons/Logomark'
import {useOnboardingInternalState} from '#/screens/Onboarding/state'
import {
  bulkWriteFollows,
  resolveFollowDids,
  resolveStarterPackUri,
  subscribeToBrandModerationServices,
} from '#/screens/Onboarding/util'
import {atoms as a, useTheme} from '#/alf'
import {AppBar, Eyebrow, PrimaryButton} from '#/components/onboarding-chrome'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import * as bsky from '#/types/bsky'

export function StepFinished() {
  const {state, dispatch} = useOnboardingInternalState()
  const ax = useAnalytics()
  const onboardDispatch = useOnboardingDispatch()
  const [saving, setSaving] = useState(false)
  const queryClient = useQueryClient()
  const agent = useAgent()
  const requestNotificationsPermission = useRequestNotificationsPermission()
  const brand = useBrand()
  const activeStarterPack = useActiveStarterPack()
  const setActiveStarterPack = useSetActiveStarterPack()
  const setHasCheckedForStarterPack = useSetHasCheckedForStarterPack()
  const {startProgressGuide} = useProgressGuideControls()

  const finishOnboarding = useCallback(async () => {
    setSaving(true)

    let starterPack: AppBskyGraphDefs.StarterPackView | undefined
    let listItems: AppBskyGraphDefs.ListItemView[] | undefined

    // Use the active starter pack (from link) or fall back to community config default
    const starterPackUri = resolveStarterPackUri(activeStarterPack?.uri, brand)

    if (starterPackUri) {
      try {
        const spRes = await agent.app.bsky.graph.getStarterPack({
          starterPack: starterPackUri,
        })
        starterPack = spRes.data.starterPack
      } catch (e) {
        logger.error('Failed to fetch starter pack', {safeMessage: e})
        // don't tell the user, just get them through onboarding.
      }
      try {
        if (starterPack?.list) {
          listItems = await getAllListMembers(agent, starterPack.list.uri)
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
          agent,
          resolveFollowDids(
            [BSKY_APP_ACCOUNT_DID, BLACKSKY_COMMUNITY_DID],
            brand,
            listItems?.map(i => i.subject.did) ?? [],
          ),
          starterPack
            ? {uri: starterPack.uri, cid: starterPack.cid}
            : undefined,
        ),
        subscribeToBrandModerationServices(agent, agent.session?.did, brand),
        (async () => {
          // Preferences ordering: write interests before feeds so the two
          // preference updates don't race.
          await agent.setInterestsPref({tags: []})

          // Feeds the user pinned in the pin-feeds step take priority; when
          // they picked none, fall back to the active brand's default set so
          // non-Blacksky brands don't end up with Blacksky's feed URIs.
          const feedsToSave: AppBskyActorDefs.SavedFeed[] =
            selectedFeedUris.length > 0
              ? selectedFeedUris.map(uri => ({
                  type: 'feed',
                  value: uri,
                  pinned: true,
                  id: TID.nextStr(),
                }))
              : brand.feeds.defaultPinned.map(f => ({
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

          await agent.overwriteSavedFeeds(feedsToSave)
        })(),
        (async () => {
          const {imageUri, imageMime} = profileStepResults
          const blobPromise =
            imageUri && imageMime
              ? uploadBlob(agent, imageUri, imageMime)
              : undefined

          await agent.upsertProfile(async existing => {
            let next: Un$Typed<AppBskyActorProfile.Record> = existing ?? {}

            if (blobPromise) {
              const res = await blobPromise
              if (res.data.blob) {
                next.avatar = res.data.blob
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
              next.createdAt = new Date().toISOString()
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
        queryKey: profileRQKey(agent.session?.did ?? ''),
      }),
    ]).catch(e => {
      logger.error(e)
      // Keep going.
    })

    setSaving(false)
    setActiveStarterPack(undefined)
    setHasCheckedForStarterPack(true)
    startProgressGuide('follow-10')
    dispatch({type: 'finish'})
    onboardDispatch({type: 'finish'})
    ax.metric('onboarding:finished:nextPressed', {
      usedStarterPack: Boolean(starterPack),
      starterPackName:
        starterPack &&
        bsky.dangerousIsType<AppBskyGraphStarterpack.Record>(
          starterPack.record,
          AppBskyGraphStarterpack.isRecord,
        )
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
    agent,
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
  const t = useTheme()
  const brand = useBrand()

  return (
    <View style={[a.gap_lg]}>
      <AppBar showBack onBack={() => dispatch({type: 'prev'})} />

      <Eyebrow label={_(msg`Welcome`)} />

      <View style={[a.gap_xs]}>
        <Text style={[a.font_heading, a.text_3xl, a.leading_snug]}>
          {brand.messages.welcomeMessage}
        </Text>
        <Text style={[a.text_md, a.leading_snug, t.atoms.text_contrast_medium]}>
          <Trans>
            You're all set. Your feeds are ready and your community is waiting.
          </Trans>
        </Text>
      </View>

      <View style={[a.w_full, a.align_center, a.py_5xl]}>
        <Logomark width={96} fill={t.atoms.text.color} />
      </View>

      <PrimaryButton
        testID="onboardingFinish"
        label={saving ? _(msg`Finalizing`) : _(msg`Let's go`)}
        disabled={saving}
        onPress={() => finishOnboarding()}
      />
    </View>
  )
}
