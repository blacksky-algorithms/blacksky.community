import {createServer as createHTTPServer} from 'node:http'
import {parse} from 'node:url'

import {
  GroupInviteFixture,
  type GroupInviteFixtureFeed,
  type GroupInviteFixtureScenario,
  isGroupInviteFixtureScenario,
} from './group-invite-fixture.ts'
import {createServer, type TestPDS} from './test-pds.ts'

let server: TestPDS

const GROUP_INVITE_COMMUNITY_DID = 'did:plc:e2e-community'

async function ensureGroupInviteUsers(testPds: TestPDS) {
  for (const name of ['alice', 'bob']) {
    if (!testPds.mocker.users[name]) {
      await testPds.mocker.createUser(name)
    }
  }
}

async function seedGroupInviteFixture(
  testPds: TestPDS,
  scenario: GroupInviteFixtureScenario,
) {
  await ensureGroupInviteUsers(testPds)

  const post = await testPds.mocker.createPost(
    'alice',
    'Synthetic group invite feed post',
  )
  const postUris = [post.uri]
  const readOnly = await testPds.mocker.createFeed(
    'alice',
    'e2e-group-read',
    postUris,
  )
  const postable = await testPds.mocker.createFeed(
    'alice',
    'e2e-group-post',
    postUris,
  )
  const inaccessible = await testPds.mocker.createFeed(
    'alice',
    'e2e-group-hidden',
    postUris,
  )

  const feeds: GroupInviteFixtureFeed[] = [
    {
      uri: readOnly.uri,
      name: 'Read only feed',
      canView: scenario !== 'zero-readable',
      canPost: false,
    },
    {
      uri: postable.uri,
      name: 'Postable feed',
      canView: scenario !== 'zero-readable',
      canPost: true,
    },
    {
      uri: inaccessible.uri,
      name: 'Inaccessible feed',
      canView: false,
      canPost: false,
    },
  ]

  const fixture = new GroupInviteFixture(scenario)
  fixture.configure({
    scenario,
    communityDid: GROUP_INVITE_COMMUNITY_DID,
    feeds,
  })
  testPds.groupInviteFixture = fixture

  if (
    scenario === 'existing-unpinned' ||
    scenario === 'pin-update' ||
    scenario === 'pin-add'
  ) {
    await testPds.mocker.users.alice.agent.overwriteSavedFeeds([
      {id: readOnly.uri, type: 'feed', value: readOnly.uri, pinned: false},
    ])
  }

  // Ensure the local AppView has indexed the feed-generator records before a
  // client can navigate to one from the invite dialog.
  await testPds.mocker.testNet.processAll()
}

function decodeServiceAuthIssuer(authorization: string | undefined) {
  if (!authorization || !/^Bearer\s+\S+$/.test(authorization)) {
    return undefined
  }
  const token = authorization.split(/\s+/)[1]
  const payload = token?.split('.')[1]
  if (!payload) return undefined
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as {iss?: unknown; sub?: unknown}
    if (typeof parsed.iss === 'string') return parsed.iss
    if (typeof parsed.sub === 'string') return parsed.sub
  } catch {
    // The fixture intentionally treats an undecodable token as unauthenticated.
  }
  return undefined
}

