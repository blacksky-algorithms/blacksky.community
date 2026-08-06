import {View} from 'react-native'
import {useLingui} from '@lingui/react/macro'

import {useCommunityPostTargets} from '#/state/queries/community-post-targets'
import {
  type ComposerAction,
  type ThreadDraft,
} from '#/view/com/composer/state/composer'
import {atoms as a} from '#/alf'
import * as Select from '#/components/Select'

export function PostTargetSelect({
  thread,
  dispatch,
  isCommunityMember,
  homeAppviewOutage,
  setBlackskyOnlyDefault,
}: {
  thread: ThreadDraft
  dispatch: (action: ComposerAction) => void
  isCommunityMember: boolean
  homeAppviewOutage: boolean
  setBlackskyOnlyDefault: (value: boolean) => void
}) {
  const {t} = useLingui()
  const {data: targets = []} = useCommunityPostTargets()
  const options = [
    {value: 'public', label: t`Public`},
    ...(isCommunityMember
      ? [
          {
            value: 'blacksky',
            label: homeAppviewOutage
              ? t`Blacksky Only (temporarily unavailable)`
              : t`Blacksky Only`,
          },
        ]
      : []),
    ...targets.map(target => ({
      value: target.feed,
      label: target.name,
      target,
    })),
  ]
  const value =
    thread.communityFeed?.feed ??
    thread.communityFeedUri ??
    (thread.blackskyOnly ? 'blacksky' : 'public')
  const selected = options.find(option => option.value === value)

  return (
    <View style={{minWidth: 180}}>
      <Select.Root
        value={value}
        onValueChange={next => {
          if (next === 'blacksky') {
            if (homeAppviewOutage) return
            dispatch({type: 'set_post_target', target: 'blacksky'})
            setBlackskyOnlyDefault(true)
            return
          }
          setBlackskyOnlyDefault(false)
          if (next === 'public') {
            dispatch({type: 'set_post_target', target: 'public'})
            return
          }
          const target = targets.find(candidate => candidate.feed === next)
          if (target) dispatch({type: 'set_post_target', target})
        }}>
        <Select.Trigger label={t`Choose where to post`}>
          <Select.ValueText
            placeholder={t`Public`}
            webOverrideValue={selected}
          />
          <Select.Icon />
        </Select.Trigger>
        <Select.Content
          label={t`Choose where to post`}
          items={options}
          renderItem={option => (
            <Select.Item
              key={option.value}
              value={option.value}
              label={option.label}>
              <Select.ItemIndicator />
              <Select.ItemText style={[a.flex_1]}>
                {option.label}
              </Select.ItemText>
            </Select.Item>
          )}
        />
      </Select.Root>
    </View>
  )
}
