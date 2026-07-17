# Web Tiles / Uno prototype

This is a web-only proof of concept for running an untrusted, published Web
Tile inside a Blacksky post. The Tile is an Uno demo; the multiplayer mode uses
a deliberately small, local authoritative relay.

## Try the current demo

Start the services below, then open the published multiplayer post:

```text
http://localhost:19006/profile/testandroid.myatproto.social/post/3mqubngzs4q25
```

Choose **Play in post**. Open the same post in a second tab and join the same
room code (`uno-demo` by default). The tile record and post are public AT
Protocol records:

```text
Tile: at://did:plc:4pqg7u4ji2doj7i444n6mhrd/ing.dasl.masl/3mqubmzdyea25
Post: at://did:plc:4pqg7u4ji2doj7i444n6mhrd/app.bsky.feed.post/3mqubngzs4q25
```

## Local setup

From this feature worktree:

```sh
# 1. Install and trust a local certificate authority once.
brew install mkcert
mkcert -install

# 2. Create a certificate covering the loader and its random Tile subdomains.
mkcert -cert-file /private/tmp/tiles.localhost.pem \
  -key-file /private/tmp/tiles.localhost-key.pem \
  load.tiles.localhost '*.tiles.localhost'

# 3. Run DASL's HTTP loading server.
pnpm exec tiles-loading-server tiles.localhost 1503

# 4. In another terminal, serve HTTPS on port 443 and proxy to the loader.
# Port 443 requires elevation on macOS.
sudo pnpm tiles:https-proxy

# 5. Run the local game relay.
pnpm tiles:game-relay

# 6. Run Blacksky, pointing it at the trusted local loader and relay.
EXPO_PUBLIC_TILES_LOAD_DOMAIN=load.tiles.localhost \
EXPO_PUBLIC_TILES_GAME_RELAY_URL=ws://localhost:19012 \
pnpm web --port 19006
```

The HTTPS proxy is required because the loader uses a service worker, which
requires a secure origin. `*.localhost` resolves locally without DNS, but it
does not make a certificate trusted; if the browser still reports an invalid
certificate, install mkcert's root CA in the macOS System keychain and mark it
as trusted:

```sh
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain \
  "$(mkcert -CAROOT)/rootCA.pem"
```

`ngrok` is optional for a remotely reachable demo. A wildcard endpoint is
required because DASL redirects each Tile to a fresh subdomain. The local
`*.tiles.localhost` setup is preferred for development.

## What happens when a post contains a Tile

```text
post external URL
  https://blacksky.community/tiles/<DID>/<rkey>
        │
        ▼
Blacksky web embed validates that exact Blacksky-owned URL shape
        │
        ▼
TileMothership + ATTileLoader fetch the ing.dasl.masl record from the PDS
        │
        ▼
load.tiles.localhost redirects to a fresh *.tiles.localhost sandbox origin
        │
        ▼
DASL shuttle + service worker serve the content-addressed Tile bundle
inside a constrained iframe in the feed card
```

The post itself uses the normal `app.bsky.embed.external` record type. The
special behavior is entirely client-side: only the strict Blacksky Tile URL is
recognized. Arbitrary external links never become executable embeds.

The feed initially shows an inert card. Selecting **Play in post** mounts the
iframe inside a width-constrained post container. On native platforms the card
opens the explanatory route instead; this prototype does not run untrusted
Tiles in a React Native WebView.

## Multiplayer message path

```text
Uno Tile iframe
  ── tiles-protocol-up-game ──► DASL shuttle ──► Blacksky web host
                                                        │
                                                        ▼
                                             ws://localhost:19012 relay
                                                        │
Uno Tile iframe ◄─ DASL shuttle ◄─ Blacksky web host ◄─┘
  ◄─ tiles-protocol-down-game ── private state for this player
```

The Tile has no direct WebSocket access. It can ask only to `join` a room or
`play` a card. The host checks that messages come from the expected shuttle
iframe before forwarding them. The relay owns the room, turn, top card, and
each private hand; it sends each browser only its own hand. The Tile rerenders
the pile's number and color from the relay's `state` message.

Relevant implementation files:

- `src/components/Post/Embed/TileEmbed.web.tsx` — feed card, Tile host, bridge
- `src/screens/TilesPrototype/index.web.tsx` — full-screen development route
- `scripts/tiles-game-relay.mjs` — in-memory two-player relay
- `src/features/tiles/unoMultiplayerTile.ts` — reproducible published Tile HTML

## Prototype limits

This is intentionally not production multiplayer. The relay has no durable
storage, authentication, invite flow, reconnect handling, rate limits, or
account-to-player binding. A production service should use a secure `wss://`
endpoint, explicit player/session authorization, persisted game state, and a
narrow reviewed game capability—not Blacksky session tokens or unrestricted
`postMessage` access for Tiles.
