import {type Client, type XrpcRequestParams} from '@atproto/lex'

import {
  fetchCommunityPostView,
  isCommunityPostUri,
} from '#/lib/api/community-post'
import {logger} from '#/logger'
import {app} from '#/lexicons'
import {type FeedAPI, type FeedAPIResponse} from './types'

type GetPostsParams = XrpcRequestParams<typeof app.bsky.feed.getPosts.main>

export class PostListFeedAPI implements FeedAPI {
  client: Client
  params: GetPostsParams
  peek: app.bsky.feed.defs.FeedViewPost | null = null

  constructor({
    client,
    feedParams,
  }: {
    client: Client
    feedParams: GetPostsParams
  }) {
    this.client = client
    if (feedParams.uris.length > 25) {
      logger.warn(
        `Too many URIs provided - expected 25, got ${feedParams.uris.length}`,
      )
    }
    this.params = {
      uris: feedParams.uris.slice(0, 25),
    }
  }

  async peekLatest(): Promise<app.bsky.feed.defs.FeedViewPost> {
    if (this.peek) return this.peek
    throw new Error('Has not fetched yet')
  }

  async fetch({}: {}): Promise<FeedAPIResponse> {
    /*
     * A failed request rejects rather than resolving, so the error propagates
     * to the query and drives the feed error UI. The agent behaved the same
     * way - its `success` flag was only ever true - so the empty-page branch
     * this replaces was unreachable.
     */
    /*
     * `getPosts` only takes at-uris and only serves public posts, so community
     * and permissioned-space posts are read one by one through the
     * membership-gated route. One the viewer can no longer read is left out.
     */
    const community = this.params.uris.filter(uri => isCommunityPostUri(uri))
    const standard = this.params.uris.filter(uri => !isCommunityPostUri(uri))
    const [data, communityPosts] = await Promise.all([
      standard.length > 0
        ? this.client.call(app.bsky.feed.getPosts, {uris: standard})
        : {posts: []},
      Promise.all(
        community.map(uri =>
          fetchCommunityPostView(this.client, uri).catch(() => undefined),
        ),
      ),
    ])
    const byUri = new Map<string, app.bsky.feed.defs.PostView>()
    for (const post of [...data.posts, ...communityPosts]) {
      if (post) byUri.set(post.uri, post)
    }
    const posts = this.params.uris.flatMap(uri => {
      const post = byUri.get(uri)
      return post ? [post] : []
    })
    this.peek = {post: posts[0]}
    return {
      feed: posts.map(post => ({post})),
    }
  }
}
