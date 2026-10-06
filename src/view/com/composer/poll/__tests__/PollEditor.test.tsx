import {type useEffect, useReducer, type useRef} from 'react'
import {act, fireEvent, render} from '@testing-library/react-native'

import {
  composerReducer,
  type ComposerState,
  createComposerState,
  type PostAction,
} from '#/view/com/composer/state/composer'

type ReactHooks = {useEffect: typeof useEffect; useRef: typeof useRef}

jest.mock('@lingui/react', () => {
  const format = (
    message:
      | {message?: string; values?: Record<string, string | number>}
      | string,
  ) => {
    if (typeof message === 'string') return message
    return (message.message ?? '').replace(/{(\w+)}/g, (_, key: string) =>
      String(message.values?.[key] ?? ''),
    )
  }
  return {
    useLingui: () => ({_: format}),
    Trans: ({
      id,
      message,
      values,
    }: {
      id: string
      message?: string
      values?: Record<string, string | number>
    }) => format({message: message ?? id, values}),
  }
})
jest.mock('#/alf', () => {
  const blank = new Proxy({}, {get: () => ({})})
  return {
    atoms: blank,
    useTheme: () => ({
      atoms: blank,
      palette: new Proxy({}, {get: (target, key) => String(key)}),
    }),
  }
})
jest.mock('#/components/Typography', () => {
  const {Text} = require('react-native')
  return {Text}
})
jest.mock('#/components/icons/Poll', () => ({
  Poll_Stroke2_Corner0_Rounded: () => null,
}))
jest.mock('#/components/icons/Plus', () => ({
  PlusLarge_Stroke2_Corner0_Rounded: () => null,
}))
jest.mock('#/components/icons/Times', () => ({
  TimesLarge_Stroke2_Corner0_Rounded: () => null,
}))
jest.mock('#/components/Button', () => {
  const {Pressable, Text} = require('react-native')
  return {
    Button: ({
      children,
      label,
      onPress,
      testID,
    }: {
      children: React.ReactNode
      label: string
      onPress: () => void
      testID?: string
    }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint=""
        onPress={onPress}
        testID={testID}>
        {children}
      </Pressable>
    ),
    ButtonText: ({children}: {children: React.ReactNode}) => (
      <Text>{children}</Text>
    ),
    ButtonIcon: () => null,
  }
})

const mockInputLifecycle = jest.fn()
jest.mock('#/components/forms/TextField', () => {
  const hooks = jest.requireActual<ReactHooks>('react')
  const {TextInput} = require('react-native')
  return {
    Root: ({children}: {children: React.ReactNode}) => children,
    Input: ({
      label,
      maxLength,
      onChangeText,
      placeholder,
      testID,
      value,
    }: {
      label: string
      maxLength: number
      onChangeText: (text: string) => void
      placeholder: string
      testID: string
      value: string
    }) => {
      const mountedWith = hooks.useRef(value)
      hooks.useEffect(() => {
        const initial = mountedWith.current
        mockInputLifecycle('mount', initial)
        return () => mockInputLifecycle('unmount', initial)
      }, [])
      return (
        <TextInput
          maxLength={maxLength}
          accessibilityLabel={label}
          accessibilityHint=""
          onChangeText={onChangeText}
          placeholder={placeholder}
          testID={testID}
          value={value}
        />
      )
    },
  }
})

const mockVoteButtons = jest.fn()
jest.mock('#/components/Post/Embed/ExternalEmbed/VoteButtons', () => {
  const {Pressable} = require('react-native')
  return {
    VoteButtons: (props: {disabled?: boolean}) => {
      mockVoteButtons(props.disabled)
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Agree"
          accessibilityHint=""
          disabled={props.disabled}
          testID="pollVote-agree"
        />
      )
    },
  }
})

const mockMetric = jest.fn()
jest.mock('#/analytics', () => ({
  useAnalytics: () => ({metric: mockMetric}),
}))

