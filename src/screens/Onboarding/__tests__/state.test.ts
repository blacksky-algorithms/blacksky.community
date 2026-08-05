import {describe, expect, it} from '@jest/globals'

import {
  createInitialOnboardingState,
  getStepOrder,
  type OnboardingState,
  reducer,
} from '../state'

const EXPECTED_ORDER = [
  'profile',
  'pin-feeds',
  'belong',
  'blacksky-only',
  'assembly',
  'finished',
]

function advance(state: OnboardingState, times: number): OnboardingState {
  let next = state
  for (let i = 0; i < times; i++) {
    next = reducer(next, {type: 'next'})
  }
  return next
}

describe('onboarding state', () => {
  describe('getStepOrder', () => {
    it('returns exactly the redesigned post-account order', () => {
      const initial = createInitialOnboardingState()
      expect(getStepOrder(initial)).toEqual(EXPECTED_ORDER)
    })

    it('does not include the dropped interests step', () => {
      const initial = createInitialOnboardingState()
      expect(getStepOrder(initial)).not.toContain('interests')
    })
  })

  describe('navigation', () => {
    it('starts on profile', () => {
      expect(createInitialOnboardingState().activeStep).toBe('profile')
    })

    it('next walks forward through the full order and stops at finished', () => {
      let state = createInitialOnboardingState()
      const visited = [state.activeStep]
      for (let i = 0; i < EXPECTED_ORDER.length + 2; i++) {
        state = reducer(state, {type: 'next'})
        visited.push(state.activeStep)
      }
      expect(visited.slice(0, EXPECTED_ORDER.length)).toEqual(EXPECTED_ORDER)
      // Past the end, it clamps on the last step.
      expect(state.activeStep).toBe('finished')
    })

    it('prev walks backward and clamps at profile', () => {
      let state = advance(createInitialOnboardingState(), 3)
      expect(state.activeStep).toBe('blacksky-only')
      state = reducer(state, {type: 'prev'})
      expect(state.activeStep).toBe('belong')
      state = reducer(state, {type: 'prev'})
      state = reducer(state, {type: 'prev'})
      state = reducer(state, {type: 'prev'})
      expect(state.activeStep).toBe('profile')
    })

    it('sets the transition direction', () => {
      const forward = reducer(createInitialOnboardingState(), {type: 'next'})
      expect(forward.stepTransitionDirection).toBe('Forward')
      const backward = reducer(forward, {type: 'prev'})
      expect(backward.stepTransitionDirection).toBe('Backward')
    })
  })

  describe('setPinFeedsStepResults', () => {
    it('defaults to an empty selection', () => {
      expect(
        createInitialOnboardingState().pinFeedsStepResults.selectedFeedUris,
      ).toEqual([])
    })

    it('stores the selected feed uris', () => {
      const uris = [
        'at://did:plc:example/app.bsky.feed.generator/one',
        'at://did:plc:example/app.bsky.feed.generator/two',
      ]
      const state = reducer(createInitialOnboardingState(), {
        type: 'setPinFeedsStepResults',
        selectedFeedUris: uris,
      })
      expect(state.pinFeedsStepResults.selectedFeedUris).toEqual(uris)
    })
  })
})
