import {useEffect, useRef, useState} from 'react'
import {Text, View} from 'react-native'
import {TileMothership} from '@dasl/tile-loader'
import {ATTileLoader} from '@dasl/tile-loader/at'
import {MemoryTileLoader} from '@dasl/tile-loader/memory'
import {type RouteProp, useRoute} from '@react-navigation/native'

import {type CommonNavigatorParams} from '#/lib/routes/types'
import {UNO_DEMO_TILE_ID, unoDemoTile} from '#/features/tiles/unoDemoTile'

/**
 * Browser-only proof of integration. `loadDomain` must point at an operator
 * deployed `@dasl/tile-server` domain with wildcard subdomains; it is not a
 * Tile-controlled URL.
 */
export function TilesPrototypeScreen() {
  const mountRef = useRef<HTMLDivElement>(null)
  const shuttleRef = useRef<HTMLIFrameElement | null>(null)
  const [error, setError] = useState<string>()
  const route = useRoute<RouteProp<CommonNavigatorParams, 'TilesPrototype'>>()
  const loadDomain = process.env.EXPO_PUBLIC_TILES_LOAD_DOMAIN
  const relayUrl = process.env.EXPO_PUBLIC_TILES_GAME_RELAY_URL || 'ws://localhost:19012'
  const tileUrl =
    route.params?.repo && route.params.rkey
      ? `at://${route.params.repo}/ing.dasl.masl/${route.params.rkey}`
      : `memory://${UNO_DEMO_TILE_ID}`

  useEffect(() => {
    if (!loadDomain || !mountRef.current) return

    const mothership = new TileMothership({loadDomain})
    const memory = new MemoryTileLoader()
    memory.addTile(UNO_DEMO_TILE_ID, unoDemoTile)
    mothership.init()
    mothership.addLoader(memory)
    mothership.addLoader(new ATTileLoader())

    void mothership
      .loadTile(tileUrl)
      .then(tile => {
        if (!tile) throw new Error('The demo Tile could not be loaded.')
        const shuttle = tile.renderContent(560)
        shuttleRef.current = shuttle
        mountRef.current?.replaceChildren(shuttle)
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : String(cause)))
  }, [loadDomain, tileUrl])

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
    return (
      <Notice text="Set EXPO_PUBLIC_TILES_LOAD_DOMAIN to Blacksky’s trusted Tiles loading domain before opening this prototype." />
    )
  }
  if (error) return <Notice text={`Tile loading failed: ${error}`} />

  return (
    <View style={{flex: 1, backgroundColor: '#fff7ed'}}>
      <div ref={mountRef} />
    </View>
  )
}

function Notice({text}: {text: string}) {
  return (
    <View style={{padding: 24}}>
      <Text>{text}</Text>
    </View>
  )
}

function isGameBridgeMessage(
  value: unknown,
): value is {action: 'tiles-protocol-up-game'; payload: unknown} {
  if (typeof value !== 'object' || value === null) return false
  const data = value as Record<string, unknown>
  return data.action === 'tiles-protocol-up-game' && 'payload' in data
}
