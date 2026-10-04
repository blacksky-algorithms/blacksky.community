import {type ReactNode} from 'react'
import {type AppBskyFeedDefs, RichText} from '@atproto/api'
import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native'

jest.mock('#/env', () => ({
  ...jest.requireActual<Record<string, unknown>>('#/env'),
  ASSEMBLY_URL: 'http://localhost:5000/',
}))
jest.mock('#/alf', () => {
  const blank = new Proxy({}, {get: () => ({})})
  return {atoms: blank, useTheme: () => ({atoms: blank})}
})
jest.mock('#/components/Typography', () => {
  const {Text} = require('react-native')
  return {Text}
})
jest.mock('#/view/icons/Logo', () => ({Logo: () => null}))

type Viewer = {did: string} | undefined
let mockViewer: Viewer
const mockCreateRecord = jest.fn()
const mockAgent = {
  get session() {
    return mockViewer
  },
  get assertDid() {
    return mockViewer?.did
  },
  com: {atproto: {repo: {createRecord: mockCreateRecord}}},
}
jest.mock('#/state/session', () => ({
  useAgent: () => mockAgent,
  useSession: () => ({currentAccount: mockViewer}),
}))

const mockOpenLink = jest.fn()
jest.mock('#/lib/hooks/useOpenLink', () => ({
  useOpenLink: () => mockOpenLink,
}))

const mockMetric = jest.fn()
const mockAnalytics = {metric: mockMetric}
jest.mock('#/analytics', () => ({
  useAnalytics: () => mockAnalytics,
}))

jest.mock('#/lib/haptics', () => ({useHaptics: () => jest.fn()}))
jest.mock('#/lib/sharing', () => ({shareUrl: jest.fn()}))
jest.mock('#/state/preferences', () => ({
  useExternalEmbedsPrefs: () => undefined,
}))
jest.mock('#/components/Divider', () => ({Divider: () => null}))
jest.mock('#/components/icons/Globe', () => ({
  Earth_Stroke2_Corner0_Rounded: () => null,
}))
jest.mock('#/components/Link', () => ({Link: () => null}))
jest.mock('../ExternalGif', () => ({ExternalGif: () => null}))
jest.mock('../ExternalPlayer', () => ({ExternalPlayer: () => null}))
jest.mock('../Gif', () => ({GifEmbed: () => null}))
jest.mock('#/components/moderation/ContentHider', () => ({
  ContentHider: ({children}: {children: ReactNode}) => children,
}))
jest.mock('#/state/preferences/moderation-opts', () => ({
  useModerationOpts: () => undefined,
}))
jest.mock('#/state/queries/embed-fallback', () => ({
  useEmbedFallback: () => ({}),
}))
jest.mock('#/state/queries/profile', () => ({
  unstableCacheProfileView: jest.fn(),
}))
jest.mock('#/view/com/util/Link', () => ({Link: () => null}))
jest.mock('#/view/com/util/PostMeta', () => ({PostMeta: () => null}))
jest.mock('#/components/images/Gallery', () => ({GalleryBleed: () => null}))
jest.mock('#/components/moderation/PostAlerts', () => ({
  PostAlerts: () => null,
}))
jest.mock('#/components/RichText', () => ({RichText: () => null}))
jest.mock('#/components/StarterPack/StarterPackCard', () => ({
  Embed: () => null,
}))
jest.mock('#/components/SubtleHover', () => ({SubtleHover: () => null}))
jest.mock('#/components/Post/Embed/StandardSiteEmbed', () => ({
  StandardSiteEmbed: () => null,
}))
jest.mock('#/components/Post/Embed/ChatInviteEmbed', () => ({
  ChatInviteEmbed: () => null,
}))
jest.mock('#/components/Post/Embed/FeedEmbed', () => ({
  ModeratedFeedEmbed: () => null,
}))
jest.mock('#/components/Post/Embed/ImageEmbed', () => ({
  ImageEmbed: () => null,
}))
jest.mock('#/components/Post/Embed/ListEmbed', () => ({
  ModeratedListEmbed: () => null,
}))
jest.mock('#/components/Post/Embed/PostPlaceholder', () => ({
  PostPlaceholder: () => null,
}))
jest.mock('#/components/Post/Embed/VideoEmbed', () => ({
  VideoEmbed: () => null,
}))

