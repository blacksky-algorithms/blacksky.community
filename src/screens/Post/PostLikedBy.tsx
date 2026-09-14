import {Plural, Trans} from '@lingui/react/macro'

import {spacePostUriFromRoute} from '#/lib/api/space-permalink'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {makeRecordUri} from '#/lib/strings/url-helpers'
import {usePostQuery} from '#/state/queries/post'
import {useResolveDidQuery} from '#/state/queries/resolve-uri'
import {PostLikedBy as PostLikedByComponent} from '#/view/com/post-thread/PostLikedBy'
import * as Layout from '#/components/Layout'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'PostLikedBy'>
export const PostLikedByScreen = ({route}: Props) => {
  return <PostLikedByRoute {...route.params} />
}

function PostLikedByRoute({
  name,
  rkey,
  collection,
  space,
}: CommonNavigatorParams['PostLikedBy']) {
  const needsDid = !!space && !name.startsWith('did:')
  const {data: resolvedDid, isPending} = useResolveDidQuery(
    needsDid ? name : undefined,
  )
  const uri =
    needsDid && isPending
      ? undefined
      : (space &&
          spacePostUriFromRoute(
            space,
            needsDid ? resolvedDid || '' : name,
            rkey,
            collection,
          )) ||
        makeRecordUri(name, collection || 'app.bsky.feed.post', rkey)
  const {data: post} = usePostQuery(uri)
  if (!uri) return null

  let likeCount
  if (post) {
    likeCount = post.likeCount
  }

  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          {post && (
            <>
              <Layout.Header.TitleText>
                <Trans>Liked By</Trans>
              </Layout.Header.TitleText>
              <Layout.Header.SubtitleText>
                <Plural value={likeCount ?? 0} one="# like" other="# likes" />
              </Layout.Header.SubtitleText>
            </>
          )}
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <PostLikedByComponent uri={uri} />
    </Layout.Screen>
  )
}
