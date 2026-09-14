import {nextAutoPaginationAttemptCount, shouldAutoPaginate} from '../pagination'

describe(shouldAutoPaginate, () => {
  it('continues through an empty page that has a cursor', () => {
    expect(
      shouldAutoPaginate({
        hasNextPage: true,
        itemCount: 0,
        wantedItemCount: 30,
        attemptCount: 0,
      }),
    ).toBe(true)
  })

  it('continues when filtering leaves a short page', () => {
    expect(
      shouldAutoPaginate({
        hasNextPage: true,
        itemCount: 4,
        wantedItemCount: 30,
        attemptCount: 3,
      }),
    ).toBe(true)
  })

  it('stops on a terminal empty page', () => {
    expect(
      shouldAutoPaginate({
        hasNextPage: false,
        itemCount: 0,
        wantedItemCount: 30,
        attemptCount: 0,
      }),
    ).toBe(false)
  })

  it('stops at the 50-attempt safety bound', () => {
    expect(
      shouldAutoPaginate({
        hasNextPage: true,
        itemCount: 0,
        wantedItemCount: 30,
        attemptCount: 49,
      }),
    ).toBe(true)
    expect(
      shouldAutoPaginate({
        hasNextPage: true,
        itemCount: 0,
        wantedItemCount: 30,
        attemptCount: 50,
      }),
    ).toBe(false)
  })
})

describe(nextAutoPaginationAttemptCount, () => {
  it.each([
    {isLoading: true, isRefetching: false, hasNextPage: true},
    {isLoading: false, isRefetching: true, hasNextPage: true},
    {isLoading: false, isRefetching: false, hasNextPage: false},
  ])('resets attempts for $isLoading/$isRefetching/$hasNextPage', state => {
    expect(
      nextAutoPaginationAttemptCount({
        attemptCount: 17,
        requestNextPage: false,
        ...state,
      }),
    ).toBe(0)
  })

  it('increments only when the active cycle requests another page', () => {
    expect(
      nextAutoPaginationAttemptCount({
        attemptCount: 17,
        hasNextPage: true,
        isLoading: false,
        isRefetching: false,
        requestNextPage: true,
      }),
    ).toBe(18)
    expect(
      nextAutoPaginationAttemptCount({
        attemptCount: 17,
        hasNextPage: true,
        isLoading: false,
        isRefetching: false,
        requestNextPage: false,
      }),
    ).toBe(17)
  })
})