jest.mock('#/lib/api/community-feed', () => ({
  isSpaceBackedFeed: (config: {space?: string} | undefined) => !!config?.space,
}))
jest.mock('#/state/gallery', () => ({createInitialImages: jest.fn()}))
jest.mock('#/state/queries/threadgate', () => ({
  threadgateRecordToAllowUISetting: jest.fn(() => []),
}))
jest.mock('#/view/com/composer/state/video', () => ({
  createVideoState: jest.fn(),
  videoReducer: jest.fn(),
}))

import {PollEditor} from '../PollEditor'

const INVALID_HINT = 'This statement contains characters that cannot be saved.'
const TOO_LONG_HINT = 'This statement is too long. Shorten it to post.'
const BLANK_HINT = 'Add text or remove this statement to post.'
const DUPLICATE_HINT = 'This statement repeats another one.'
const TOPIC_MISSING_HINT = 'Add post text to ask your question.'
const TOPIC_INVALID_HINT =
  'Your post text contains characters that cannot be saved.'
const QUESTION_LINE = 'Your post text is the question.'
const PUBLIC_LINE = "Statements and votes are public on People's Assembly."

function composerWith(statements: string[]): ComposerState {
  let state = createComposerState({
    initText: undefined,
    initMention: undefined,
    initImageUris: undefined,
    initQuoteUri: undefined,
    initInteractionSettings: undefined,
  })
  const postId = state.thread.posts[0].id
  const actions: PostAction[] = [
    {type: 'embed_add_poll'},
    ...statements.slice(1).map(() => ({
      type: 'embed_add_poll_statement' as const,
    })),
    ...statements.map((text, index) => ({
      type: 'embed_update_poll_statement' as const,
      index,
      text,
    })),
  ]
  for (const postAction of actions) {
    state = composerReducer(state, {type: 'update_post', postId, postAction})
  }
  return state
}

const mockDispatch = jest.fn()

function ComposerHarness({
  statements,
  text,
}: {
  statements: string[]
  text: string
}) {
  const [state, dispatch] = useReducer(
    composerReducer,
    statements,
    composerWith,
  )
  const post = state.thread.posts[0]
  if (!post.embed.poll) return null
  return (
    <PollEditor
      poll={post.embed.poll}
      text={text}
      dispatch={postAction => {
        mockDispatch(postAction)
        dispatch({type: 'update_post', postId: post.id, postAction})
      }}
    />
  )
}

function renderEditor(statements: string[], text = 'What should we do?') {
  return render(<ComposerHarness statements={statements} text={text} />)
}

function lifecycle(kind: 'mount' | 'unmount') {
  return (mockInputLifecycle.mock.calls as [string, string][])
    .filter(([event]) => event === kind)
    .map(([, value]) => value)
}