import {pollTopicFromText} from '#/lib/api/poll'
import {type EmbedPlayerParams} from '#/lib/strings/embed-player'
import {shortenLinks} from '#/lib/strings/rich-text-manip'
import {Embed} from '#/components/Post/Embed'
import {ExternalEmbed} from '#/components/Post/Embed/ExternalEmbed'
import {AssemblyEmbed} from '../AssemblyEmbed'

const NOW = '2026-09-27T12:00:00.000Z'
const ORIGIN = 'http://localhost:5000'
const API = `${ORIGIN}/api/v3`
const VOTE_URL = `${API}/embed/vote`
const CONVERSATION_ID = '2demo'
const PAGE_URL = `${ORIGIN}/${CONVERSATION_ID}`
const TOPIC = 'Should the garden stay open late?'
const VIEWER = 'did:plc:viewer'

const LINK = {uri: PAGE_URL, title: TOPIC, description: '1. Yes, until sunset'}
const PARAMS: EmbedPlayerParams = {
  type: 'assembly_conversation',
  source: 'assembly',
  playerUri: PAGE_URL,
  hideDetails: false,
}

const SEED = {tid: 0, txt: 'Yes, until sunset', remaining: 2, is_seed: true}
const SECOND_SEED = {
  tid: 1,
  txt: 'Only on weekends',
  remaining: 1,
  is_seed: true,
}
const PARTICIPANT = {
  tid: 7,
  txt: 'Add more lights first',
  remaining: 1,
  is_seed: false,
  author_name: 'Ada',
}

type Json = Record<string, unknown>

function conversation(overrides: Json = {}, meta: Json = {}): Json {
  return {
    conversation: {
      conversation_id: CONVERSATION_ID,
      topic: TOPIC,
      is_active: true,
      auth_needed_to_vote: false,
      ...meta,
    },
    nextComment: SEED,
    ...overrides,
  }
}

function reply(body: Json, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response
}

const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()

function serve({
  conversation: conversationReply = reply(conversation()),
  participation = reply({}),
  votes = [],
}: {
  conversation?: Response
  participation?: Response
  votes?: Response[]
}) {
  const pending = [...votes]
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : ''
    if (url.startsWith(`${API}/embed/conversation?`)) {
      return Promise.resolve(conversationReply)
    }
    if (url.startsWith(`${API}/participationInit?`)) {
      return Promise.resolve(participation)
    }
    const vote = url === VOTE_URL ? pending.shift() : undefined
    if (vote) return Promise.resolve(vote)
    return Promise.reject(new Error(`Unexpected request to ${url}`))
  })
}

function requests() {
  return fetchMock.mock.calls.map(([input]) => input)
}

function voteRequests() {
  return fetchMock.mock.calls
    .filter(([input]) => input === VOTE_URL)
    .map(([, init]) => init)
}

function renderCard(props: {postText?: string} = {}) {
  return render(
    <I18nProvider i18n={i18n}>
      <AssemblyEmbed link={LINK} params={PARAMS} {...props} />
    </I18nProvider>,
  )
}

function metricsNamed(name: string) {
  return mockMetric.mock.calls.filter(([event]) => event === name)
}

beforeEach(() => {
  jest.useFakeTimers({
    now: new Date(NOW),
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  })
  jest.clearAllMocks()
  fetchMock.mockReset()
  global.fetch = fetchMock
  mockViewer = undefined
})

afterEach(() => {
  jest.useRealTimers()
})

