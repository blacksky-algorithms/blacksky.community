import {
  type AppBskyFeedDefs,
  type AppBskyLabelerDefs,
  type ComAtprotoLabelDefs,
  interpretLabelValueDefinitions,
  type LabelPreference,
  LABELS,
  moderatePost,
  type ModerationOpts,
} from '@atproto/api'

import {
  configureAdultContentLabelDefs,
  withAdultContentBehavior,
} from '../adult-content-labels'

const AUTHOR = 'did:plc:author'
const LABELER = 'did:plc:labeler'
const URI = `at://${AUTHOR}/app.bsky.feed.post/3ktextonly`
const CID = 'bafyreipost'
const AT = '2026-09-16T00:00:00.000Z'
const ADULT_VALS = [
  'porn',
  'sexual',
  'nudity',
  'graphic-media',
  'gore',
] as const
const CONTEXTS = [
  'contentList',
  'contentView',
  'contentMedia',
  'avatar',
  'profileList',
  'profileView',
] as const

const label = (val: string, src: string): ComAtprotoLabelDefs.Label => ({
  src,
  uri: URI,
  cid: CID,
  val,
  cts: AT,
})

const textPost = ({
  postLabels = [],
  authorLabels = [],
}: {
  postLabels?: ComAtprotoLabelDefs.Label[]
  authorLabels?: ComAtprotoLabelDefs.Label[]
}): AppBskyFeedDefs.PostView => ({
  $type: 'app.bsky.feed.defs#postView',
  uri: URI,
  cid: CID,
  author: {
    did: AUTHOR,
    handle: 'author.test',
    viewer: {},
    labels: authorLabels,
  },
  record: {$type: 'app.bsky.feed.post', text: 'words only', createdAt: AT},
  labels: postLabels,
  indexedAt: AT,
})

const labelerView = (
  did: string,
  defs: Array<Partial<ComAtprotoLabelDefs.LabelValueDefinition>>,
): AppBskyLabelerDefs.LabelerViewDetailed => ({
  $type: 'app.bsky.labeler.defs#labelerViewDetailed',
  uri: `at://${did}/app.bsky.labeler.service/self`,
  cid: 'bafyreilabeler',
  creator: {did, handle: 'labeler.test'},
  policies: {
    labelValues: defs.map(d => d.identifier!),
    labelValueDefinitions: defs.map(d => ({
      severity: 'none',
      blurs: 'media',
      locales: [],
      ...d,
    })) as ComAtprotoLabelDefs.LabelValueDefinition[],
  },
  indexedAt: AT,
})

const opts = ({
  labels,
  adultContentEnabled = true,
  labelDefs = {},
}: {
  labels: Record<string, LabelPreference>
  adultContentEnabled?: boolean
  labelDefs?: ModerationOpts['labelDefs']
}): ModerationOpts => ({
  userDid: 'did:plc:viewer',
  prefs: {
    adultContentEnabled,
    labels,
    labelers: [{did: LABELER, labels}],
    mutedWords: [],
    hiddenPosts: [],
  },
  labelDefs,
})

const uiSummary = (
  post: AppBskyFeedDefs.PostView,
  moderationOpts: ModerationOpts,
) => {
  const mod = moderatePost(post, moderationOpts)
  return Object.fromEntries(
    CONTEXTS.map(ctx => {
      const ui = mod.ui(ctx)
      return [
        ctx,
        {blur: ui.blur, filter: ui.filter, noOverride: ui.noOverride},
      ]
    }),
  )
}

beforeAll(configureAdultContentLabelDefs)

describe('configureAdultContentLabelDefs', () => {
  it('covers the text of a warned self-labeled post, not only its media', () => {
    const mod = moderatePost(
      textPost({postLabels: [label('porn', AUTHOR)]}),
      opts({labels: {porn: 'warn'}}),
    )

    expect(mod.ui('contentList').blur).toBe(true)
    expect(mod.ui('contentView').blur).toBe(true)
    expect(mod.ui('contentMedia').blur).toBe(true)
    expect(mod.ui('contentList').filter).toBe(false)
  })

  it('filters a hidden self-label out of lists and covers it in the thread', () => {
    const mod = moderatePost(
      textPost({postLabels: [label('porn', AUTHOR)]}),
      opts({labels: {porn: 'hide'}}),
    )

    expect(mod.ui('contentList').filter).toBe(true)
    expect(mod.ui('contentView').blur).toBe(true)
  })

  it('leaves an ignored self-label alone', () => {
    const mod = moderatePost(
      textPost({postLabels: [label('nudity', AUTHOR)]}),
      opts({labels: {nudity: 'ignore'}}),
    )

    expect(mod.ui('contentList').blur).toBe(false)
    expect(mod.ui('contentView').blur).toBe(false)
    expect(mod.ui('contentMedia').blur).toBe(false)
  })

  it('is idempotent and leaves account and profile behaviors untouched', () => {
    configureAdultContentLabelDefs()

    for (const val of ADULT_VALS) {
      expect(LABELS[val].blurs).toBe('content')
      expect(LABELS[val].behaviors.account).toEqual({
        avatar: 'blur',
        banner: 'blur',
      })
      expect(LABELS[val].behaviors.profile).toEqual({
        avatar: 'blur',
        banner: 'blur',
      })
      expect(LABELS[val].behaviors.content).toEqual({
        contentMedia: 'blur',
        contentList: 'blur',
        contentView: 'blur',
      })
    }
    expect(LABELS.porn.flags).toEqual(['adult'])
    expect(LABELS.nudity.flags).toEqual([])
  })
})

