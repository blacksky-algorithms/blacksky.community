import {type StyleProp, View, type ViewStyle} from 'react-native'
import {type AppBskyEmbedExternal} from '@atproto/api'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {atoms as a, useTheme} from '#/alf'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {parseBlackskyTileUrl} from './TileEmbed/utils'

export {parseBlackskyTileUrl} from './TileEmbed/utils'

export function TileEmbed({
  link,
  onOpen,
  style,
}: {
  link: AppBskyEmbedExternal.ViewExternal
  onOpen?: () => void
  style?: StyleProp<ViewStyle>
}) {
  const {_} = useLingui()
  const t = useTheme()
  const tile = parseBlackskyTileUrl(link.uri)

  if (!tile) return null

  return (
    <Link
      label={link.title || _(msg`Open Blacksky Tile`)}
      to={{screen: 'TilesPrototype', params: tile}}
      style={[a.rounded_md]}
      onPress={() => onOpen?.()}>
      {({hovered}) => (
        <View
          style={[
            a.rounded_md,
            a.overflow_hidden,
            a.border,
            t.atoms.bg,
            style,
            hovered ? t.atoms.border_contrast_high : t.atoms.border_contrast_low,
          ]}>
          <View style={[a.p_md, {gap: 6, backgroundColor: '#fff0eb'}]}>
            <Text style={[a.text_xs, a.font_bold, {color: '#b62e1d'}]}>
              BLACKSKY TILE · EXPERIMENTAL
            </Text>
            <Text emoji style={[a.text_lg, a.font_bold]}>
              {link.title || _(msg`Interactive app`)}
            </Text>
            <Text emoji style={[a.text_sm, a.leading_snug]} numberOfLines={3}>
              {link.description ||
                _(msg`Open this post attachment to run it in an isolated sandbox.`)}
            </Text>
          </View>
          <View style={[a.px_md, a.py_sm]}>
            <Text style={[a.text_sm, a.font_semi_bold]}>
              {_(msg`Open app`)}
            </Text>
          </View>
        </View>
      )}
    </Link>
  )
}
