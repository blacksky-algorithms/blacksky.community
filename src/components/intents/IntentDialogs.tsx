import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {usePrefetchGroupInvitePreview} from '#/state/queries/group-invites'
import {usePrefetchJoinLinkPreviews} from '#/state/queries/join-links'
import {useSession} from '#/state/session'
import {
  useActiveGroupChatJoinRequest,
  useActiveGroupInvite,
  useSetActiveLanding,
} from '#/state/shell/landing'
import * as Dialog from '#/components/Dialog'
import {type DialogControlProps} from '#/components/Dialog'
import {GroupChatJoinDialog} from '#/components/intents/GroupChatJoinDialog'
import {GroupInviteDialog} from '#/components/intents/GroupInviteDialog'
import {VerifyEmailIntentDialog} from '#/components/intents/VerifyEmailIntentDialog'

interface Context {
  verifyEmailDialogControl: DialogControlProps
  verifyEmailState: {code: string} | undefined
  setVerifyEmailState: (state: {code: string} | undefined) => void
  groupChatJoinDialogControl: DialogControlProps
  groupChatJoinState: {code: string} | undefined
  setGroupChatJoinState: (state: {code: string} | undefined) => void
  groupInviteDialogControl: DialogControlProps
  groupInviteState: {code: string} | undefined
  setGroupInviteState: (state: {code: string} | undefined) => void
}

const Context = createContext({} as Context)
Context.displayName = 'IntentDialogsContext'
export const useIntentDialogs = () => useContext(Context)

export function Provider({children}: {children: React.ReactNode}) {
  const verifyEmailDialogControl = Dialog.useDialogControl()
  const [verifyEmailState, setVerifyEmailState] = useState<
    {code: string} | undefined
  >()
  const groupChatJoinDialogControl = Dialog.useDialogControl()
  const [groupChatJoinState, setGroupChatJoinState] = useState<
    {code: string} | undefined
  >()
  const groupInviteDialogControl = Dialog.useDialogControl()
  const [groupInviteState, setGroupInviteState] = useState<
    {code: string} | undefined
  >()

  const {hasSession} = useSession()
  const groupChatLanding = useActiveGroupChatJoinRequest()
  const groupInviteLanding = useActiveGroupInvite()
  const setActiveLanding = useSetActiveLanding()
  const prefetchJoinLinkPreviews = usePrefetchJoinLinkPreviews()
  const prefetchGroupInvitePreview = usePrefetchGroupInvitePreview()
  const landingHandledRef = useRef(false)
  const groupInviteLandingHandledRef = useRef(false)

  useEffect(() => {
    if (hasSession && groupChatLanding && !landingHandledRef.current) {
      landingHandledRef.current = true
      const code = groupChatLanding.code
      setActiveLanding(undefined)
      const prefetch = prefetchJoinLinkPreviews({
        codes: [code],
        hasSession: true,
      })
      void Promise.race([
        prefetch,
        new Promise(res => setTimeout(res, 200)),
      ]).finally(() => {
        setGroupChatJoinState({code})
        groupChatJoinDialogControl.open()
      })
    }
    if (!groupChatLanding) {
      landingHandledRef.current = false
    }
    if (
      hasSession &&
      groupInviteLanding &&
      !groupInviteLandingHandledRef.current
    ) {
      groupInviteLandingHandledRef.current = true
      const code = groupInviteLanding.code
      setActiveLanding(undefined)
      const prefetch = prefetchGroupInvitePreview(code)
      void Promise.race([
        prefetch,
        new Promise(res => setTimeout(res, 200)),
      ]).finally(() => {
        setGroupInviteState({code})
        groupInviteDialogControl.open()
      })
    }
    if (!groupInviteLanding) {
      groupInviteLandingHandledRef.current = false
    }
  }, [
    hasSession,
    groupChatLanding,
    setActiveLanding,
    setGroupChatJoinState,
    prefetchJoinLinkPreviews,
    groupChatJoinDialogControl,
    groupInviteLanding,
    prefetchGroupInvitePreview,
    groupInviteDialogControl,
    setGroupInviteState,
  ])

  const value = useMemo(
    () => ({
      verifyEmailDialogControl,
      verifyEmailState,
      setVerifyEmailState,
      groupChatJoinDialogControl,
      groupChatJoinState,
      setGroupChatJoinState,
      groupInviteDialogControl,
      groupInviteState,
      setGroupInviteState,
    }),
    [
      verifyEmailDialogControl,
      verifyEmailState,
      setVerifyEmailState,
      groupChatJoinDialogControl,
      groupChatJoinState,
      setGroupChatJoinState,
      groupInviteDialogControl,
      groupInviteState,
      setGroupInviteState,
    ],
  )

  return (
    <Context.Provider value={value}>
      {children}
      <VerifyEmailIntentDialog />
      <GroupChatJoinDialog />
      <GroupInviteDialog />
    </Context.Provider>
  )
}
