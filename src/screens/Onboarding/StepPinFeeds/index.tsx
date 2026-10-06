import {useState} from 'react'
import {View} from 'react-native'
import {type AppBskyGraphDefs, AppBskyGraphStarterpack} from '@atproto/api'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {useQueryClient} from '@tanstack/react-query'

import {batchedUpdates} from '#/lib/batchedUpdates'
import {useBrand} from '#/lib/community/BrandContext'
import {isBlockedOrBlocking, isMuted} from '#/lib/moderation/blocked-and-muted'
import {logger} from '#/logger'
import {updateProfileShadow} from '#/state/cache/profile-shadow'
import {getAllListMembers} from '#/state/queries/list-members'
import {useOnboardingCommunityStarterPacksQuery} from '#/state/queries/useOnboardingCommunityStarterPacksQuery'
import {useOnboardingSuggestedStarterPacksQuery} from '#/state/queries/useOnboardingSuggestedStarterPacksQuery'
import {useAgent, useSession} from '#/state/session'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {useOnboardingInternalState} from '#/screens/Onboarding/state'
import {bulkWriteFollows} from '#/screens/Onboarding/util'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {Loader} from '#/components/Loader'
import {AppBar, Eyebrow, PrimaryButton} from '#/components/onboarding-chrome'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import * as bsky from '#/types/bsky'

const AVATAR_SAMPLE = 5
const AVATAR_SIZE = 36
const AVATAR_OVERLAP = -8

export function StepPinFeeds() {
  const {_} = useLingui()
  const t = useTheme()
  const {state, dispatch} = useOnboardingInternalState()
  const brand = useBrand()

  const communityDid = brand.metadata.communityDid
  const communityQuery = useOnboardingCommunityStarterPacksQuery({
    did: communityDid ?? undefined,
    enabled: !!communityDid,
  })
  const bskyQuery = useOnboardingSuggestedStarterPacksQuery({
    enabled: !communityDid,
    overrideInterests: state.interestsStepResults.selectedInterests,
  })

  const {data, isLoading} = communityDid ? communityQuery : bskyQuery
  const starterPacks = data?.starterPacks ?? []

  const onNext = () => dispatch({type: 'next'})

  return (
    <View style={[a.gap_lg]}>
      <AppBar showBack onBack={() => dispatch({type: 'prev'})} />

      <Eyebrow step={4} total={4} />

      <View style={[a.gap_xs]}>
        <Text style={[a.font_heading, a.text_3xl, a.leading_snug]}>
          <Trans>Find your people</Trans>
        </Text>
        <Text style={[a.text_md, a.leading_snug, t.atoms.text_contrast_medium]}>
          <Trans>
            Connect with people and conversations that match your interests.
          </Trans>
        </Text>
      </View>

      {isLoading ? (
        <View style={[a.align_center, a.py_2xl]}>
          <Loader size="lg" />
        </View>
      ) : (
        <View style={[a.gap_xl]}>
          {starterPacks.map(pack => (
            <StarterPackRow key={pack.uri} pack={pack} />
          ))}
        </View>
      )}

      <View style={[a.gap_md]}>
        <Button
          label={_(msg`Skip`)}
          onPress={onNext}
          color="primary"
          variant="outline"
          size="large"
          style={[a.w_full]}>
          <ButtonText
            style={[
              a.font_mono,
              {
                fontWeight: '300',
                fontSize: 14,
                textTransform: 'uppercase',
              },
            ]}>
            <Trans>Skip</Trans>
          </ButtonText>
        </Button>
        <PrimaryButton label={_(msg`Continue`)} onPress={onNext} />
      </View>
    </View>
  )
}

function StarterPackRow({pack}: {pack: AppBskyGraphDefs.StarterPackView}) {
  const {_} = useLingui()
  const ax = useAnalytics()
  const agent = useAgent()
  const {currentAccount} = useSession()
  const queryClient = useQueryClient()
  const [isProcessing, setIsProcessing] = useState(false)
  const [isFollowing, setIsFollowing] = useState(false)

  const record = pack.record
  if (
    !bsky.dangerousIsType<AppBskyGraphStarterpack.Record>(
      record,
      AppBskyGraphStarterpack.isRecord,
    )
  ) {
    return null
  }

  const sample =
    pack.listItemsSample?.slice(0, AVATAR_SAMPLE).map(item => item.subject) ??
    []

  const onFollowAll = async () => {
    if (!pack.list) return

    setIsProcessing(true)

    let listItems: AppBskyGraphDefs.ListItemView[] = []
    try {
      listItems = await getAllListMembers(agent, pack.list.uri)
    } catch (e) {
      setIsProcessing(false)
      Toast.show(_(msg`An error occurred while trying to follow all`), {
        type: 'error',
      })
      logger.error('Failed to get list members for starter pack', {
        safeMessage: e,
      })
      return
    }

    const dids = listItems
      .filter(
        li =>
          li.subject.did !== currentAccount?.did &&
          !isBlockedOrBlocking(li.subject) &&
          !isMuted(li.subject) &&
          !li.subject.viewer?.following,
      )
      .map(li => li.subject.did)

    let followUris: Map<string, string>
    try {
      followUris = await bulkWriteFollows(agent, dids, {
        uri: pack.uri,
        cid: pack.cid,
      })
    } catch (e) {
      setIsProcessing(false)
      Toast.show(_(msg`An error occurred while trying to follow all`), {
        type: 'error',
      })
      logger.error('Failed to follow all accounts', {safeMessage: e})
      return
    }

    batchedUpdates(() => {
      for (const did of dids) {
        updateProfileShadow(queryClient, did, {
          followingUri: followUris.get(did),
        })
      }
    })
    setIsProcessing(false)
    setIsFollowing(true)
    Toast.show(_(msg`All accounts have been followed!`), {type: 'success'})
    ax.metric('starterPack:followAll', {
      logContext: 'Onboarding',
      starterPack: pack.uri,
      count: dids.length,
    })
  }

  return (
    <View style={[a.gap_sm]}>
      <Text
        emoji
        style={[a.text_md, a.font_bold, a.leading_snug]}
        numberOfLines={1}>
        {record.name}
      </Text>

      <View style={[a.flex_row, a.align_center, a.gap_md]}>
        <View style={[a.flex_row, a.flex_1]}>
          {sample.map((subject, i) => (
            <View
              key={subject.did}
              style={i > 0 ? {marginLeft: AVATAR_OVERLAP} : undefined}>
              <UserAvatar
                type="user"
                size={AVATAR_SIZE}
                avatar={subject.avatar}
              />
            </View>
          ))}
        </View>

        <Button
          label={_(msg`Follow all`)}
          disabled={isProcessing || isFollowing}
          onPress={() => void onFollowAll()}
          color="primary"
          variant="solid"
          size="small">
          <ButtonText>
            {isFollowing ? <Trans>Following</Trans> : <Trans>Follow all</Trans>}
          </ButtonText>
          {isFollowing ? (
            <ButtonIcon icon={CheckIcon} />
          ) : isProcessing ? (
            <ButtonIcon icon={Loader} />
          ) : null}
        </Button>
      </View>
    </View>
  )
}