describe('AssemblyEmbed', () => {
  it('reads the conversation from the configured server', async () => {
    serve({})
    renderCard()

    await screen.findByText(SEED.txt)

    expect(requests()).toEqual([
      `${API}/embed/conversation?conversation_id=${CONVERSATION_ID}`,
    ])
  })

  describe('author row', () => {
    it('is hidden for a seed statement', async () => {
      serve({})
      renderCard()

      await screen.findByText(SEED.txt)

      expect(screen.queryByText('Anonymous wrote:')).toBeNull()
      expect(screen.queryByText(/wrote:/)).toBeNull()
    })

    it('is hidden for a seed statement that names its author', async () => {
      serve({
        conversation: reply(
          conversation({
            nextComment: {
              ...SEED,
              author_name: 'Ada',
              author_is_blacksky_member: true,
            },
          }),
        ),
      })
      renderCard()

      await screen.findByText(SEED.txt)

      expect(screen.queryByText(/wrote:/)).toBeNull()
      expect(screen.queryByText('Member')).toBeNull()
    })

    it('is shown for a participant statement', async () => {
      serve({
        conversation: reply(
          conversation({
            nextComment: {...PARTICIPANT, author_is_blacksky_member: true},
          }),
        ),
      })
      renderCard()

      await screen.findByText(PARTICIPANT.txt)

      expect(screen.getByText('Ada wrote:')).toBeTruthy()
      expect(screen.getByText('Member')).toBeTruthy()
    })

    it('is shown for a statement that does not say whether it is a seed', async () => {
      serve({
        conversation: reply(
          conversation({nextComment: {tid: 3, txt: 'Close at nine'}}),
        ),
      })
      renderCard()

      await screen.findByText('Close at nine')

      expect(screen.getByText('Anonymous wrote:')).toBeTruthy()
    })
  })

  describe('topic', () => {
    it('is shown when there is no post text', async () => {
      serve({})
      renderCard()

      await screen.findByText(SEED.txt)

      expect(screen.getByText(TOPIC)).toBeTruthy()
    })

    it('is shown when the post text is empty', async () => {
      serve({})
      renderCard({postText: ''})

      await screen.findByText(SEED.txt)

      expect(screen.getByText(TOPIC)).toBeTruthy()
    })

    it('is shown when the post text says something else', async () => {
      serve({})
      renderCard({postText: `${TOPIC} Tell me what you think.`})

      await screen.findByText(SEED.txt)

      expect(screen.getByText(TOPIC)).toBeTruthy()
    })

    it('is hidden when it equals the post text', async () => {
      serve({})
      renderCard({postText: TOPIC})

      await screen.findByText(SEED.txt)

      expect(screen.queryByText(TOPIC)).toBeNull()
    })

    it('is hidden when it equals the post text once whitespace is collapsed', async () => {
      serve({})
      renderCard({postText: '  Should the garden\n\nstay open   late?\n'})

      await screen.findByText(SEED.txt)

      expect(screen.queryByText(TOPIC)).toBeNull()
    })

    it('is hidden when it equals the shortened post text', async () => {
      const shortened = `${'a'.repeat(199)}…`
      serve({conversation: reply(conversation({}, {topic: shortened}))})
      renderCard({postText: 'a'.repeat(240)})

      await screen.findByText(SEED.txt)

      expect(screen.queryByText(shortened)).toBeNull()
    })

    it('is shown when only the start of a long post text matches', async () => {
      const topic = 'a'.repeat(199)
      serve({conversation: reply(conversation({}, {topic}))})
      renderCard({postText: 'a'.repeat(240)})

      await screen.findByText(SEED.txt)

      expect(screen.getByText(topic)).toBeTruthy()
    })

    it('is hidden on a closed conversation that repeats the post text', async () => {
      serve({conversation: reply(conversation({}, {is_active: false}))})
      renderCard({postText: TOPIC})

      await screen.findByText('This conversation is closed.')

      expect(screen.queryByText(TOPIC)).toBeNull()
    })
  })

  describe('links', () => {
    it('offers the results only when the conversation has a report', async () => {
      serve({conversation: reply(conversation({report_id: 'r7demo'}))})
      renderCard()

      await screen.findByText(SEED.txt)
      fireEvent.press(screen.getByLabelText('See results'))

      expect(screen.getByText('See results')).toBeTruthy()
      expect(mockOpenLink).toHaveBeenCalledTimes(1)
      expect(mockOpenLink).toHaveBeenCalledWith(`${ORIGIN}/report/r7demo`)
    })

    it.each([
      {state: 'is missing', overrides: {}},
      {state: 'is null', overrides: {report_id: null}},
      {state: 'is empty', overrides: {report_id: ''}},
    ])('offers no results when the report $state', async ({overrides}) => {
      serve({conversation: reply(conversation(overrides))})
      renderCard()

      await screen.findByText(SEED.txt)

      expect(screen.queryByText('See results')).toBeNull()
      expect(screen.queryByLabelText('See results')).toBeNull()
      expect(screen.getByLabelText('Submit a statement')).toBeTruthy()
    })

    it('offers the results of a closed conversation', async () => {
      serve({
        conversation: reply(
          conversation({report_id: 'r7demo'}, {is_active: false}),
        ),
      })
      renderCard()

      await screen.findByText('This conversation is closed.')
      fireEvent.press(screen.getByLabelText('See results'))

      expect(mockOpenLink).toHaveBeenCalledTimes(1)
      expect(mockOpenLink).toHaveBeenCalledWith(`${ORIGIN}/report/r7demo`)
    })

    it('opens the conversation page from the footer', async () => {
      serve({conversation: reply(conversation({report_id: 'r7demo'}))})
      renderCard()

      await screen.findByText(SEED.txt)
      fireEvent.press(screen.getByLabelText('Submit a statement'))

      expect(screen.getByText('Submit a statement →')).toBeTruthy()
      expect(mockOpenLink).toHaveBeenCalledTimes(1)
      expect(mockOpenLink).toHaveBeenCalledWith(PAGE_URL)
    })

    it('opens the conversation page to sign in', async () => {
      serve({
        conversation: reply(conversation({}, {auth_needed_to_vote: true})),
      })
      renderCard()

      fireEvent.press(await screen.findByLabelText('Sign in to vote'))

      expect(screen.getByText('Sign in to vote')).toBeTruthy()
      expect(mockOpenLink).toHaveBeenCalledTimes(1)
      expect(mockOpenLink).toHaveBeenCalledWith(PAGE_URL)
    })
  })

  describe('voting', () => {
    it.each([
      ['agree', -1],
      ['disagree', 1],
      ['pass', 0],
    ] as const)(
      'posts a vote to %s, shows the next statement and reports it',
      async (value, vote) => {
        serve({votes: [reply({nextComment: SECOND_SEED})]})
        renderCard()

        await screen.findByText(SEED.txt)
        fireEvent.press(screen.getByTestId(`pollVote-${value}`))
        await screen.findByText(SECOND_SEED.txt)

        expect(screen.queryByText(SEED.txt)).toBeNull()
        expect(voteRequests()).toEqual([
          {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              conversation_id: CONVERSATION_ID,
              tid: SEED.tid,
              vote,
            }),
          },
        ])
        expect(mockCreateRecord).not.toHaveBeenCalled()
        expect(mockMetric.mock.calls).toEqual([
          [
            'assembly:vote',
            {
              conversationId: CONVERSATION_ID,
              tid: SEED.tid,
              value,
              remaining: SECOND_SEED.remaining,
            },
          ],
        ])
      },
    )

    it('labels the pass button as unsure', async () => {
      serve({})
      renderCard()

      await screen.findByText(SEED.txt)

      expect(screen.getByTestId('pollVote-pass')).toHaveProp(
        'accessibilityLabel',
        'Pass / Unsure',
      )
    })

    it('reports no remaining statements when the next one does not count them', async () => {
      serve({votes: [reply({nextComment: {tid: 1, txt: 'Only on weekends'}})]})
      renderCard()

      await screen.findByText(SEED.txt)
      fireEvent.press(screen.getByTestId('pollVote-agree'))
      await screen.findByText('Only on weekends')

      expect(mockMetric.mock.calls).toEqual([
        [
          'assembly:vote',
          {
            conversationId: CONVERSATION_ID,
            tid: SEED.tid,
            value: 'agree',
            remaining: 0,
          },
        ],
      ])
    })

    it('signs the vote of a signed-in viewer', async () => {
      mockViewer = {did: VIEWER}
      const statement = {
        ...PARTICIPANT,
        at_uri: 'at://did:plc:ada/community.blacksky.assembly.statement/3kada',
        at_cid: 'bafyreistatement',
      }
      const voteUri = `at://${VIEWER}/community.blacksky.assembly.vote/3kvote`
      mockCreateRecord.mockResolvedValue({data: {uri: voteUri}})
      serve({
        participation: reply({
          auth: {token: 'participant-token'},
          nextComment: statement,
        }),
        votes: [reply({nextComment: SECOND_SEED})],
      })
      renderCard()

      await screen.findByText(statement.txt)
      fireEvent.press(screen.getByTestId('pollVote-disagree'))
      await screen.findByText(SECOND_SEED.txt)

      expect(requests()).toEqual([
        `${API}/embed/conversation?conversation_id=${CONVERSATION_ID}`,
        `${API}/participationInit?conversation_id=${CONVERSATION_ID}&includePCA=false&xid=did%3Aplc%3Aviewer`,
        VOTE_URL,
      ])
      expect(mockCreateRecord.mock.calls).toEqual([
        [
          {
            repo: VIEWER,
            collection: 'community.blacksky.assembly.vote',
            record: {
              $type: 'community.blacksky.assembly.vote',
              subject: {uri: statement.at_uri, cid: statement.at_cid},
              value: 1,
              createdAt: NOW,
            },
          },
        ],
      ])
      expect(voteRequests()).toEqual([
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer participant-token',
          },
          body: JSON.stringify({
            conversation_id: CONVERSATION_ID,
            tid: statement.tid,
            vote: 1,
            vote_at_uri: voteUri,
          }),
        },
      ])
      expect(mockMetric.mock.calls).toEqual([
        [
          'assembly:vote',
          {
            conversationId: CONVERSATION_ID,
            tid: statement.tid,
            value: 'disagree',
            remaining: SECOND_SEED.remaining,
          },
        ],
      ])
    })

    it('sends no token of a previous account after the account changes', async () => {
      mockViewer = {did: VIEWER}
      serve({participation: reply({auth: {token: 'first-account-token'}})})
      const view = renderCard()
      await screen.findByText("You've voted on all statements.")

      mockViewer = {did: 'did:plc:second'}
      serve({participation: reply({}, 500), votes: [reply({})]})
      view.rerender(
        <I18nProvider i18n={i18n}>
          <AssemblyEmbed link={LINK} params={PARAMS} />
        </I18nProvider>,
      )
      await screen.findByText(SEED.txt)
      fireEvent.press(screen.getByTestId('pollVote-agree'))
      await screen.findByText("You've voted on all statements.")

      expect(requests().slice(2)).toEqual([
        `${API}/embed/conversation?conversation_id=${CONVERSATION_ID}`,
        `${API}/participationInit?conversation_id=${CONVERSATION_ID}&includePCA=false&xid=did%3Aplc%3Asecond`,
        VOTE_URL,
      ])
      expect(voteRequests()).toEqual([
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            conversation_id: CONVERSATION_ID,
            tid: SEED.tid,
            vote: -1,
          }),
        },
      ])
    })

    it('ignores an answer for a previous account that arrives late', async () => {
      mockViewer = {did: VIEWER}
      let answerFirstAccount: (response: Response) => void = () => {}
      const firstAccount = new Promise<Response>(resolve => {
        answerFirstAccount = resolve
      })
      fetchMock.mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : ''
        if (url.startsWith(`${API}/embed/conversation?`)) {
          return Promise.resolve(reply(conversation()))
        }
        if (url.includes('xid=did%3Aplc%3Aviewer')) return firstAccount
        if (url.startsWith(`${API}/participationInit?`)) {
          return Promise.resolve(reply({}, 500))
        }
        if (url === VOTE_URL) return Promise.resolve(reply({}))
        return Promise.reject(new Error(`Unexpected request to ${url}`))
      })
      const view = renderCard()
      await screen.findByText(SEED.txt)

      mockViewer = {did: 'did:plc:second'}
      view.rerender(
        <I18nProvider i18n={i18n}>
          <AssemblyEmbed link={LINK} params={PARAMS} />
        </I18nProvider>,
      )
      await waitFor(() =>
        expect(requests()).toContain(
          `${API}/participationInit?conversation_id=${CONVERSATION_ID}&includePCA=false&xid=did%3Aplc%3Asecond`,
        ),
      )
      await act(async () => {
        answerFirstAccount(
          reply({
            auth: {token: 'first-account-token'},
            nextComment: PARTICIPANT,
          }),
        )
        await firstAccount
      })

      expect(screen.getByText(SEED.txt)).toBeTruthy()
      expect(screen.queryByText(PARTICIPANT.txt)).toBeNull()

      fireEvent.press(screen.getByTestId('pollVote-agree'))
      await screen.findByText("You've voted on all statements.")

      expect(voteRequests()).toEqual([
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            conversation_id: CONVERSATION_ID,
            tid: SEED.tid,
            vote: -1,
          }),
        },
      ])
    })

    it('reports nothing when the server refuses the vote', async () => {
      serve({
        votes: [reply({error: 'polis_err_post_votes_social_needed'}, 403)],
      })
      renderCard()

      await screen.findByText(SEED.txt)
      fireEvent.press(screen.getByTestId('pollVote-agree'))
      await screen.findByText('Sign in required to vote.')

      expect(screen.getByText(SEED.txt)).toBeTruthy()
      expect(voteRequests()).toHaveLength(1)
      expect(mockMetric).not.toHaveBeenCalled()
    })

    it('reports nothing when the vote does not reach the server', async () => {
      serve({})
      renderCard()

      await screen.findByText(SEED.txt)
      fireEvent.press(screen.getByTestId('pollVote-agree'))
      await screen.findByText('Vote failed. Please try again.')

      expect(screen.getByText(SEED.txt)).toBeTruthy()
      expect(mockMetric).not.toHaveBeenCalled()
    })
  })

  describe('completion', () => {
    it('is reported once after the last vote', async () => {
      serve({votes: [reply({nextComment: SECOND_SEED}), reply({})]})
      renderCard()

      await screen.findByText(SEED.txt)
      fireEvent.press(screen.getByTestId('pollVote-agree'))
      await screen.findByText(SECOND_SEED.txt)

      expect(metricsNamed('assembly:complete')).toEqual([])

      fireEvent.press(screen.getByTestId('pollVote-pass'))
      await screen.findByText("You've voted on all statements.")

      expect(screen.queryByTestId('pollVote-pass')).toBeNull()
      expect(mockMetric.mock.calls).toEqual([
        [
          'assembly:vote',
          {
            conversationId: CONVERSATION_ID,
            tid: SEED.tid,
            value: 'agree',
            remaining: SECOND_SEED.remaining,
          },
        ],
        [
          'assembly:vote',
          {
            conversationId: CONVERSATION_ID,
            tid: SECOND_SEED.tid,
            value: 'pass',
            remaining: 0,
          },
        ],
        ['assembly:complete', {conversationId: CONVERSATION_ID}],
      ])
    })

    it('is reported once when the last vote is sent twice', async () => {
      serve({votes: [reply({}), reply({})]})
      renderCard()

      await screen.findByText(SEED.txt)
      const agree = screen.getByTestId('pollVote-agree')
      act(() => {
        fireEvent.press(agree)
        fireEvent.press(agree)
      })
      await screen.findByText("You've voted on all statements.")
      await waitFor(() => expect(voteRequests()).toHaveLength(2))
      await waitFor(() => expect(metricsNamed('assembly:vote')).toHaveLength(2))

      expect(metricsNamed('assembly:complete')).toEqual([
        ['assembly:complete', {conversationId: CONVERSATION_ID}],
      ])
    })

    it('is not reported for a viewer who had already voted on everything', async () => {
      serve({conversation: reply(conversation({nextComment: null}))})
      renderCard()

      await screen.findByText("You've voted on all statements.")

      expect(mockMetric).not.toHaveBeenCalled()
    })
  })
})

