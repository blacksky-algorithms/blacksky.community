import React from 'react'
import EventEmitter from 'eventemitter3'

import {logger} from '#/logger'
import {type Device, device} from '#/storage'

const events = new EventEmitter()
const EVENT = 'geolocation-updated'
const emitGeolocationUpdate = (geolocation: Device['geolocation']) => {
  events.emit(EVENT, geolocation)
}
const onGeolocationUpdate = (
  listener: (geolocation: Device['geolocation']) => void,
) => {
  events.on(EVENT, listener)
  return () => {
    events.off(EVENT, listener)
  }
}

/**
 * Default geolocation value. IF undefined, we fail closed and apply all
 * additional mod authorities.
 */
export const DEFAULT_GEOLOCATION: Device['geolocation'] = {
  countryCode: 'US',
}

/**
 * Local promise used within this file only.
 */
let geolocationResolution: Promise<void> | undefined

/**
 * Begin the process of resolving geolocation. This should be called once at
 * app start.
 *
 * THIS METHOD SHOULD NEVER THROW.
 *
 * This method is otherwise not used for any purpose. To ensure geolocation is
 * resolved, use {@link ensureGeolocationResolved}
 */
export function beginResolveGeolocation() {
  /**
   * In dev, IP server is unavailable, so we just set the default geolocation
   * and fail closed.
   */
  geolocationResolution = new Promise(y => y())
  if (device.get(['geolocation']) == undefined) {
    device.set(['geolocation'], DEFAULT_GEOLOCATION)
  }
}

export function setGeolocation(geolocation: Device['geolocation']) {
  device.set(['geolocation'], geolocation)
  emitGeolocationUpdate(geolocation)
}

/**
 * Ensure that geolocation has been resolved, or at the very least attempted
 * once. Subsequent retries will not be captured by this `await`. Those will be
 * reported via {@link events}.
 */
export async function ensureGeolocationResolved() {
  if (!geolocationResolution) {
    throw new Error(`geolocation: beginResolveGeolocation not called yet`)
  }

  const cached = device.get(['geolocation'])
  if (cached) {
    logger.debug(`geolocation: using cache`, {cached})
  } else {
    logger.debug(`geolocation: no cache`)
    await geolocationResolution
    logger.debug(`geolocation: resolved`, {
      resolved: device.get(['geolocation']),
    })
  }
}

type Context = {
  geolocation: Device['geolocation']
}

const context = React.createContext<Context>({
  geolocation: DEFAULT_GEOLOCATION,
})

export function Provider({children}: {children: React.ReactNode}) {
  const [geolocation, setGeolocation] = React.useState(() => {
    const initial = device.get(['geolocation']) || DEFAULT_GEOLOCATION
    return initial
  })

  React.useEffect(() => {
    return onGeolocationUpdate(geolocation => {
      setGeolocation(geolocation!)
    })
  }, [])

  const ctx = React.useMemo(() => {
    return {
      geolocation,
    }
  }, [geolocation])

  return <context.Provider value={ctx}>{children}</context.Provider>
}

export function useGeolocation() {
  return React.useContext(context)
}
