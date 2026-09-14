import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'

import {AtUri, BskyAgent} from '@atproto/api'
import {type TestBsky, TestNetwork} from '@atproto/dev-env'

export interface TestUser {
  email: string
  did: string
  handle: string
  password: string
  agent: BskyAgent
}

export type SavedFeedSummary = {
  total: number
  pinned: number
  visible: number
  visiblePinned: number
  inaccessible: number
}

export interface TestPDS {
  appviewDid: string
  pdsUrl: string
  mocker: Mocker
  groupInviteFixture?: import('./group-invite-fixture.ts').GroupInviteFixture
  close: () => Promise<void>
}

class StringIdGenerator {
  _nextId = [0]
  _chars: string

  constructor(chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    this._chars = chars
  }

  next() {
    const r = []
    for (const char of this._nextId) {
      r.unshift(this._chars[char])
    }
    this._increment()
    return r.join('')
  }

  _increment() {
    for (let i = 0; i < this._nextId.length; i++) {
      const val = ++this._nextId[i]
      if (val >= this._chars.length) {
        this._nextId[i] = 0
      } else {
        return
      }
    }
    this._nextId.push(0)
  }

  *[Symbol.iterator]() {
    while (true) {
      yield this.next()
    }
  }
}

const ids = new StringIdGenerator()

type PdsProxy = {
  close: () => Promise<void>
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: Record<string, unknown>,
) {
  res.writeHead(status, {'content-type': 'application/json'})
  res.end(JSON.stringify(body))
}

async function createPdsProxy(
  port: number,
  pdsTarget: string,
): Promise<PdsProxy> {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url || '/', `http://${req.headers.host}`)
      .pathname
    const upstreamUrl = new URL(req.url || '/', pdsTarget)
    const headers: http.OutgoingHttpHeaders = {
      ...req.headers,
      host: upstreamUrl.host,
    }
    if (
      pathname === '/xrpc/app.bsky.actor.getPreferences' ||
      pathname === '/xrpc/app.bsky.actor.putPreferences'
    ) {
      delete headers['atproto-proxy']
    }
    const upstream = http.request(
      upstreamUrl,
      {method: req.method, headers},
      upstreamRes => {
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers)
        upstreamRes.pipe(res)
      },
    )
    upstream.on('error', () => {
      if (!res.headersSent) {
        sendJson(res, 502, {
          error: 'UpstreamUnavailable',
          message: 'PDS unavailable',
        })
      } else {
        res.destroy()
      }
    })
    req.pipe(upstream)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, 'localhost', resolve)
  })
  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()))
      }),
  }
}

export async function createServer(
  {inviteRequired}: {inviteRequired: boolean} = {
    inviteRequired: false,
  },
): Promise<TestPDS> {
  const publicPdsPort = 3000
  const pdsPort = await getPort(publicPdsPort + 1)
  const plcPort = await getPort(pdsPort + 1)
  const bskyPort = await getPort(plcPort + 1)
  const pdsUrl = `http://localhost:${publicPdsPort}`
  const id = ids.next()
  const testNet = await TestNetwork.create({
    pds: {
      port: pdsPort,
      hostname: 'localhost',
      inviteRequired,
    },
    bsky: {
      dbPostgresSchema: `bsky_${id}`,
      port: bskyPort,
      publicUrl: 'http://localhost:2584',
    },
    plc: {port: plcPort},
  })
  let pdsProxy: PdsProxy
  try {
    pdsProxy = await createPdsProxy(
      publicPdsPort,
      `http://localhost:${pdsPort}`,
    )
  } catch (error) {
    await testNet.close()
    throw error
  }

  // DISABLED - looks like dev-env added this and now it conflicts
  // add the test mod authority
  // const agent = new BskyAgent({service: pdsUrl})
  // const res = await agent.com.atproto.server.createAccount({
  //   email: 'mod-authority@test.com',
  //   handle: 'mod-authority.test',
  //   password: 'hunter2',
  // })
  // agent.setHeader('Authorization', `Bearer ${res.data.accessJwt}`)
  // await agent.app.bsky.actor.profile.create(
  //   {repo: res.data.did},
  //   {
  //     displayName: 'Dev-env Moderation',
  //     description: `The pretend version of mod.bsky.app`,
  //   },
  // )

  // await agent.app.bsky.labeler.service.create(
  //   {repo: res.data.did, rkey: 'self'},
  //   {
  //     policies: {
  //       labelValues: ['!hide', '!warn'],
  //       labelValueDefinitions: [],
  //     },
  //     createdAt: new Date().toISOString(),
  //   },
  // )

  const pic = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'assets', 'default-avatar.png'),
  )

  return {
    appviewDid: testNet.bsky.serverDid,
    pdsUrl,
    mocker: new Mocker(testNet, pdsUrl, pic),
    async close() {
      await pdsProxy.close()
      await testNet.close()
    },
  }
}