describe('post text reaching the card', () => {
  it('hides the topic of a link card under a post that asks the same', async () => {
    serve({})
    render(
      <I18nProvider i18n={i18n}>
        <ExternalEmbed link={LINK} postText={TOPIC} />
      </I18nProvider>,
    )

    await screen.findByText(SEED.txt)

    expect(screen.queryByText(TOPIC)).toBeNull()
  })

  it('shows the topic of a link card without post text', async () => {
    serve({})
    render(
      <I18nProvider i18n={i18n}>
        <ExternalEmbed link={LINK} />
      </I18nProvider>,
    )

    await screen.findByText(SEED.txt)

    expect(screen.getByText(TOPIC)).toBeTruthy()
  })

  function post(text: string): AppBskyFeedDefs.PostView {
    return {
      $type: 'app.bsky.feed.defs#postView',
      uri: 'at://did:plc:author/app.bsky.feed.post/3kpost',
      cid: 'bafyreipost',
      author: {did: 'did:plc:author', handle: 'author.test'},
      record: {$type: 'app.bsky.feed.post', text, createdAt: NOW},
      indexedAt: NOW,
    }
  }

  const embed = {$type: 'app.bsky.embed.external#view', external: LINK}

  it('hides the topic of an embed in a post that asks the same', async () => {
    serve({})
    render(
      <I18nProvider i18n={i18n}>
        <Embed embed={embed} post={post(TOPIC)} />
      </I18nProvider>,
    )

    await screen.findByText(SEED.txt)

    expect(screen.queryByText(TOPIC)).toBeNull()
  })

  it('hides the topic of an embed in a post whose link was shortened', async () => {
    const typed = new RichText({
      text: 'Should we fund this? https://example.com/proposals/2026/garden-lights-and-benches',
    })
    typed.detectFacetsWithoutResolution()
    const published = shortenLinks(typed)
    const topic = pollTopicFromText(typed.text)
    serve({conversation: reply(conversation({}, {topic}))})
    const view: AppBskyFeedDefs.PostView = {
      ...post(published.text),
      record: {
        $type: 'app.bsky.feed.post',
        text: published.text,
        facets: published.facets,
        createdAt: NOW,
      },
    }
    render(
      <I18nProvider i18n={i18n}>
        <Embed embed={embed} post={view} />
      </I18nProvider>,
    )

    await screen.findByText(SEED.txt)

    expect(published.text).not.toBe(typed.text)
    expect(screen.queryByText(topic)).toBeNull()
  })

  it('shows the topic of an embed in a post that links somewhere else', async () => {
    const typed = new RichText({
      text: 'Should we fund this? https://example.com/proposals/2026/garden-lights-and-benches',
    })
    typed.detectFacetsWithoutResolution()
    const published = shortenLinks(typed)
    serve({})
    const view: AppBskyFeedDefs.PostView = {
      ...post(published.text),
      record: {
        $type: 'app.bsky.feed.post',
        text: published.text,
        facets: published.facets,
        createdAt: NOW,
      },
    }
    render(
      <I18nProvider i18n={i18n}>
        <Embed embed={embed} post={view} />
      </I18nProvider>,
    )

    await screen.findByText(SEED.txt)

    expect(screen.getByText(TOPIC)).toBeTruthy()
  })

  it('shows the topic of an embed in a post that says something else', async () => {
    serve({})
    render(
      <I18nProvider i18n={i18n}>
        <Embed embed={embed} post={post('Have your say')} />
      </I18nProvider>,
    )

    await screen.findByText(SEED.txt)

    expect(screen.getByText(TOPIC)).toBeTruthy()
  })

  it('shows the topic of an embed that has no post', async () => {
    serve({})
    render(
      <I18nProvider i18n={i18n}>
        <Embed embed={embed} />
      </I18nProvider>,
    )

    await screen.findByText(SEED.txt)

    expect(screen.getByText(TOPIC)).toBeTruthy()
  })
})
