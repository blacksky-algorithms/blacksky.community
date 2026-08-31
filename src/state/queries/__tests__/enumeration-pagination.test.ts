import {type AppBskyGraphDefs, type AtpAgent} from '@atproto/api'

jest.mock('#/state/session', () => ({useAgent: jest.fn()}))

import {getAllListMembers} from '#/state/queries/list-members'
import {dedupeBy, getNextCursor} from '#/state/queries/pagination'

function listItem(did: string): AppBskyGraphDefs.ListItemView {
  return {subject: {did}} as AppBskyGraphDefs.ListItemView
}

describe('enumeration pagination', () => {
  it('rejects a cursor that has already been requested', () => {
    expect(getNextCursor('cursor-b', [undefined, 'cursor-a'])).toBe('cursor-b')
    expect(getNextCursor('cursor-a', [undefined, 'cursor-a'])).toBeUndefined()
  })

  it('keeps the first occurrence of each account in server order', () => {
    const items = [
      listItem('did:plc:first'),
      listItem('did:plc:jason'),
      listItem('did:plc:jason'),
    ]

    expect(dedupeBy(items, item => item.subject.did)).toEqual(items.slice(0, 2))
  })

  it('stops and deduplicates when list pagination repeats its cursor', async () => {
    const first = listItem('did:plc:first')
    const repeated = listItem('did:plc:jason')
    const getList = jest
      .fn()
      .mockResolvedValueOnce({
        data: {items: [first, repeated], cursor: 'stuck-cursor'},
      })
      .mockResolvedValue({
        data: {items: [repeated], cursor: 'stuck-cursor'},
      })
    const agent = {
      app: {bsky: {graph: {getList}}},
    } as unknown as AtpAgent

    const items = await getAllListMembers(agent, 'at://did:plc:test/list/1')

    expect(items.map(item => item.subject.did)).toEqual([
      'did:plc:first',
      'did:plc:jason',
    ])
    expect(getList).toHaveBeenCalledTimes(2)
  })
})
