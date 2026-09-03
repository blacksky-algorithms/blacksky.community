import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {type CommunityTimelineSort} from '#/state/queries/community-feed'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {ChevronBottom_Stroke2_Corner0_Rounded as ChevronDownIcon} from '#/components/icons/Chevron'
import {Clock_Stroke2_Corner0_Rounded as ClockIcon} from '#/components/icons/Clock'
import {Flame_Stroke2_Corner1_Rounded as FlameIcon} from '#/components/icons/Flame'
import * as Menu from '#/components/Menu'

export function CommunityFeedSortMenu({
  sort,
  onChange,
}: {
  sort: CommunityTimelineSort
  onChange: (sort: CommunityTimelineSort) => void
}) {
  const {_} = useLingui()
  const isHot = sort === 'hot'
  const currentLabel = isHot ? _(msg`Hot`) : _(msg`Recent`)

  return (
    <Menu.Root>
      <Menu.Trigger
        label={_(msg`Sort community feed (currently: ${currentLabel})`)}>
        {({props}) => (
          <Button
            {...props}
            testID="communityFeedSortButton"
            label={props.accessibilityLabel}
            size="small"
            variant="outline"
            color="secondary">
            <ButtonIcon icon={isHot ? FlameIcon : ClockIcon} />
            <ButtonText>{currentLabel}</ButtonText>
            <ButtonIcon icon={ChevronDownIcon} />
          </Button>
        )}
      </Menu.Trigger>
      <Menu.Outer>
        <Menu.LabelText>
          <Trans>Sort by</Trans>
        </Menu.LabelText>
        <Menu.Group>
          <Menu.Item label={_(msg`Recent`)} onPress={() => onChange('recent')}>
            <Menu.ItemIcon icon={ClockIcon} />
            <Menu.ItemText>
              <Trans>Recent</Trans>
            </Menu.ItemText>
            <Menu.ItemRadio selected={!isHot} />
          </Menu.Item>
          <Menu.Item label={_(msg`Hot`)} onPress={() => onChange('hot')}>
            <Menu.ItemIcon icon={FlameIcon} />
            <Menu.ItemText>
              <Trans>Hot</Trans>
            </Menu.ItemText>
            <Menu.ItemRadio selected={isHot} />
          </Menu.Item>
        </Menu.Group>
      </Menu.Outer>
    </Menu.Root>
  )
}
