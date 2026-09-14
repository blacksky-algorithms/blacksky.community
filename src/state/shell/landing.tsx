import {createContext, useContext, useEffect, useState} from 'react'

import {logger} from '#/logger'

type StarterPackLanding = {
  type: 'starterpack'
  uri: string
  isClip?: boolean
}

type GroupChatJoinRequestLanding = {
  type: 'groupchat'
  uri: string
  code: string
}

type GroupInviteLanding = {
  type: 'groupinvite'
  uri: string
  code: string
}

type LandingType =
  | StarterPackLanding
  | GroupChatJoinRequestLanding
  | GroupInviteLanding
  | undefined

type SetContext = (v: LandingType) => void

const PENDING_GROUP_INVITE_KEY = 'blacksky.pendingGroupInvite'

function readPendingGroupInvite(): GroupInviteLanding | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const value: unknown = JSON.parse(
      window.sessionStorage.getItem(PENDING_GROUP_INVITE_KEY) ?? 'null',
    )
    const code =
      value && typeof value === 'object'
        ? (value as {code?: unknown}).code
        : undefined
    if (
      value &&
      typeof value === 'object' &&
      (value as {type?: unknown}).type === 'groupinvite' &&
      typeof code === 'string' &&
      /^[A-Za-z0-9_-]{43}$/.test(code)
    ) {
      return {type: 'groupinvite', uri: '', code}
    }
  } catch {
    // Session storage is a best-effort OAuth resume aid.
  }
  return undefined
}

const stateContext = createContext<LandingType>(undefined)
stateContext.displayName = 'ActiveLandingStateContext'
const setContext = createContext<SetContext>((_: LandingType) => {})
setContext.displayName = 'ActiveLandingSetContext'

export function Provider({children}: {children: React.ReactNode}) {
  const [state, setState] = useState<LandingType>(readPendingGroupInvite)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (state?.type === 'groupinvite') {
        window.sessionStorage.setItem(
          PENDING_GROUP_INVITE_KEY,
          JSON.stringify({type: state.type, code: state.code}),
        )
      } else {
        window.sessionStorage.removeItem(PENDING_GROUP_INVITE_KEY)
      }
    } catch {
      // Session storage is never required for normal invite handling.
    }
  }, [state])

  return (
    <stateContext.Provider value={state}>
      <setContext.Provider value={setState}>{children}</setContext.Provider>
    </stateContext.Provider>
  )
}

// Core hooks
export const useActiveLanding = () => useContext(stateContext)
export const useSetActiveLanding = () => useContext(setContext)

// Filtered hooks for convenience
export const useActiveStarterPack = () => {
  const landing = useActiveLanding()
  return landing?.type === 'starterpack' ? landing : undefined
}

export const useSetActiveStarterPack = () => {
  const setLanding = useSetActiveLanding()
  const currentLanding = useActiveLanding()
  return (pack: {uri: string; isClip?: boolean} | undefined) => {
    if (!pack) {
      setLanding(undefined)
    } else {
      if (currentLanding && currentLanding.type !== 'starterpack') {
        logger.debug(
          `[landing] Replacing ${currentLanding.type} landing with starterpack`,
        )
      }
      setLanding({type: 'starterpack', ...pack})
    }
  }
}

export const useActiveGroupChatJoinRequest = () => {
  const landing = useActiveLanding()
  return landing?.type === 'groupchat' ? landing : undefined
}

export const useActiveGroupInvite = () => {
  const landing = useActiveLanding()
  return landing?.type === 'groupinvite' ? landing : undefined
}