class Mocker {
  agent: BskyAgent
  users: Record<string, TestUser> = {}
  testNet: TestNetwork
  service: string
  pic: Uint8Array

  constructor(testNet: TestNetwork, service: string, pic: Uint8Array) {
    this.testNet = testNet
    this.service = service
    this.pic = pic
    this.agent = new BskyAgent({service})
  }

  get pds() {
    return this.testNet.pds
  }

  get bsky() {
    return this.testNet.bsky
  }

  get plc() {
    return this.testNet.plc
  }

  // NOTE
  // deterministic date generator
  // we use this to ensure the mock dataset is always the same
  // which is very useful when testing
  *dateGen() {
    let start = 1657846031914
    while (true) {
      yield new Date(start).toISOString()
      start += 1e3
    }
  }

  async createUser(name: string) {
    const agent = new BskyAgent({service: this.service})

    const inviteRes = await agent.com.atproto.server.createInviteCode(
      {useCount: 1},
      {
        headers: this.pds.adminAuthHeaders(),
        encoding: 'application/json',
      },
    )

    const email = `fake${Object.keys(this.users).length + 1}@fake.com`
    const res = await agent.createAccount({
      inviteCode: inviteRes.data.code,
      email,
      handle: name + '.test',
      password: 'hunter2',
    })
    await agent.upsertProfile(async () => {
      const blob = await agent.uploadBlob(this.pic, {
        encoding: 'image/jpeg',
      })
      return {
        displayName: name,
        avatar: blob.data.blob,
      }
    })
    this.users[name] = {
      did: res.data.did,
      email,
      handle: name + '.test',
      password: 'hunter2',
      agent: agent,
    }
  }

  async follow(a: string, b: string) {
    await this.users[a].agent.follow(this.users[b].did)
  }

  async generateStandardGraph() {
    await this.createUser('alice')
    await this.createUser('bob')
    await this.createUser('carla')

    await this.users.alice.agent.upsertProfile(() => ({
      displayName: 'Alice',
      description: 'Test user 1',
    }))

    await this.users.bob.agent.upsertProfile(() => ({
      displayName: 'Bob',
      description: 'Test user 2',
    }))

    await this.users.carla.agent.upsertProfile(() => ({
      displayName: 'Carla',
      description: 'Test user 3',
    }))

    await this.follow('alice', 'bob')
    await this.follow('alice', 'carla')
    await this.follow('bob', 'alice')
    await this.follow('bob', 'carla')
    await this.follow('carla', 'alice')
    await this.follow('carla', 'bob')
  }

  async createPost(user: string, text: string) {
    const agent = this.users[user]?.agent
    if (!agent) {
      throw new Error(`Not a user: ${user}`)
    }
    return await agent.post({
      text,
      langs: ['en'],
      createdAt: new Date().toISOString(),
    })
  }

  async createImagePost(user: string, text: string) {
    const agent = this.users[user]?.agent
    if (!agent) {
      throw new Error(`Not a user: ${user}`)
    }
    const blob = await agent.uploadBlob(this.pic, {
      encoding: 'image/jpeg',
    })
    return await agent.post({
      text,
      langs: ['en'],
      embed: {
        $type: 'app.bsky.embed.images',
        images: [{image: blob.data.blob, alt: ''}],
      },
      createdAt: new Date().toISOString(),
    })
  }

  async createQuotePost(
    user: string,
    text: string,
    {uri, cid}: {uri: string; cid: string},
  ) {
    const agent = this.users[user]?.agent
    if (!agent) {
      throw new Error(`Not a user: ${user}`)
    }
    return await agent.post({
      text,
      embed: {$type: 'app.bsky.embed.record', record: {uri, cid}},
      langs: ['en'],
      createdAt: new Date().toISOString(),
    })
  }

  async createReply(
    user: string,
    text: string,
    {uri, cid}: {uri: string; cid: string},
  ) {
    const agent = this.users[user]?.agent
    if (!agent) {
      throw new Error(`Not a user: ${user}`)
    }
    return await agent.post({
      text,
      reply: {root: {uri, cid}, parent: {uri, cid}},
      langs: ['en'],
      createdAt: new Date().toISOString(),
    })
  }

  async like(user: string, {uri, cid}: {uri: string; cid: string}) {
    const agent = this.users[user]?.agent
    if (!agent) {
      throw new Error(`Not a user: ${user}`)
    }
    return await agent.like(uri, cid)
  }