describe('withAdultContentBehavior', () => {
  const labelerDefs = (val: string, wrap: boolean) => {
    const defs = interpretLabelValueDefinitions(
      labelerView(LABELER, [{identifier: val}]),
    )
    return {[LABELER]: wrap ? withAdultContentBehavior(defs) : defs}
  }

  it.each(ADULT_VALS)(
    'covers post text for a labeler that declares %s itself',
    val => {
      const post = textPost({postLabels: [label(val, LABELER)]})
      const prefs = {[val]: 'warn' as const}

      const patched = moderatePost(
        post,
        opts({labels: prefs, labelDefs: labelerDefs(val, true)}),
      )
      const unpatched = moderatePost(
        post,
        opts({labels: prefs, labelDefs: labelerDefs(val, false)}),
      )

      expect(unpatched.ui('contentList').blur).toBe(false)
      expect(patched.ui('contentList').blur).toBe(true)
      expect(patched.ui('contentView').blur).toBe(true)
      expect(patched.ui('contentMedia').blur).toBe(true)
    },
  )

  it.each(ADULT_VALS)(
    'keeps %s self-labelable when the author is also a subscribed labeler',
    val => {
      const post = textPost({postLabels: [label(val, AUTHOR)]})
      const prefs = {[val]: 'warn' as const}
      const authorDefs = (wrap: boolean) => {
        const defs = interpretLabelValueDefinitions(
          labelerView(AUTHOR, [{identifier: val}]),
        )
        return {[AUTHOR]: wrap ? withAdultContentBehavior(defs) : defs}
      }

      const patched = moderatePost(
        post,
        opts({labels: prefs, labelDefs: authorDefs(true)}),
      )
      const unpatched = moderatePost(
        post,
        opts({labels: prefs, labelDefs: authorDefs(false)}),
      )

      expect(unpatched.ui('contentList').blur).toBe(false)
      expect(patched.ui('contentList').blur).toBe(true)
      expect(patched.ui('contentView').blur).toBe(true)
    },
  )

  it('leaves a labeler custom value alone', () => {
    const [def] = withAdultContentBehavior(
      interpretLabelValueDefinitions(
        labelerView(LABELER, [{identifier: 'misogynoir', blurs: 'content'}]),
      ),
    )

    expect(def.flags).toContain('no-self')
    expect(def.blurs).toBe('content')
    expect(def.behaviors.content?.contentMedia).toBeUndefined()
  })

  it.each([
    ['adult content disabled, pref ignore', false, 'ignore' as const],
    ['adult content enabled, pref warn', true, 'warn' as const],
  ])(
    'matches the built-in account-level decision (%s)',
    (_name, adultContentEnabled, pref) => {
      const post = textPost({authorLabels: [label('porn', LABELER)]})
      const prefs = {porn: pref}

      const viaLabeler = uiSummary(
        post,
        opts({
          labels: prefs,
          adultContentEnabled,
          labelDefs: {
            [LABELER]: withAdultContentBehavior(
              interpretLabelValueDefinitions(
                labelerView(LABELER, [{identifier: 'porn', adultOnly: false}]),
              ),
            ),
          },
        }),
      )
      const builtIn = uiSummary(
        post,
        opts({labels: prefs, adultContentEnabled, labelDefs: {}}),
      )

      expect(viaLabeler).toEqual(builtIn)
      expect(viaLabeler.contentList.filter).toBe(!adultContentEnabled)
      expect(viaLabeler.contentList.blur).toBe(false)
      expect(viaLabeler.avatar.blur).toBe(true)
      expect(viaLabeler.profileView.blur).toBe(false)
    },
  )
})
