import {useEffect, useState} from 'react'
import {Pressable, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {Logo as BlackskyLogo} from '#/view/icons/Logo'
import {atoms as a, useTheme} from '#/alf'
import {ChevronBottom_Stroke2_Corner0_Rounded as ChevronDown} from '#/components/icons/Chevron'
import {Group3_Stroke2_Corner0_Rounded as GroupIcon} from '#/components/icons/Group'
import * as Tooltip from '#/components/Tooltip'
import {Text} from '#/components/Typography'

const COMMUNITY_POST_COLLECTION = 'community.blacksky.feed.post'

export function isCommunityPostUri(uri: string | undefined): boolean {
  return !!uri && uri.includes(COMMUNITY_POST_COLLECTION)
}

export function CommunityOnlyBadge({communityFeed}: {communityFeed?: string}) {
  const t = useTheme()
  const {_} = useLingui()
  const [visible, setVisible] = useState(false)
  const isTenant = !!communityFeed
  const label = isTenant
    ? _(msg`Community-only post`)
    : _(msg`Blacksky-only post`)
  const hint = isTenant
    ? _(msg`Only visible to members of this community`)
    : _(msg`Only visible to members of the Blacksky community`)

  useEffect(() => {
    return () => setVisible(false)
  }, [])

  return (
    <Tooltip.Outer
      visible={visible}
      onVisibleChange={setVisible}
      position="bottom">
      <Tooltip.Target>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={hint}
          onPress={() => setVisible(v => !v)}
          style={[
            a.flex_row,
            a.align_center,
            a.gap_xs,
            a.px_sm,
            a.py_2xs,
            a.rounded_full,
            {backgroundColor: t.palette.primary_500},
          ]}>
          {isTenant ? (
            <GroupIcon width={14} fill="#FFFFFF" />
          ) : (
            <BlackskyLogo width={14} fill="#FFFFFF" />
          )}
          <ChevronDown width={10} fill="#FFFFFF" />
        </Pressable>
      </Tooltip.Target>
      <Tooltip.Content label={label}>
        <View style={[a.gap_xs, {maxWidth: 260}]}>
          <Text style={[a.font_bold]}>
            {isTenant ? (
              <Trans>Community Only</Trans>
            ) : (
              <Trans>Blacksky Only</Trans>
            )}
          </Text>
          <Text style={[t.atoms.text_contrast_high]}>
            {isTenant ? (
              <Trans>
                This post is only visible to members of its community.
              </Trans>
            ) : (
              <Trans>
                This post is only visible to members of the Blacksky community.
              </Trans>
            )}
          </Text>
        </View>
      </Tooltip.Content>
    </Tooltip.Outer>
  )
}
