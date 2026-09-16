import {initialState, reducer, SignupStep} from '../state'

jest.mock('#/state/session', () => ({useSessionApi: jest.fn()}))
jest.mock('#/state/shell', () => ({useOnboardingDispatch: jest.fn()}))

describe('signup navigation', () => {
  it('starts at details and excludes the community picker from the forward path', () => {
    expect(initialState.activeStep).toBe(SignupStep.INFO)
    const profile = reducer(initialState, {type: 'next'})
    expect(profile.activeStep).toBe(SignupStep.HANDLE)
    expect(reducer(profile, {type: 'prev'}).activeStep).toBe(SignupStep.INFO)
    expect(reducer(initialState, {type: 'prev'}).activeStep).toBe(
      SignupStep.INFO,
    )
  })
  it('returns from the community picker without losing entered details', () => {
    const draft = {
      ...initialState,
      email: 'test@example.com',
      password: 'example-password',
      inviteCode: 'invite',
    }
    const picker = reducer(draft, {
      type: 'setStep',
      value: SignupStep.COMMUNITY,
    })
    expect(picker.hasPrev).toBe(true)
    for (const type of ['prev', 'next'] as const) {
      const result = reducer(picker, {type})
      expect(result.activeStep).toBe(SignupStep.INFO)
      expect(result.email).toBe(draft.email)
      expect(result.password).toBe(draft.password)
      expect(result.inviteCode).toBe(draft.inviteCode)
    }
  })
  it('clears provider metadata when selecting another community', () => {
    const next = reducer(
      {
        ...initialState,
        userDomain: '.blacksky.app',
        serviceDescription: {
          did: 'did:web:example.com',
          availableUserDomains: ['.blacksky.app'],
        },
      },
      {
        type: 'setCommunity',
        slug: 'another',
        serviceUrl: 'https://example.com',
      },
    )
    expect(next.serviceDescription).toBeUndefined()
    expect(next.userDomain).toBe('')
    expect(next.isLoading).toBe(true)
  })
  it('preserves a valid domain through provider metadata refreshes', () => {
    const next = reducer(
      {...initialState, userDomain: '.myatproto.social'},
      {
        type: 'setServiceDescription',
        value: {
          did: 'did:web:example.com',
          availableUserDomains: ['.blacksky.app', '.myatproto.social'],
        },
      },
    )
    expect(next.userDomain).toBe('.myatproto.social')
  })
  it('only defaults to a domain advertised by the provider', () => {
    const next = reducer(initialState, {
      type: 'setServiceDescription',
      value: {
        did: 'did:web:example.com',
        availableUserDomains: ['.example.com'],
      },
    })
    expect(next.userDomain).toBe('.example.com')
  })
})

it('keeps provider metadata when reselecting the current community', () => {
  const current = {
    ...initialState,
    serviceUrl: 'https://example.com',
    userDomain: '.example.com',
    serviceDescription: {
      did: 'did:web:example.com',
      availableUserDomains: ['.example.com'],
    },
  }
  const next = reducer(current, {
    type: 'setCommunity',
    slug: 'example',
    serviceUrl: current.serviceUrl,
  })
  expect(next.serviceDescription).toEqual(current.serviceDescription)
  expect(next.userDomain).toBe(current.userDomain)
  expect(next.isLoading).toBe(false)
})

it('tracks the selected community even when communities share a PDS', () => {
  const sharedPds = 'https://pds.example.com'
  const latinsky = reducer(
    {...initialState, serviceUrl: sharedPds, selectedBrandSlug: 'blacksky'},
    {type: 'setCommunity', slug: 'latinsky', serviceUrl: sharedPds},
  )

  expect(latinsky.serviceUrl).toBe(sharedPds)
  expect(latinsky.selectedBrandSlug).toBe('latinsky')
})

it('filters shared-PDS handles to the selected community', () => {
  const latinsky = reducer(
    {...initialState, serviceUrl: 'https://pds.example.com'},
    {
      type: 'setCommunity',
      slug: 'latinsky',
      serviceUrl: 'https://pds.example.com',
    },
  )
  const next = reducer(latinsky, {
    type: 'setServiceDescription',
    value: {
      did: 'did:web:example.com',
      availableUserDomains: ['.blacksky.app', '.latinsky.app'],
    },
    availableHandles: ['.latinsky.app'],
  })

  expect(next.serviceDescription?.availableUserDomains).toEqual([
    '.latinsky.app',
  ])
  expect(next.userDomain).toBe('.latinsky.app')
})

it('preserves a submission error when routing back to the field that needs correction', () => {
  const error = reducer(initialState, {
    type: 'setError',
    field: 'handle',
    value: 'Handle unavailable',
  })
  const next = reducer(error, {type: 'setStep', value: SignupStep.HANDLE})
  expect(next.error).toBe('Handle unavailable')
  expect(next.errorField).toBe('handle')
})
