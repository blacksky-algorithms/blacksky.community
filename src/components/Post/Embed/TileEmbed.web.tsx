import {useEffect, useRef, useState} from 'react'
import {Pressable, type StyleProp, View, type ViewStyle} from 'react-native'
import {type AppBskyEmbedExternal} from '@atproto/api'
import {TileMothership} from '@dasl/tile-loader'
import {ATTileLoader} from '@dasl/tile-loader/at'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'
import {parseBlackskyTileUrl,type TileRef} from './TileEmbed/utils'

export {parseBlackskyTileUrl} from './TileEmbed/utils'

/**
 * Web feed embeds remain inert until an explicit press. Once opened, the Tile
 * still executes in DASL's separate origin rather than in the feed document.
 */
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
  const [opened, setOpened] = useState(false)
  const tile = parseBlackskyTileUrl(link.uri)

  if (!tile) return null

  if (opened) {
    return (
      <View style={[a.rounded_md, a.overflow_hidden, a.border, t.atoms.bg, style]}>
        <View style={[a.flex_row, a.justify_between, a.align_center, a.px_md, a.py_sm]}>
          <Text style={[a.text_sm, a.font_semi_bold]}>{link.title || _(msg`Interactive app`)}</Text>
          <Pressable
            accessibilityLabel={_(msg`Hide interactive app`)}
            accessibilityHint={_(msg`Closes this interactive app in the post.`)}
            onPress={() => setOpened(false)}>
            <Text style={[a.text_sm]}>{_(msg`Close`)}</Text>
          </Pressable>
        </View>
        <InlineTileRuntime tile={tile} />
      </View>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={link.title || _(msg`Open Blacksky Tile`)}
      accessibilityHint={_(msg`Runs this interactive app in an isolated sandbox.`)}
      style={[a.rounded_md]}
      onPress={() => {
        onOpen?.()
        setOpened(true)
      }}>
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
          <TileCardCopy link={link} />
        </View>
      )}
    </Pressable>
  )
}

function InlineTileRuntime({tile}: {tile: TileRef}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const shuttleRef = useRef<HTMLIFrameElement | null>(null)
  const [error, setError] = useState<string>()
  const loadDomain = process.env.EXPO_PUBLIC_TILES_LOAD_DOMAIN
  const relayUrl = process.env.EXPO_PUBLIC_TILES_GAME_RELAY_URL || 'ws://localhost:19012'

  useEffect(() => {
    if (!loadDomain || !mountRef.current) return

    const mothership = new TileMothership({loadDomain})
    mothership.init()
    mothership.addLoader(new ATTileLoader())

    void mothership
      .loadTile(`at://${tile.repo}/ing.dasl.masl/${tile.rkey}`)
      .then(loaded => {
        if (!loaded) throw new Error('The Tile could not be loaded.')
        const shuttle = loaded.renderContent(loaded.manifest.sizing?.height || 560)
        shuttleRef.current = shuttle
        mountRef.current?.replaceChildren(shuttle)
      })
      .catch(cause =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      )
  }, [loadDomain, tile.repo, tile.rkey])

  useEffect(() => {
    const relay = new WebSocket(relayUrl)
    const onRelayMessage = (event: MessageEvent<string>) => {
      shuttleRef.current?.contentWindow?.postMessage(
        {action: 'tiles-protocol-down-game', payload: JSON.parse(event.data)},
        '*',
      )
    }
    const onTileMessage = (event: MessageEvent) => {
      if (event.source !== shuttleRef.current?.contentWindow) return
      if (!isGameBridgeMessage(event.data)) return
      if (relay.readyState === WebSocket.OPEN) {
        relay.send(JSON.stringify(event.data.payload))
      }
    }
    relay.addEventListener('message', onRelayMessage)
    window.addEventListener('message', onTileMessage)
    return () => {
      relay.close()
      relay.removeEventListener('message', onRelayMessage)
      window.removeEventListener('message', onTileMessage)
    }
  }, [relayUrl])

  if (!loadDomain) {
    return <TileRuntimeNotice text="The local Tiles loading domain is not configured." />
  }
  if (error) return <TileRuntimeNotice text={`Tile loading failed: ${error}`} />

  // The Tile renderer creates a 100%-wide iframe. Explicitly establish a
  // shrinkable web layout context here so it stays within a post column rather
  // than taking the width of a standalone Tiles route.
  return (
    <div
      style={{
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        overflow: 'hidden',
      }}>
      <div ref={mountRef} style={{width: '100%', minWidth: 0, maxWidth: '100%'}} />
    </div>
  )
}

function isGameBridgeMessage(
  value: unknown,
): value is {action: 'tiles-protocol-up-game'; payload: unknown} {
  if (typeof value !== 'object' || value === null) return false
  const data = value as Record<string, unknown>
  return data.action === 'tiles-protocol-up-game' && 'payload' in data
}

function TileRuntimeNotice({text}: {text: string}) {
  return <View style={[a.p_md]}><Text>{text}</Text></View>
}

function TileCardCopy({link}: {link: AppBskyEmbedExternal.ViewExternal}) {
  const {_} = useLingui()
  return (
    <>
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
        <Text style={[a.text_sm, a.font_semi_bold]}>{_(msg`Play in post`)}</Text>
      </View>
    </>
  )
}