async function readRequestBody(req: import('node:http').IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

function sendJson(
  res: import('node:http').ServerResponse,
  status: number,
  body: Record<string, unknown>,
) {
  res.writeHead(status, {'content-type': 'application/json'})
  res.end(JSON.stringify(body))
}

function inputCode(value: unknown) {
  if (!value || typeof value !== 'object') return undefined
  const wrapped = (value as {json?: unknown}).json
  const input = wrapped && typeof wrapped === 'object' ? wrapped : value
  const code = (input as {code?: unknown}).code
  return typeof code === 'string' ? code : undefined
}

async function handleGroupInviteRequest(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  procedure: 'preview' | 'accept',
  query: Record<string, string | string[] | undefined>,
) {
  const fixture = server?.groupInviteFixture
  if (!fixture) {
    sendJson(res, 503, {
      error: {
        json: {
          message: 'AuthorizationUnavailable',
          data: {code: 'SERVICE_UNAVAILABLE'},
        },
      },
    })
    return
  }

  let input: unknown
  if (req.method === 'GET') {
    const rawInput = query.input
    if (typeof rawInput === 'string') {
      try {
        input = JSON.parse(rawInput)
      } catch {
        input = undefined
      }
    }
  } else {
    try {
      input = JSON.parse(await readRequestBody(req))
    } catch {
      input = undefined
    }
  }

  const code = inputCode(input) ?? ''
  const result =
    procedure === 'preview'
      ? fixture.preview(code)
      : fixture.accept({
          code,
          authorization:
            typeof req.headers.authorization === 'string'
              ? req.headers.authorization
              : undefined,
          memberDid: decodeServiceAuthIssuer(
            typeof req.headers.authorization === 'string'
              ? req.headers.authorization
              : undefined,
          ),
        })
  sendJson(res, result.status, result.body)
}

async function handleGroupInviteState(res: import('node:http').ServerResponse) {
  const fixture = server?.groupInviteFixture
  if (!fixture) {
    sendJson(res, 404, {error: 'No group invite fixture is active'})
    return
  }
  const fixtureState = fixture.getState()
  const savedFeeds = await server.mocker.getSavedFeedSummary(
    'alice',
    fixture.visibleFeedUris,
    fixture.allFeedUris,
  )
  sendJson(res, 200, {...fixtureState, savedFeeds})
}

// eslint-disable-next-line @typescript-eslint/no-misused-promises
createHTTPServer(async (req, res) => {
  const url = parse(req.url || '/', true)
  const pathname = url.pathname || '/'
  if (pathname === '/__e2e/group-invite/state' && req.method === 'GET') {
    try {
      await handleGroupInviteState(res)
    } catch {
      sendJson(res, 503, {error: 'Unable to read fixture state'})
    }
    return
  }
  if (pathname === '/api/trpc/groupInvites.preview') {
    await handleGroupInviteRequest(req, res, 'preview', url.query)
    return
  }
  if (pathname === '/api/trpc/groupInvites.accept') {
    await handleGroupInviteRequest(req, res, 'accept', url.query)
    return
  }
  if (req.method !== 'POST' || pathname !== '/') {
    return res.writeHead(200).end()
  }
  try {
    console.log('Closing old server')
    await server?.close()
    console.log('Starting new server')
    const inviteRequired = url?.query && 'invite' in url.query
    server = await createServer({inviteRequired})
    console.log('Listening at', server.pdsUrl)
    if (url?.query) {
      const requestedGroupInvite = url.query.groupInvite
      if (
        typeof requestedGroupInvite === 'string' &&
        isGroupInviteFixtureScenario(requestedGroupInvite)
      ) {
        console.log('Generating group invite fixture')
        await seedGroupInviteFixture(server, requestedGroupInvite)
      }
      if ('users' in url.query) {
        console.log('Generating mock users')
        await server.mocker.createUser('alice')
        await server.mocker.createUser('bob')
        await server.mocker.createUser('carla')
        await server.mocker.users.alice.agent.upsertProfile(() => ({
          displayName: 'Alice',
          description: 'Test user 1',
        }))
        await server.mocker.users.bob.agent.upsertProfile(() => ({
          displayName: 'Bob',
          description: 'Test user 2',
        }))
        await server.mocker.users.carla.agent.upsertProfile(() => ({
          displayName: 'Carla',
          description: 'Test user 3',
        }))
        if (inviteRequired) {
          await server.mocker.createInvite(server.mocker.users.alice.did)
        }
      }
      if ('follows' in url.query) {
        console.log('Generating mock follows')
        await server.mocker.follow('alice', 'bob')
        await server.mocker.follow('alice', 'carla')
        await server.mocker.follow('bob', 'alice')
        await server.mocker.follow('bob', 'carla')
        await server.mocker.follow('carla', 'alice')
        await server.mocker.follow('carla', 'bob')
      }
      if ('posts' in url.query) {
        console.log('Generating mock posts')
        for (let user in server.mocker.users) {
          await server.mocker.users[user].agent.post({text: 'Post'})
        }
      }
      if ('feeds' in url.query) {
        console.log('Generating mock feed')
        await server.mocker.createFeed('alice', 'alice-favs', [])
      }
      if ('thread' in url.query) {
        console.log('Generating mock posts')
        const res = await server.mocker.users.bob.agent.post({
          text: 'Thread root',
        })
        await server.mocker.users.carla.agent.post({
          text: 'Thread reply',
          reply: {
            parent: {cid: res.cid, uri: res.uri},
            root: {cid: res.cid, uri: res.uri},
          },
        })
      }
      if ('mergefeed' in url.query) {
        console.log('Generating mock users')
        await server.mocker.createUser('alice')
        await server.mocker.createUser('bob')
        await server.mocker.createUser('carla')
        await server.mocker.createUser('dan')
        await server.mocker.users.alice.agent.upsertProfile(() => ({
          displayName: 'Alice',
          description: 'Test user 1',
        }))
        await server.mocker.users.bob.agent.upsertProfile(() => ({
          displayName: 'Bob',
          description: 'Test user 2',
        }))
        await server.mocker.users.carla.agent.upsertProfile(() => ({
          displayName: 'Carla',
          description: 'Test user 3',
        }))
        await server.mocker.users.dan.agent.upsertProfile(() => ({
          displayName: 'Dan',
          description: 'Test user 4',
        }))
        console.log('Generating mock follows')
        await server.mocker.follow('alice', 'bob')
        await server.mocker.follow('alice', 'carla')
        console.log('Generating mock posts')

        let posts: Record<string, {cid: string; uri: string}[]> = {
          alice: [],
          bob: [],
          carla: [],
          dan: [],
        }
        for (let i = 0; i < 10; i++) {
          for (let user in server.mocker.users) {
            if (user === 'alice') continue
            posts[user].push(await server.mocker.createPost(user, `Post ${i}`))
          }
        }
        for (let i = 0; i < 10; i++) {
          for (let user in server.mocker.users) {
            if (user === 'alice') continue
            if (i % 5 === 0) {
              await server.mocker.createReply(user, 'Self reply', {
                cid: posts[user][i].cid,
                uri: posts[user][i].uri,
              })
            }
            if (i % 5 === 1) {
              await server.mocker.createReply(user, 'Reply to bob', {
                cid: posts.bob[i].cid,
                uri: posts.bob[i].uri,
              })
            }
            if (i % 5 === 2) {
              await server.mocker.createReply(user, 'Reply to dan', {
                cid: posts.dan[i].cid,
                uri: posts.dan[i].uri,
              })
            }
            await server.mocker.users[user].agent.post({text: `Post ${i}`})
          }
        }
        console.log('Generating mock feeds')
        await server.mocker.createFeed(
          'alice',
          'alice-favs',
          posts.dan.map(p => p.uri),
        )
        await server.mocker.createFeed(
          'alice',
          'alice-favs2',
          posts.dan.map(p => p.uri),
        )
      }
      if ('labels' in url.query) {
        console.log('Generating naughty users with labels')

        const anchorPost = await server.mocker.createPost(
          'alice',
          'Anchor post',
        )

        for (const user of [
          'dmca-account',
          'dmca-profile',
          'dmca-posts',
          'porn-account',
          'porn-profile',
          'porn-posts',
          'nudity-account',
          'nudity-profile',
          'nudity-posts',
          'scam-account',
          'scam-profile',
          'scam-posts',
          'unknown-account',
          'unknown-profile',
          'unknown-posts',
          'hide-account',
          'hide-profile',
          'hide-posts',
          'no-promote-account',
          'no-promote-profile',
          'no-promote-posts',
          'warn-account',
          'warn-profile',
          'warn-posts',
          'muted-account',
          'muted-by-list-acc',
          'blocking-account',
          'blockedby-account',
          'mutual-block-acc',
        ]) {
          await server.mocker.createUser(user)
          await server.mocker.follow('alice', user)
          await server.mocker.follow(user, 'alice')
          await server.mocker.createPost(user, `Unlabeled post from ${user}`)
          await server.mocker.createReply(
            user,
            `Unlabeled reply from ${user}`,
            anchorPost,
          )
          await server.mocker.like(user, anchorPost)
        }

        await server.mocker.labelAccount('dmca-violation', 'dmca-account')
        await server.mocker.labelProfile('dmca-violation', 'dmca-profile')
        await server.mocker.labelPost(
          'dmca-violation',
          await server.mocker.createPost('dmca-posts', 'dmca post'),
        )
        await server.mocker.labelPost(
          'dmca-violation',
          await server.mocker.createQuotePost(
            'dmca-posts',
            'dmca quote post',
            anchorPost,
          ),
        )
        await server.mocker.labelPost(
          'dmca-violation',
          await server.mocker.createReply(
            'dmca-posts',
            'dmca reply',
            anchorPost,
          ),
        )

        await server.mocker.labelAccount('porn', 'porn-account')
        await server.mocker.labelProfile('porn', 'porn-profile')
        await server.mocker.labelPost(
          'porn',
          await server.mocker.createImagePost('porn-posts', 'porn post'),
        )
        await server.mocker.labelPost(
          'porn',
          await server.mocker.createQuotePost(
            'porn-posts',
            'porn quote post',
            anchorPost,
          ),
        )
        await server.mocker.labelPost(
          'porn',
          await server.mocker.createReply(
            'porn-posts',
            'porn reply',
            anchorPost,
          ),
        )

        await server.mocker.labelAccount('nudity', 'nudity-account')
        await server.mocker.labelProfile('nudity', 'nudity-profile')
        await server.mocker.labelPost(
          'nudity',
          await server.mocker.createImagePost('nudity-posts', 'nudity post'),
        )
        await server.mocker.labelPost(
          'nudity',
          await server.mocker.createQuotePost(
            'nudity-posts',
            'nudity quote post',
            anchorPost,
          ),
        )
        await server.mocker.labelPost(
          'nudity',
          await server.mocker.createReply(
            'nudity-posts',
            'nudity reply',
            anchorPost,
          ),
        )

        await server.mocker.labelAccount('scam', 'scam-account')
        await server.mocker.labelProfile('scam', 'scam-profile')
        await server.mocker.labelPost(
          'scam',
          await server.mocker.createPost('scam-posts', 'scam post'),
        )
        await server.mocker.labelPost(
          'scam',
          await server.mocker.createQuotePost(
            'scam-posts',
            'scam quote post',
            anchorPost,
          ),
        )
        await server.mocker.labelPost(
          'scam',
          await server.mocker.createReply(
            'scam-posts',
            'scam reply',
            anchorPost,
          ),
        )

        await server.mocker.labelAccount('not-a-real-label', 'unknown-account')
        await server.mocker.labelProfile('not-a-real-label', 'unknown-profile')
        await server.mocker.labelPost(
          'not-a-real-label',
          await server.mocker.createPost('unknown-posts', 'unknown post'),
        )
        await server.mocker.labelPost(
          'not-a-real-label',
          await server.mocker.createQuotePost(
            'unknown-posts',
            'unknown quote post',
            anchorPost,
          ),
        )
        await server.mocker.labelPost(
          'not-a-real-label',
          await server.mocker.createReply(
            'unknown-posts',
            'unknown reply',
            anchorPost,
          ),
        )

        await server.mocker.labelAccount('!hide', 'hide-account')
        await server.mocker.labelProfile('!hide', 'hide-profile')
        await server.mocker.labelPost(
          '!hide',
          await server.mocker.createPost('hide-posts', 'hide post'),
        )
        await server.mocker.labelPost(
          '!hide',
          await server.mocker.createQuotePost(
            'hide-posts',
            'hide quote post',
            anchorPost,
          ),
        )
        await server.mocker.labelPost(
          '!hide',
          await server.mocker.createReply(
            'hide-posts',
            'hide reply',
            anchorPost,
          ),
        )

        await server.mocker.labelAccount('!no-promote', 'no-promote-account')
        await server.mocker.labelProfile('!no-promote', 'no-promote-profile')
        await server.mocker.labelPost(
          '!no-promote',
          await server.mocker.createPost('no-promote-posts', 'no-promote post'),
        )
        await server.mocker.labelPost(
          '!no-promote',
          await server.mocker.createQuotePost(
            'no-promote-posts',
            'no-promote quote post',
            anchorPost,
          ),
        )
        await server.mocker.labelPost(
          '!no-promote',
          await server.mocker.createReply(
            'no-promote-posts',
            'no-promote reply',
            anchorPost,
          ),
        )

        await server.mocker.labelAccount('!warn', 'warn-account')
        await server.mocker.labelProfile('!warn', 'warn-profile')
        await server.mocker.labelPost(
          '!warn',
          await server.mocker.createPost('warn-posts', 'warn post'),
        )
        await server.mocker.labelPost(
          '!warn',
          await server.mocker.createQuotePost(
            'warn-posts',
            'warn quote post',
            anchorPost,
          ),
        )
        await server.mocker.labelPost(
          '!warn',
          await server.mocker.createReply(
            'warn-posts',
            'warn reply',
            anchorPost,
          ),
        )

        await server.mocker.users.alice.agent.mute('muted-account.test')
        await server.mocker.createPost('muted-account', 'muted post')
        await server.mocker.createQuotePost(
          'muted-account',
          'muted quote post',
          anchorPost,
        )
        await server.mocker.createReply(
          'muted-account',
          'muted reply',
          anchorPost,
        )

        const list = await server.mocker.createMuteList('alice', 'Muted Users')
        await server.mocker.addToMuteList(
          'alice',
          list,
          server.mocker.users['muted-by-list-acc'].did,
        )
        await server.mocker.createPost('muted-by-list-acc', 'muted post')
        await server.mocker.createQuotePost(
          'muted-by-list-acc',
          'account quote post',
          anchorPost,
        )
        await server.mocker.createReply(
          'muted-by-list-acc',
          'account reply',
          anchorPost,
        )

        await server.mocker.createPost('blocking-account', 'blocking post')
        await server.mocker.createQuotePost(
          'blocking-account',
          'blocking quote post',
          anchorPost,
        )
        await server.mocker.createReply(
          'blocking-account',
          'blocking reply',
          anchorPost,
        )
        await server.mocker.users.alice.agent.app.bsky.graph.block.create(
          {
            repo: server.mocker.users.alice.did,
          },
          {
            subject: server.mocker.users['blocking-account'].did,
            createdAt: new Date().toISOString(),
          },
        )

        await server.mocker.createPost('blockedby-account', 'blockedby post')
        await server.mocker.createQuotePost(
          'blockedby-account',
          'blockedby quote post',
          anchorPost,
        )
        await server.mocker.createReply(
          'blockedby-account',
          'blockedby reply',
          anchorPost,
        )
        await server.mocker.users[
          'blockedby-account'
        ].agent.app.bsky.graph.block.create(
          {
            repo: server.mocker.users['blockedby-account'].did,
          },
          {
            subject: server.mocker.users.alice.did,
            createdAt: new Date().toISOString(),
          },
        )

        await server.mocker.createPost('mutual-block-acc', 'mutual-block post')
        await server.mocker.createQuotePost(
          'mutual-block-acc',
          'mutual-block quote post',
          anchorPost,
        )
        await server.mocker.createReply(
          'mutual-block-acc',
          'mutual-block reply',
          anchorPost,
        )
        await server.mocker.users.alice.agent.app.bsky.graph.block.create(
          {
            repo: server.mocker.users.alice.did,
          },
          {
            subject: server.mocker.users['mutual-block-acc'].did,
            createdAt: new Date().toISOString(),
          },
        )
        await server.mocker.users[
          'mutual-block-acc'
        ].agent.app.bsky.graph.block.create(
          {
            repo: server.mocker.users['mutual-block-acc'].did,
          },
          {
            subject: server.mocker.users.alice.did,
            createdAt: new Date().toISOString(),
          },
        )

        // flush caches
        await server.mocker.testNet.processAll()
      }
    }
    console.log('Ready')
    return res
      .writeHead(200, {
        'content-type': 'application/json',
      })
      .end(
        JSON.stringify({
          pdsUrl: server.pdsUrl,
          appviewDid: server.appviewDid,
          groupInvite: server.groupInviteFixture
            ? {
                scenario: server.groupInviteFixture.getState().scenario,
                code: server.groupInviteFixture.inviteCode,
                acornUrl: 'http://localhost:1986',
              }
            : undefined,
        }),
      )
  } catch (e) {
    console.error('Error!', e)
    return res.writeHead(500).end()
  }
}).listen(1986)
console.log('Mock server manager listening on 1986')
