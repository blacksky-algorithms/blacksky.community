import {useEffect} from 'react'
import {View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'

import {
  groupInviteErrorCopy,
  shouldTrackGroupInviteOpened,
} from '#/lib/api/group-invite-ui'
import {useGroupInvitePreviewQuery} from '#/state/queries/group-invites'
import {useActiveGroupInvite} from '#/state/shell/landing'
import {LoggedOutScreenState} from '#/view/com/auth/LoggedOut'
import {Logo} from '#/view/icons/Logo'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'

export function GroupInviteLanding({
  setScreenState,
}: {
  setScreenState: (state: LoggedOutScreenState) => void
}) {
  const {t: l} = useLingui()
  const ax = useAnalytics()
  const t = useTheme()
  const landing = useActiveGroupInvite()
  const {data, error, isPending, refetch} = useGroupInvitePreviewQuery(
    landing?.code,
  )

  useEffect(() => {
    if (landing?.code && shouldTrackGroupInviteOpened(landing.code)) {
      ax.metric('groupInvite:opened', {hasSession: false})
    }
  }, [ax, landing?.code])

  return (
    <View
      testID="groupInviteLanding"
      style={[
        a.util_screen_outer,
        a.align_center,
        a.justify_center,
        t.atoms.bg,
      ]}>
      <View style={[a.gap_lg, a.p_2xl, a.w_full, {maxWidth: 420}]}>
        <Logo width={136} fill={t.palette.primary_500} />
        {isPending ? (
          <Loader size="xl" />
        ) : error ? (
          <View style={[a.gap_md]}>
            <Text style={[a.text_center]}>{groupInviteErrorCopy(error)}</Text>
            <Button
              testID="groupInviteLandingRetry"
              label={l`Try again`}
              color="secondary"
              size="large"
              onPress={() => void refetch()}>
              <ButtonText>
                <Trans>Try again</Trans>
              </ButtonText>
            </Button>
          </View>
        ) : data ? (
          <>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              <Trans>Group invite</Trans>
            </Text>
            <Text style={[a.text_3xl, a.font_bold, a.text_center]}>
              {data.group.displayName}
            </Text>
            <Text style={[a.text_center, t.atoms.text_contrast_medium]}>
              {data.community.name}
            </Text>
          </>
        ) : null}
        <View style={[a.gap_md]}>
          <Button
            testID="groupInviteLandingSignIn"
            label={l`Sign in`}
            color="primary"
            size="large"
            onPress={() => {
              ax.metric('groupInvite:signInRequested', {})
              setScreenState(LoggedOutScreenState.S_Login)
            }}>
            <ButtonText>
              <Trans>Sign in to join</Trans>
            </ButtonText>
          </Button>
          <Button
            testID="groupInviteLandingCreateAccount"
            label={l`Create account`}
            color="secondary"
            size="large"
            onPress={() =>
              setScreenState(LoggedOutScreenState.S_CreateAccount)
            }>
            <ButtonText>
              <Trans>Create account</Trans>
            </ButtonText>
          </Button>
        </View>
      </View>
    </View>
  )
}