describe('PollEditor', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('reports an edit with the index of the statement', () => {
    const {getByTestId} = renderEditor(['one', 'two'])

    expect(getByTestId('pollStatementInput-1')).toHaveProp(
      'accessibilityLabel',
      'Statement 2',
    )
    fireEvent.changeText(getByTestId('pollStatementInput-1'), 'changed')

    expect(mockDispatch).toHaveBeenCalledTimes(1)
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'embed_update_poll_statement',
      index: 1,
      text: 'changed',
    })
    expect(getByTestId('pollStatementInput-0')).toHaveProp('value', 'one')
    expect(getByTestId('pollStatementInput-1')).toHaveProp('value', 'changed')
  })

  it('stops every statement field at the longest text that can be stored', () => {
    const {getByTestId} = renderEditor(['one', 'two'])

    expect(getByTestId('pollStatementInput-0')).toHaveProp('maxLength', 997)
    expect(getByTestId('pollStatementInput-1')).toHaveProp('maxLength', 997)
  })

  it('adds a statement and reports the new count', () => {
    const {getByTestId} = renderEditor(['one', 'two', 'three'])

    fireEvent.press(getByTestId('addPollStatementBtn'))

    expect(mockMetric).toHaveBeenCalledTimes(1)
    expect(mockMetric).toHaveBeenCalledWith('composer:poll:statementAdd', {
      count: 4,
    })
    expect(mockDispatch).toHaveBeenCalledTimes(1)
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'embed_add_poll_statement',
    })
  })

  it('hides the add row at ten statements', () => {
    const nine = renderEditor(Array.from({length: 9}, (_, i) => `s${i}`))
    expect(nine.getByTestId('addPollStatementBtn')).toBeTruthy()
    nine.unmount()

    const ten = renderEditor(Array.from({length: 10}, (_, i) => `s${i}`))
    expect(ten.getByTestId('pollStatementInput-9')).toBeTruthy()
    expect(ten.queryByTestId('addPollStatementBtn')).toBeNull()
  })

  it('hides the per-statement remove when there is one statement', () => {
    const {queryByTestId} = renderEditor(['only'])
    expect(queryByTestId('pollStatementRemove-0')).toBeNull()
  })

  it('removes a statement by its index', () => {
    const {getByTestId} = renderEditor(['one', 'two', 'three'])

    fireEvent.press(getByTestId('pollStatementRemove-1'))

    expect(mockDispatch).toHaveBeenCalledTimes(1)
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'embed_remove_poll_statement',
      index: 1,
    })
    expect(mockMetric).not.toHaveBeenCalled()
  })

  it('removes the poll and reports it', () => {
    const {getByTestId, queryByTestId} = renderEditor(['one'])

    fireEvent.press(getByTestId('removePollBtn'))

    expect(mockMetric).toHaveBeenCalledTimes(1)
    expect(mockMetric).toHaveBeenCalledWith('composer:poll:remove', {})
    expect(mockDispatch).toHaveBeenCalledTimes(1)
    expect(mockDispatch).toHaveBeenCalledWith({type: 'embed_remove_poll'})
    expect(queryByTestId('pollEditor')).toBeNull()
  })

  it('shows the grapheme counter for a publishable statement', () => {
    const {getByTestId} = renderEditor(['  fine  '])
    const hint = getByTestId('pollStatementHint-0')
    expect(hint).toHaveTextContent('4 / 400', {exact: true})
    expect(hint).not.toHaveStyle({color: 'negative_500'})
  })

  it('explains a blank statement only when it can be removed', () => {
    const extra = renderEditor(['one', '   '])
    expect(extra.getByTestId('pollStatementHint-0')).toHaveTextContent(
      '3 / 400',
      {exact: true},
    )
    const blank = extra.getByTestId('pollStatementHint-1')
    expect(blank).toHaveTextContent(BLANK_HINT, {exact: true})
    expect(blank).not.toHaveStyle({color: 'negative_500'})
    extra.unmount()

    const only = renderEditor([''])
    expect(only.getByTestId('pollStatementHint-0')).toHaveTextContent(
      '0 / 400',
      {exact: true},
    )
  })

  it('explains a statement over the byte cap but under the grapheme cap', () => {
    const cluster = 'a' + '\u20dd'.repeat(3)
    const atCap = renderEditor([cluster.repeat(200)])
    expect(atCap.getByTestId('pollStatementHint-0')).toHaveTextContent(
      '200 / 400',
      {exact: true},
    )
    atCap.unmount()

    const overCap = renderEditor([cluster.repeat(201)])
    const hint = overCap.getByTestId('pollStatementHint-0')
    expect(hint).toHaveTextContent(TOO_LONG_HINT, {exact: true})
    expect(hint).toHaveStyle({color: 'negative_500'})
  })

  it('keeps the counter for a statement over the grapheme cap', () => {
    const {getByTestId} = renderEditor(['a'.repeat(401)])
    const hint = getByTestId('pollStatementHint-0')
    expect(hint).toHaveTextContent('401 / 400', {exact: true})
    expect(hint).toHaveStyle({color: 'negative_500'})
  })

  it('explains a statement with characters that cannot be saved', () => {
    const {getByTestId} = renderEditor(['a\u0000b', 'a\ud800'])
    for (const index of [0, 1]) {
      const hint = getByTestId(`pollStatementHint-${index}`)
      expect(hint).toHaveTextContent(INVALID_HINT, {exact: true})
      expect(hint).toHaveStyle({color: 'negative_500'})
    }
  })

  it('explains a statement that repeats an earlier one', () => {
    const {getByTestId} = renderEditor([
      'Fund the library',
      'Close the pool',
      '  fund the LIBRARY ',
    ])

    expect(getByTestId('pollStatementHint-0')).toHaveTextContent('16 / 400', {
      exact: true,
    })
    expect(getByTestId('pollStatementHint-0')).not.toHaveStyle({
      color: 'negative_500',
    })
    expect(getByTestId('pollStatementHint-1')).toHaveTextContent('14 / 400', {
      exact: true,
    })
    const repeat = getByTestId('pollStatementHint-2')
    expect(repeat).toHaveTextContent(DUPLICATE_HINT, {exact: true})
    expect(repeat).toHaveStyle({color: 'negative_500'})
  })

  it('drops the repeat hint once the statement differs', () => {
    const {getByTestId} = renderEditor(['same', 'same'])
    expect(getByTestId('pollStatementHint-1')).toHaveTextContent(
      DUPLICATE_HINT,
      {exact: true},
    )

    fireEvent.changeText(getByTestId('pollStatementInput-1'), 'different')

    const hint = getByTestId('pollStatementHint-1')
    expect(hint).toHaveTextContent('9 / 400', {exact: true})
    expect(hint).not.toHaveStyle({color: 'negative_500'})
  })

  it('does not count blank statements as repeats of each other', () => {
    const {getByTestId} = renderEditor(['', ''])
    for (const index of [0, 1]) {
      expect(getByTestId(`pollStatementHint-${index}`)).toHaveTextContent(
        BLANK_HINT,
        {exact: true},
      )
    }
  })

  it.each([
    {kind: 'empty', text: ''},
    {kind: 'only whitespace', text: ' \n\t '},
  ])('asks for post text when it is $kind', ({text}) => {
    const {getByTestId} = renderEditor(['one'], text)
    const hint = getByTestId('pollTopicHint')
    expect(hint).toHaveTextContent(TOPIC_MISSING_HINT, {exact: true})
    expect(hint).not.toHaveStyle({color: 'negative_500'})
  })

  it.each([
    {kind: 'a null character', text: 'a\u0000b'},
    {kind: 'a lone surrogate', text: 'a\ud800'},
  ])('explains post text with $kind', ({text}) => {
    const {getByTestId} = renderEditor(['one'], text)
    const hint = getByTestId('pollTopicHint')
    expect(hint).toHaveTextContent(TOPIC_INVALID_HINT, {exact: true})
    expect(hint).toHaveStyle({color: 'negative_500'})
  })

  it('shows no post text hint when there is post text', () => {
    const {queryByTestId, queryByText} = renderEditor(['one'], 'A question')
    expect(queryByTestId('pollTopicHint')).toBeNull()
    expect(queryByText(TOPIC_MISSING_HINT)).toBeNull()
    expect(queryByText(TOPIC_INVALID_HINT)).toBeNull()
  })

  it('follows the post text as it changes', () => {
    const {queryByTestId, rerender} = renderEditor(['one'], '')
    expect(queryByTestId('pollTopicHint')).toHaveTextContent(
      TOPIC_MISSING_HINT,
      {exact: true},
    )

    rerender(<ComposerHarness statements={['one']} text="Now a question" />)

    expect(queryByTestId('pollTopicHint')).toBeNull()
  })

  it('says where the question comes from and that the poll is public', () => {
    const {getByText, queryByText} = renderEditor(['one'])

    expect(getByText(QUESTION_LINE, {exact: true})).toBeTruthy()
    expect(getByText(PUBLIC_LINE, {exact: true})).toBeTruthy()
    expect(getByText(QUESTION_LINE)).not.toBe(getByText(PUBLIC_LINE))
    expect(queryByText(/other apps show your post text only/)).toBeNull()
    expect(queryByText(/Readers vote Agree/)).toBeNull()
  })

  it('hides the disabled vote preview from assistive technology', () => {
    const {getByTestId, queryByTestId} = renderEditor(['one'])

    expect(mockVoteButtons).toHaveBeenCalledWith(true)
    expect(queryByTestId('pollVote-agree')).toBeNull()
    expect(
      getByTestId('pollVote-agree', {includeHiddenElements: true}),
    ).toBeTruthy()

    const preview = getByTestId('pollVotePreview', {
      includeHiddenElements: true,
    })
    expect(preview).toHaveProp('aria-hidden', true)
    expect(preview).toHaveProp('accessibilityElementsHidden', true)
    expect(preview).toHaveProp(
      'importantForAccessibility',
      'no-hide-descendants',
    )
    expect(preview).toHaveProp('pointerEvents', 'none')
  })

  it('unmounts only the removed row so the others keep their input', () => {
    const {getByTestId, queryByTestId} = renderEditor(['A', 'B', 'C'])
    expect(lifecycle('mount')).toEqual(['A', 'B', 'C'])

    fireEvent.press(getByTestId('pollStatementRemove-0'))

    expect(lifecycle('unmount')).toEqual(['A'])
    expect(lifecycle('mount')).toEqual(['A', 'B', 'C'])
    expect(getByTestId('pollStatementInput-0')).toHaveProp('value', 'B')
    expect(getByTestId('pollStatementInput-1')).toHaveProp('value', 'C')
    expect(queryByTestId('pollStatementInput-2')).toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('mounts one new row when a statement is added', () => {
    const {getByTestId} = renderEditor(['A', 'B'])

    fireEvent.press(getByTestId('addPollStatementBtn'))

    expect(lifecycle('mount')).toEqual(['A', 'B', ''])
    expect(lifecycle('unmount')).toEqual([])
    expect(getByTestId('pollStatementInput-2')).toHaveProp('value', '')
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('keeps the last row mounted when a removal is pressed twice', () => {
    const {getByTestId, queryByTestId} = renderEditor(['A', 'B'])
    const remove = getByTestId('pollStatementRemove-0')

    act(() => {
      fireEvent.press(remove)
      fireEvent.press(remove)
    })

    expect(mockDispatch).toHaveBeenCalledTimes(2)
    expect(lifecycle('unmount')).toEqual(['A'])
    expect(lifecycle('mount')).toEqual(['A', 'B'])
    expect(getByTestId('pollStatementInput-0')).toHaveProp('value', 'B')
    expect(queryByTestId('pollStatementInput-1')).toBeNull()
    expect(queryByTestId('pollStatementRemove-0')).toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('stops adding rows at ten when the add row is pressed twice', () => {
    const {getByTestId, queryByTestId} = renderEditor(
      Array.from({length: 9}, (_, i) => `s${i}`),
    )
    const add = getByTestId('addPollStatementBtn')

    act(() => {
      fireEvent.press(add)
      fireEvent.press(add)
    })

    expect(mockDispatch).toHaveBeenCalledTimes(2)
    expect(lifecycle('mount')).toHaveLength(10)
    expect(lifecycle('unmount')).toEqual([])
    expect(getByTestId('pollStatementInput-9')).toHaveProp('value', '')
    expect(queryByTestId('pollStatementInput-10')).toBeNull()
    expect(queryByTestId('addPollStatementBtn')).toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
  })
})
