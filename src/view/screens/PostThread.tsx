import {spacePostUriFromRoute} from '#/lib/api/space-permalink'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {makeRecordUri} from '#/lib/strings/url-helpers'
import {useResolveDidQuery} from '#/state/queries/resolve-uri'
import {PostThread} from '#/screens/PostThread'
import * as Layout from '#/components/Layout'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'PostThread'>
export function PostThreadScreen({route}: Props) {
  const {name, rkey: rawRkey, collection: rawCollection} = route.params
  // Old share links percent-encoded '?collection=...' into the rkey segment.
  let rkey = decodeURIComponent(rawRkey)
  let collection = rawCollection
  const qIndex = rkey.indexOf('?')
  if (qIndex !== -1) {
    const qs = new URLSearchParams(rkey.slice(qIndex + 1))
    collection = collection || qs.get('collection') || undefined
    rkey = rkey.slice(0, qIndex)
  }
  const space = route.params.space

  return (
    <Layout.Screen testID="postThreadScreen">
      <PostThreadRoute
        name={name}
        rkey={rkey}
        collection={collection}
        space={space}
      />
    </Layout.Screen>
  )
}

function PostThreadRoute({
  name,
  rkey,
  collection,
  space,
}: {
  name: string
  rkey: string
  collection?: string
  space?: string
}) {
  // A space URI admits only DIDs in its author segment, so a handle in the
  // path has to be resolved before the URI can be assembled. Links the app
  // builds already carry DIDs; this covers hand-typed and shared URLs.
  const needsDid = !!space && !name.startsWith('did:')
  const {data: resolvedDid, isPending} = useResolveDidQuery(
    needsDid ? name : undefined,
  )
  if (needsDid && isPending) return null

  const author = needsDid ? resolvedDid : name
  // Falling back to the ordinary URI when the space parts do not add up gives
  // the thread's own not-found state rather than a blank screen.
  const uri =
    (space &&
      author &&
      spacePostUriFromRoute(space, author, rkey, collection)) ||
    makeRecordUri(name, collection || 'app.bsky.feed.post', rkey)

  return <PostThread uri={uri} />
}
