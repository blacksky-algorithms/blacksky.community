import {fireEvent, render} from '@testing-library/react-native'

import {type CommunityFeedTarget} from '#/lib/api/community-feed'
import {type ThreadDraft} from '#/view/com/composer/state/composer'

jest.mock('@lingui/react', () => ({
  useLingui: () => ({
    _: (
      message: {message?: string; values?: Record<string, string>} | string,
    ) => {
      if (typeof message === 'string') return message
      return message.message?.replace(
        /{(\w+)}/g,
        (_, key: string) => message.values?.[key] ?? '',
      )
    },
  }),
  Trans: ({
    id,
    message,
    values,
  }: {
    id: string
    message?: string
    values?: Record<string, string>
  }) =>
    (message ?? id).replace(
      /{(\w+)}/g,
      (_, key: string) => values?.[key] ?? '',
    ),
}))
jest.mock('#/alf', () => ({
  atoms: {flex_row: {}, align_center: {}, gap_xs: {}},
}))
jest.mock('#/components/forms/Toggle', () => {
  const React = require('react')
  const {Pressable, Text} = require('react-native')
  return {
    Item: ({
      children,
      disabled,
      label,
      name,
      onChange,
      value,
    }: {
      children: React.ReactNode
      disabled?: boolean
      label: string
      name: string
      onChange: () => void
      value: boolean
    }) => (
      <Pressable
        accessibilityHint="Changes the post destination"
        accessibilityLabel={label}
        accessibilityRole="switch"
        accessibilityState={{checked: value, disabled}}
        disabled={disabled}
        onPress={onChange}
        testID={name}>
        {children}
      </Pressable>
    ),
    LabelText: ({children}: {children: React.ReactNode}) => (
      <Text>{children}</Text>
    ),
    Switch: () => null,
  }
})

const mockToast = jest.fn()
jest.mock('#/components/Toast', () => ({
  show: (...args: unknown[]) => mockToast(...args),
}))
jest.mock('#/state/gallery', () => ({createInitialImages: jest.fn()}))
jest.mock('#/state/queries/threadgate', () => ({
  threadgateRecordToAllowUISetting: jest.fn(() => []),
}))
jest.mock('#/view/com/composer/state/video', () => ({
  createVideoState: jest.fn(),
  videoReducer: jest.fn(),
}))

import {PostTargetControls} from '../PostTargetControls'

const PRIVATE_TARGET: CommunityFeedTarget = {
  feed: 'at://did:plc:test/app.bsky.feed.generator/private',
  name: 'Private Test',
  serviceDid: 'did:web:feeds.test',
  config: {
    $type: 'community.blacksky.feed.config',
    contentType: 'communityRecord',
    visibility: 'gated',
    space: 'at://did:plc:test/space/community.blacksky.feed/private',
    group: 'members',
    createdAt: '2026-08-30T00:00:00.000Z',
  },
}

const COMMUNITY_RECORD_TARGET: CommunityFeedTarget = {
  ...PRIVATE_TARGET,
  feed: 'at://did:plc:test/app.bsky.feed.generator/members',
  name: 'Members Test',
  config: {...PRIVATE_TARGET.config, space: undefined},
}

const PUBLIC_RECORD_TARGET: CommunityFeedTarget = {
  ...PRIVATE_TARGET,
  feed: 'at://did:plc:test/app.bsky.feed.generator/public',
  name: 'Public Test',
  config: {
    ...PRIVATE_TARGET.config,
    contentType: 'publicRecord',
    visibility: 'public',
    space: undefined,
  },
}

const POLL_REMOVED_MESSAGE =
  'Polls are only available on public posts, so the poll was removed.'

function draftPost(embed: Partial<ThreadDraft['posts'][number]['embed']> = {}) {
  return {embed} as ThreadDraft['posts'][number]
}

const TEXT_POST = draftPost()
const POLL_POST = draftPost({poll: {statements: ['a']}})
const COMMUNITY_QUOTE_POST = draftPost({
  quote: {
    type: 'link',
    uri: 'https://bsky.app/profile/did:plc:author/post/3kabc?collection=community.blacksky.feed.post',
  },
})

