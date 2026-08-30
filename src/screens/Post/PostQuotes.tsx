import {Plural, Trans} from '@lingui/react/macro'

import {spacePostUriFromRoute} from '#/lib/api/space-permalink'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {makeRecordUri} from '#/lib/strings/url-helpers'
import {usePostQuery} from '#/state/queries/post'
import {useResolveDidQuery} from '#/state/queries/resolve-uri'
import {PostQuotes as PostQuotesComponent} from '#/view/com/post-thread/PostQuotes'
import * as Layout from '#/components/Layout'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'PostQuotes'>
export const PostQuotesScreen = ({route}: Props) => {
  return <PostQuotesRoute {...route.params} />
}

function PostQuotesRoute({
  name,
  rkey,
  collection,
  space,
}: CommonNavigatorParams['PostQuotes']) {
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

  let quoteCount
  if (post) {
    quoteCount = post.quoteCount
  }

  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          {post && (
            <>
              <Layout.Header.TitleText>
                <Trans>Quotes</Trans>
              </Layout.Header.TitleText>
              <Layout.Header.SubtitleText>
                <Plural
                  value={quoteCount ?? 0}
                  one="# quote"
                  other="# quotes"
                />
              </Layout.Header.SubtitleText>
            </>
          )}
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <PostQuotesComponent uri={uri} />
    </Layout.Screen>
  )
}
