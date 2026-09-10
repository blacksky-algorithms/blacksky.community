/**
 * A kind of companion API to ./feed.ts. See that file for more info.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {AppState} from 'react-native'
import {useQueryClient} from '@tanstack/react-query'
import {EventEmitter} from 'eventemitter3'

import {getUnreadCount} from '#/lib/api/community-notifications'
import BroadcastChannel from '#/lib/broadcast'
import {HOME_APPVIEW_PINNED_OPTS} from '#/lib/constants'
import {resetBadgeCount} from '#/lib/notifications/notifications'
import {logger as notyLogger} from '#/lib/notifications/util'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {truncateAndInvalidate} from '#/state/queries/util'
import {useAgent, useSession} from '#/state/session'
import {RQKEY as RQKEY_NOTIFS} from './feed'
import {type CachedFeedPage, type FeedPage} from './types'
import {fetchPage} from './util'

const UPDATE_INTERVAL = 30 * 1e3 // 30sec

const broadcast = new BroadcastChannel('NOTIFS_BROADCAST_CHANNEL')

const emitter = new EventEmitter()

type StateContext = string

interface ApiContext {
  markAllRead: () => Promise<void>
  checkUnread: (opts?: {
    invalidate?: boolean
    isPoll?: boolean
  }) => Promise<void>
  getCachedUnreadPage: () => FeedPage | undefined
}

const stateContext = createContext<StateContext>('')
stateContext.displayName = 'NotificationsUnreadStateContext'

const apiContext = createContext<ApiContext>({
  async markAllRead() {},
  async checkUnread() {},
  getCachedUnreadPage: () => undefined,
})
apiContext.displayName = 'NotificationsUnreadApiContext'

export function Provider({children}: React.PropsWithChildren<{}>) {
  const {hasSession} = useSession()
  const agent = useAgent()
  const queryClient = useQueryClient()
  const moderationOpts = useModerationOpts()

  const [numUnread, setNumUnread] = useState('')

  const checkUnreadRef = useRef<ApiContext['checkUnread'] | null>(null)
  const refreshGenerationRef = useRef(0)
  const cacheRef = useRef<CachedFeedPage>({
    usableInFeed: false,
    syncedAt: new Date(),
    data: undefined,
    unreadCount: 0,
  })

  useEffect(() => {
    function markAsUnusable() {
      if (cacheRef.current) {
        cacheRef.current.usableInFeed = false
      }
    }
    emitter.addListener('invalidate', markAsUnusable)
    return () => {
      emitter.removeListener('invalidate', markAsUnusable)
    }
  }, [])

  // periodic sync
  useEffect(() => {
    if (!hasSession || !checkUnreadRef.current) {
      return
    }
    void checkUnreadRef.current().catch(onUnreadCheckError) // fire on init
    const interval = setInterval(() => {
      void checkUnreadRef.current?.({isPoll: true}).catch(onUnreadCheckError)
    }, UPDATE_INTERVAL)
    return () => clearInterval(interval)
  }, [hasSession])

  // listen for broadcasts
  useEffect(() => {
    const listener = ({data}: MessageEvent) => {
      refreshGenerationRef.current += 1
      cacheRef.current = {
        usableInFeed: false,
        syncedAt: new Date(),
        data: undefined,
        unreadCount:
          data.event === '30+'
            ? 30
            : data.event === ''
              ? 0
              : parseInt(data.event, 10) || 1,
      }
      setNumUnread(data.event)
    }
    broadcast.addEventListener('message', listener)
    return () => {
      broadcast.removeEventListener('message', listener)
    }
  }, [setNumUnread])

  const isFetchingRef = useRef(false)

  // create API
  const api = useMemo<ApiContext>(() => {
    return {
      async markAllRead() {
        refreshGenerationRef.current += 1
        const seenAt = cacheRef.current.syncedAt

        // update server
        await agent.app.bsky.notification.updateSeen(
          {seenAt: seenAt.toISOString()},
          HOME_APPVIEW_PINNED_OPTS,
        )

        // update & broadcast
        cacheRef.current = {
          ...cacheRef.current,
          usableInFeed: false,
          syncedAt: seenAt,
          unreadCount: 0,
        }
        setNumUnread('')
        broadcast.postMessage({event: ''})
        resetBadgeCount()
      },

      async checkUnread({
        invalidate,
        isPoll,
      }: {invalidate?: boolean; isPoll?: boolean} = {}) {
        try {
          if (!agent.session) return
          if (AppState.currentState !== 'active') {
            return
          }

          // reduce polling if unread count is set
          if (isPoll && cacheRef.current?.unreadCount !== 0) {
            // if hit 30+ then don't poll, otherwise reduce polling by 50%
            if (cacheRef.current?.unreadCount >= 30 || Math.random() >= 0.5) {
              return
            }
          }

          if (isFetchingRef.current) {
            return
          }
          // Do not move this without ensuring it gets a symmetrical reset in the finally block.
          isFetchingRef.current = true
          const generation = ++refreshGenerationRef.current

          let nextCache: CachedFeedPage
          if (invalidate) {
            const [{count}, {page, indexedAt: lastIndexed}] = await Promise.all(
              [
                getUnreadCount(agent),
                fetchPage({
                  agent,
                  cursor: undefined,
                  limit: 40,
                  queryClient,
                  moderationOpts,
                  hideFollowNotifications: undefined,
                  reasons: [],
                  fetchAdditionalData: true,
                }),
              ],
            )
            const now = new Date()
            const lastIndexedDate = lastIndexed
              ? new Date(lastIndexed)
              : undefined
            nextCache = {
              usableInFeed: true,
              data: page,
              syncedAt:
                !lastIndexedDate || now > lastIndexedDate
                  ? now
                  : lastIndexedDate,
              unreadCount: count,
            }
          } else {
            const {count} = await getUnreadCount(agent)
            nextCache = {
              ...cacheRef.current,
              usableInFeed: false,
              syncedAt: new Date(),
              unreadCount: count,
            }
          }

          if (generation !== refreshGenerationRef.current) {
            return
          }

          const unreadCount = nextCache.unreadCount
          const unreadCountStr =
            unreadCount >= 30
              ? '30+'
              : unreadCount === 0
                ? ''
                : String(unreadCount)

          cacheRef.current = nextCache

          // update & broadcast
          setNumUnread(unreadCountStr)
          if (invalidate) {
            truncateAndInvalidate(queryClient, RQKEY_NOTIFS('all'))
            truncateAndInvalidate(queryClient, RQKEY_NOTIFS('mentions'))
          }
          broadcast.postMessage({event: unreadCountStr})
        } finally {
          isFetchingRef.current = false
        }
      },

      getCachedUnreadPage() {
        // return cached page if it's marked as fresh enough
        if (cacheRef.current.usableInFeed) {
          return cacheRef.current.data
        }
      },
    }
  }, [setNumUnread, queryClient, moderationOpts, agent])
  checkUnreadRef.current = api.checkUnread

  return (
    <stateContext.Provider value={numUnread}>
      <apiContext.Provider value={api}>{children}</apiContext.Provider>
    </stateContext.Provider>
  )
}

function onUnreadCheckError(error: unknown) {
  notyLogger.warn('Unread notification check failed', {
    message: error instanceof Error ? error.message : String(error),
  })
}

export function useUnreadNotifications() {
  return useContext(stateContext)
}

export function useUnreadNotificationsApi() {
  return useContext(apiContext)
}

export function invalidateCachedUnreadPage() {
  emitter.emit('invalidate')
}