function thread(overrides: Partial<ThreadDraft> = {}): ThreadDraft {
  return {
    posts: [],
    postgate: {} as ThreadDraft['postgate'],
    threadgate: [],
    blackskyOnly: false,
    ...overrides,
  }
}

function renderControls({
  draft = thread(),
  target,
  isForcedCommunityTarget = false,
}: {
  draft?: ThreadDraft
  target?: CommunityFeedTarget
  isForcedCommunityTarget?: boolean
} = {}) {
  const dispatch = jest.fn()
  const setBlackskyOnlyDefault = jest.fn()
  return {
    ...render(
      <PostTargetControls
        thread={draft}
        dispatch={dispatch}
        isCommunityMember={true}
        homeAppviewOutage={false}
        setBlackskyOnlyDefault={setBlackskyOnlyDefault}
        isReply={false}
        isForcedBlackskyOnly={false}
        isForcedCommunityTarget={isForcedCommunityTarget}
        contextualCommunityFeedTarget={target}
      />,
    ),
    dispatch,
    setBlackskyOnlyDefault,
  }
}

describe('PostTargetControls', () => {
  beforeEach(() => mockToast.mockClear())

  it('keeps ordinary public composition on the legacy Blacksky-only toggle', () => {
    const {getByTestId, queryByTestId} = renderControls()

    expect(getByTestId('blacksky_only')).toBeTruthy()
    expect(queryByTestId('permissioned_space')).toBeNull()
  })

  it('preserves legacy Blacksky-only state and behavior', () => {
    const {dispatch, getByTestId, setBlackskyOnlyDefault} = renderControls({
      draft: thread({blackskyOnly: true}),
    })

    fireEvent.press(getByTestId('blacksky_only'))
    expect(dispatch).toHaveBeenCalledWith({type: 'toggle_blacksky_only'})
    expect(setBlackskyOnlyDefault).toHaveBeenCalledWith(false)
  })

  it('offers public versus the selected private feed when Blacksky-only is off', () => {
    const {dispatch, getByTestId, getByText, queryByTestId} = renderControls({
      target: PRIVATE_TARGET,
    })

    expect(getByText('Private Test')).toBeTruthy()
    expect(queryByTestId('blacksky_only')).toBeNull()
    fireEvent.press(getByTestId('permissioned_space'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'set_post_target',
      target: PRIVATE_TARGET,
    })
  })

  it('gives the selected private feed precedence over sticky Blacksky-only state', () => {
    const {dispatch, getByTestId, queryByTestId} = renderControls({
      draft: thread({blackskyOnly: true}),
      target: PRIVATE_TARGET,
    })

    expect(queryByTestId('blacksky_only')).toBeNull()
    const contextualToggle = getByTestId('permissioned_space')
    expect(contextualToggle).toHaveProp(
      'accessibilityState',
      expect.objectContaining({checked: false}),
    )
    fireEvent.press(contextualToggle)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'set_post_target',
      target: PRIVATE_TARGET,
    })
  })

  it('announces the poll removal when switching to a private feed', () => {
    const {dispatch, getByTestId} = renderControls({
      draft: thread({posts: [TEXT_POST, POLL_POST]}),
      target: PRIVATE_TARGET,
    })

    fireEvent.press(getByTestId('permissioned_space'))

    expect(mockToast).toHaveBeenCalledTimes(1)
    expect(mockToast).toHaveBeenCalledWith(POLL_REMOVED_MESSAGE, {type: 'info'})
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'set_post_target',
      target: PRIVATE_TARGET,
    })
  })

  it('stays quiet when leaving the private feed', () => {
    const {dispatch, getByTestId} = renderControls({
      draft: thread({posts: [POLL_POST], communityFeed: PRIVATE_TARGET}),
      target: PRIVATE_TARGET,
    })

    fireEvent.press(getByTestId('permissioned_space'))

    expect(mockToast).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'set_post_target',
      target: 'public',
    })
  })

  it('stays quiet when no post has a poll', () => {
    const {dispatch, getByTestId} = renderControls({
      draft: thread({posts: [TEXT_POST]}),
      target: PRIVATE_TARGET,
    })

    fireEvent.press(getByTestId('permissioned_space'))

    expect(mockToast).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'set_post_target',
      target: PRIVATE_TARGET,
    })
  })

  it('announces the poll removal when switching to a community-record feed', () => {
    const {dispatch, getByTestId} = renderControls({
      draft: thread({posts: [POLL_POST]}),
      target: COMMUNITY_RECORD_TARGET,
    })

    fireEvent.press(getByTestId('permissioned_space'))

    expect(mockToast).toHaveBeenCalledTimes(1)
    expect(mockToast).toHaveBeenCalledWith(POLL_REMOVED_MESSAGE, {type: 'info'})
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'set_post_target',
      target: COMMUNITY_RECORD_TARGET,
    })
  })

  it('stays quiet when the selected feed takes public posts', () => {
    const {dispatch, getByTestId} = renderControls({
      draft: thread({posts: [POLL_POST]}),
      target: PUBLIC_RECORD_TARGET,
    })

    fireEvent.press(getByTestId('permissioned_space'))

    expect(mockToast).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'set_post_target',
      target: PUBLIC_RECORD_TARGET,
    })
  })

  it('judges the selected feed, not what the thread quotes', () => {
    const {dispatch, getByTestId} = renderControls({
      draft: thread({posts: [POLL_POST, COMMUNITY_QUOTE_POST]}),
      target: PUBLIC_RECORD_TARGET,
    })

    fireEvent.press(getByTestId('permissioned_space'))

    expect(mockToast).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'set_post_target',
      target: PUBLIC_RECORD_TARGET,
    })
  })

  it('judges the selected feed, not the audience it replaces', () => {
    const {dispatch, getByTestId} = renderControls({
      draft: thread({posts: [POLL_POST], blackskyOnly: true}),
      target: PUBLIC_RECORD_TARGET,
    })

    fireEvent.press(getByTestId('permissioned_space'))

    expect(mockToast).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'set_post_target',
      target: PUBLIC_RECORD_TARGET,
    })
  })

  it('announces the poll removal when Blacksky Only is turned on', () => {
    const {dispatch, getByTestId, setBlackskyOnlyDefault} = renderControls({
      draft: thread({posts: [TEXT_POST, POLL_POST]}),
    })

    fireEvent.press(getByTestId('blacksky_only'))

    expect(mockToast).toHaveBeenCalledTimes(1)
    expect(mockToast).toHaveBeenCalledWith(POLL_REMOVED_MESSAGE, {type: 'info'})
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({type: 'toggle_blacksky_only'})
    expect(setBlackskyOnlyDefault).toHaveBeenCalledWith(true)
  })

  it('stays quiet when Blacksky Only is turned on without a poll', () => {
    const {dispatch, getByTestId, setBlackskyOnlyDefault} = renderControls({
      draft: thread({posts: [TEXT_POST]}),
    })

    fireEvent.press(getByTestId('blacksky_only'))

    expect(mockToast).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({type: 'toggle_blacksky_only'})
    expect(setBlackskyOnlyDefault).toHaveBeenCalledWith(true)
  })

  it('stays quiet when Blacksky Only is turned off', () => {
    const {dispatch, getByTestId, setBlackskyOnlyDefault} = renderControls({
      draft: thread({posts: [POLL_POST], blackskyOnly: true}),
    })

    fireEvent.press(getByTestId('blacksky_only'))

    expect(mockToast).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({type: 'toggle_blacksky_only'})
    expect(setBlackskyOnlyDefault).toHaveBeenCalledWith(false)
  })

  it('does not expose private-space controls outside selected-feed context', () => {
    const {queryByTestId} = renderControls({
      draft: thread({communityFeed: PRIVATE_TARGET}),
    })

    expect(queryByTestId('permissioned_space')).toBeNull()
  })

  it('does not expose destination controls for a forced private quote', () => {
    const {queryByTestId} = renderControls({
      target: PRIVATE_TARGET,
      isForcedCommunityTarget: true,
    })

    expect(queryByTestId('blacksky_only')).toBeNull()
    expect(queryByTestId('permissioned_space')).toBeNull()
  })
})
