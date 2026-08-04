import {
  decide,
  type DeciderState,
  DEFAULT_THRESHOLDS,
  INITIAL_DECIDER_STATE,
  type StatusSample,
} from '../appview-status'

const T = DEFAULT_THRESHOLDS

function run(samples: Array<StatusSample | null>, from?: DeciderState) {
  let state = from ?? INITIAL_DECIDER_STATE
  for (const s of samples) state = decide(state, s, T)
  return state
}

const LAGGING: StatusSample = {lagSeconds: 600, queueLength: 0}
const HEALTHY: StatusSample = {lagSeconds: 5, queueLength: 100}
const BACKLOGGED: StatusSample = {lagSeconds: 5, queueLength: 500_000}
const MIDDLING: StatusSample = {lagSeconds: 120, queueLength: 0}

describe('fallback decider', () => {
  it('enters after consecutive lagging samples, not one', () => {
    expect(run([LAGGING]).active).toBe(false)
    expect(run([LAGGING, LAGGING]).active).toBe(true)
  })

  it('a healthy sample resets the enter streak', () => {
    expect(run([LAGGING, HEALTHY, LAGGING]).active).toBe(false)
  })

  it('queue backlog alone triggers entry even with low lag', () => {
    expect(run([BACKLOGGED, BACKLOGGED]).active).toBe(true)
  })

  it('exits only after sustained health', () => {
    const active = run([LAGGING, LAGGING])
    expect(run([HEALTHY, HEALTHY], active).active).toBe(true)
    expect(run([HEALTHY, HEALTHY, HEALTHY], active).active).toBe(false)
  })

  it('middling lag holds the current state in both directions', () => {
    expect(run([MIDDLING, MIDDLING, MIDDLING]).active).toBe(false)
    const active = run([LAGGING, LAGGING])
    expect(run([MIDDLING, MIDDLING, MIDDLING, MIDDLING], active).active).toBe(
      true,
    )
  })

  it('failed or empty polls never move the counters', () => {
    expect(run([LAGGING, null, LAGGING]).active).toBe(true)
    const active = run([LAGGING, LAGGING])
    expect(
      run([null, null, null, {lagSeconds: null, queueLength: null}], active)
        .active,
    ).toBe(true)
  })

  it('a good streak broken by a bad sample starts over', () => {
    const active = run([LAGGING, LAGGING])
    expect(
      run([HEALTHY, HEALTHY, LAGGING, HEALTHY, HEALTHY], active).active,
    ).toBe(true)
  })
})