  async createFeed(user: string, rkey: string, posts: string[]) {
    const agent = this.users[user]?.agent
    if (!agent) {
      throw new Error(`Not a user: ${user}`)
    }
    const fgUri = AtUri.make(
      this.users[user].did,
      'app.bsky.feed.generator',
      rkey,
    )
    // @ts-expect-error
    const fg1 = await this.testNet.createFeedGen({
      [fgUri.toString()]: () => {
        return {
          encoding: 'application/json' as const,
          body: {
            feed: posts.slice(0, 30).map(uri => ({post: uri})),
          },
        }
      },
    })
    const avatarRes = await agent.com.atproto.repo.uploadBlob(this.pic, {
      encoding: 'image/png',
    })
    return await agent.app.bsky.feed.generator.create(
      {repo: this.users[user].did, rkey},
      {
        did: fg1.did,
        displayName: rkey,
        description: 'all my fav stuff',
        avatar: avatarRes.data.blob,
        createdAt: new Date().toISOString(),
      },
    )
  }

  async createInvite(forAccount: string) {
    const agent = new BskyAgent({service: this.service})
    await agent.com.atproto.server.createInviteCode(
      {useCount: 1, forAccount},
      {
        headers: this.pds.adminAuthHeaders(),
        encoding: 'application/json',
      },
    )
  }

  async getSavedFeedSummary(
    user: string,
    visibleUris: readonly string[],
    allUris: readonly string[],
  ): Promise<SavedFeedSummary> {
    const agent = this.users[user]?.agent
    if (!agent) {
      throw new Error(`Not a user: ${user}`)
    }
    const preferences = await agent.getPreferences()
    const savedFeeds = preferences.savedFeeds.filter(
      feed => feed.type === 'feed',
    )
    const visible = new Set(visibleUris)
    const all = new Set(allUris)
    return {
      total: savedFeeds.length,
      pinned: savedFeeds.filter(feed => feed.pinned).length,
      visible: savedFeeds.filter(feed => visible.has(feed.value)).length,
      visiblePinned: savedFeeds.filter(
        feed => visible.has(feed.value) && feed.pinned,
      ).length,
      inaccessible: savedFeeds.filter(
        feed => all.has(feed.value) && !visible.has(feed.value),
      ).length,
    }
  }

  async labelAccount(label: string, user: string) {
    const did = this.users[user]?.did
    if (!did) {
      throw new Error(`Invalid user: ${user}`)
    }
    const ctx = this.bsky.ctx
    if (!ctx) {
      throw new Error('Invalid appview')
    }
    await createLabel(this.bsky, {
      uri: did,
      cid: '',
      val: label,
    })
  }

  async labelProfile(label: string, user: string) {
    const agent = this.users[user]?.agent
    const did = this.users[user]?.did
    if (!did) {
      throw new Error(`Invalid user: ${user}`)
    }

    const profile = await agent.app.bsky.actor.profile.get({
      repo: user + '.test',
      rkey: 'self',
    })

    const ctx = this.bsky.ctx
    if (!ctx) {
      throw new Error('Invalid appview')
    }
    await createLabel(this.bsky, {
      uri: profile.uri,
      cid: profile.cid,
      val: label,
    })
  }

  async labelPost(label: string, {uri, cid}: {uri: string; cid: string}) {
    const ctx = this.bsky.ctx
    if (!ctx) {
      throw new Error('Invalid appview')
    }
    await createLabel(this.bsky, {
      uri,
      cid,
      val: label,
    })
  }

  async createMuteList(user: string, name: string): Promise<string> {
    const res = await this.users[user]?.agent.app.bsky.graph.list.create(
      {repo: this.users[user]?.did},
      {
        purpose: 'app.bsky.graph.defs#modlist',
        name,
        createdAt: new Date().toISOString(),
      },
    )
    await this.users[user]?.agent.app.bsky.graph.muteActorList({
      list: res.uri,
    })
    return res.uri
  }

  async addToMuteList(owner: string, list: string, subject: string) {
    await this.users[owner]?.agent.app.bsky.graph.listitem.create(
      {repo: this.users[owner]?.did},
      {
        list,
        subject,
        createdAt: new Date().toISOString(),
      },
    )
  }
}

const checkAvailablePort = (port: number) =>
  new Promise(resolve => {
    const server = net.createServer()
    server.unref()
    server.on('error', () => resolve(false))
    server.listen({port}, () => {
      server.close(() => {
        resolve(true)
      })
    })
  })

async function getPort(start = 3000) {
  for (let i = start; i < 65000; i++) {
    if (await checkAvailablePort(i)) {
      return i
    }
  }
  throw new Error('Unable to find an available port')
}

const createLabel = async (
  bsky: TestBsky,
  opts: {uri: string; cid: string; val: string},
) => {
  await bsky.db.db
    .insertInto('label')
    .values({
      uri: opts.uri,
      cid: opts.cid,
      val: opts.val,
      cts: new Date().toISOString(),
      neg: false,
      src: 'did:example:labeler',
    })
    .execute()
}
