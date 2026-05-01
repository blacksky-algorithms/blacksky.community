import React, {useCallback, useEffect, useRef, useState} from 'react'
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import Animated, {
  measure,
  runOnJS,
  useAnimatedRef,
  useFrameCallback,
} from 'react-native-reanimated'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {Image} from 'expo-image'
import {type AppBskyEmbedExternal} from '@atproto/api'
import {useNavigation} from '@react-navigation/native'
import Hls from 'hls.js'

import {type EmbedPlayerParams} from '#/lib/strings/embed-player'
import {useAgent, useSession} from '#/state/session'
import {EventStopper} from '#/view/com/util/EventStopper'
import {Logo as BlackskyLogo} from '#/view/icons/Logo'
import {useTheme} from '#/alf'
import {Text} from '#/components/Typography'
import {IS_NATIVE} from '#/env'

const streamplaceLogo = require('../../../../../assets/streamplace-logo.png')

const STREAMPLACE_BASE = 'https://stream.place'
const APPVIEW_BASE = 'https://api.blacksky.community'

function getHlsUrl(handle: string): string {
  return `${STREAMPLACE_BASE}/api/playback/${handle}/hls/index.m3u8?rendition=source`
}

function getThumbnailUrl(handle: string): string {
  return `${STREAMPLACE_BASE}/xrpc/place.stream.live.getProfileCard?id=${encodeURIComponent(handle)}`
}

interface StreamStatus {
  did: string
  handle: string
  live: boolean
  viewerCount?: number
  title?: string
  license?: string
  startedAt?: string
}

interface ChatMessage {
  uri: string
  author: {did: string; handle: string; displayName?: string; avatar?: string}
  text: string
  createdAt: string
}

function useStreamStatus(handle: string) {
  const [status, setStatus] = useState<StreamStatus | null>(null)

  // Fetch status from appview
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const did = await resolveHandle(handle)
        if (cancelled) return
        const res = await fetch(
          `${APPVIEW_BASE}/xrpc/community.blacksky.stream.getStreamStatus?streamer=${did}`,
        )
        if (!cancelled && res.ok) {
          setStatus(await res.json())
        }
      } catch {}
    }
    check()
    const interval = setInterval(check, 30000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [handle])

  // Get live viewer count + content rights from Streamplace WebSocket
  useEffect(() => {
    let ws: WebSocket | null = null
    try {
      ws = new WebSocket(`wss://stream.place/api/websocket/${handle}`)
      ws.onmessage = (evt: MessageEvent) => {
        try {
          const msg = JSON.parse(evt.data)
          const t = msg.$type || ''
          if (t.includes('viewerCount') || t.includes('ViewerCount')) {
            setStatus(prev => (prev ? {...prev, viewerCount: msg.count} : prev))
          }
          if (t.includes('segment') && msg.contentRights?.license) {
            setStatus(prev =>
              prev ? {...prev, license: msg.contentRights.license} : prev,
            )
          }
        } catch {}
      }
    } catch {}
    return () => {
      ws?.close()
    }
  }, [handle])

  return status
}

function useStreamChat(streamerDid: string | undefined, active: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const seenUris = useRef(new Set<string>())

  useEffect(() => {
    if (!active || !streamerDid) return
    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch(
          `${APPVIEW_BASE}/xrpc/community.blacksky.stream.getChat?streamer=${streamerDid}&limit=50`,
        )
        if (cancelled || !res.ok) return
        const data = await res.json()
        if (data.messages?.length) {
          const newMsgs = data.messages.filter(
            (m: ChatMessage) => !seenUris.current.has(m.uri),
          )
          for (const m of newMsgs) seenUris.current.add(m.uri)
          if (newMsgs.length) {
            setMessages(prev => [...prev, ...newMsgs.reverse()].slice(-200))
          }
        }
      } catch {}
    }

    poll()
    const interval = setInterval(poll, 2500)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [active, streamerDid])

  return messages
}

const handleCache: Record<string, string> = {}
async function resolveHandle(handle: string): Promise<string> {
  if (handleCache[handle]) return handleCache[handle]
  const res = await fetch(
    `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
  )
  const data = await res.json()
  handleCache[handle] = data.did
  return data.did
}

export function StreamplaceEmbed({
  link,
  params,
}: {
  link: AppBskyEmbedExternal.ViewExternal
  params: EmbedPlayerParams
}) {
  const t = useTheme()
  const handle = params.playerUri
  const [active, setActive] = useState(false)
  const [offline, setOffline] = useState(false)
  const status = useStreamStatus(handle)
  const chatMessages = useStreamChat(status?.did, active)
  const navigation = useNavigation()
  const windowDims = useWindowDimensions()
  const insets = useSafeAreaInsets()

  const activate = useCallback(() => {
    setActive(true)
  }, [])

  const deactivate = useCallback(() => {
    setActive(false)
  }, [])

  const openStreamplace = useCallback(() => {
    void Linking.openURL(`${STREAMPLACE_BASE}/${handle}`)
  }, [handle])

  // Scroll out of view detection
  const viewRef = useAnimatedRef()
  const frameCallback = useFrameCallback(() => {
    const measurement = measure(viewRef)
    if (!measurement) return
    const {height: winHeight, width: winWidth} = windowDims
    const realWinHeight = IS_NATIVE
      ? winHeight > winWidth
        ? winHeight
        : winWidth
      : winHeight
    const top = measurement.pageY
    const bot = measurement.pageY + measurement.height
    const isVisible = top <= realWinHeight - insets.bottom && bot >= insets.top
    if (!isVisible) {
      runOnJS(deactivate)()
    }
  }, false)

  // Watch for scroll-out and page navigation
  useEffect(() => {
    if (!active) return
    const unsubscribe = navigation.addListener('blur', deactivate)
    frameCallback.setActive(true)
    return () => {
      unsubscribe()
      frameCallback.setActive(false)
    }
  }, [navigation, active, frameCallback, deactivate])

  return (
    <Animated.View
      ref={viewRef}
      style={[
        styles.card,
        {backgroundColor: t.atoms.bg_contrast_25.backgroundColor},
      ]}>
      <StreamplaceHeader
        title={status?.title || link.title}
        description={status?.license || link.description}
        live={status?.live}
        viewerCount={status?.viewerCount}
      />

      <View style={[styles.playerArea, active && styles.playerAreaActive]}>
        <View
          style={[
            styles.playerContainer,
            active && styles.playerContainerActive,
          ]}>
          {active ? (
            <EventStopper>
              <HlsPlayer
                handle={handle}
                thumb={link.thumb}
                onOffline={() => setOffline(true)}
              />
            </EventStopper>
          ) : (
            <Pressable
              style={styles.thumbnailContainer}
              onPress={activate}
              accessibilityRole="button"
              accessibilityLabel="Play stream"
              accessibilityHint="Starts playing the livestream">
              <Image
                source={{uri: link.thumb || getThumbnailUrl(handle)}}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
              <View style={styles.playButtonOverlay}>
                <View style={styles.playButton}>
                  <BlackskyLogo width={28} fill="#fff" />
                </View>
              </View>
            </Pressable>
          )}

          {active && offline && (
            <View style={styles.offlineOverlay}>
              <Text style={styles.offlineText}>Stream is offline</Text>
            </View>
          )}
        </View>

        {active && (
          <EventStopper>
            <ChatPanel messages={chatMessages} streamerDid={status?.did} />
          </EventStopper>
        )}
      </View>

      <StreamplaceFooter onPress={openStreamplace} />
    </Animated.View>
  )
}

function ChatPanel({
  messages,
  streamerDid,
}: {
  messages: ChatMessage[]
  streamerDid?: string
}) {
  const t = useTheme()
  const scrollRef = useRef<ScrollView>(null)
  const {currentAccount} = useSession()
  const agent = useAgent()
  const [draft, setDraft] = useState('')

  useEffect(() => {
    scrollRef.current?.scrollToEnd({animated: true})
  }, [messages.length])

  const sendMessage = useCallback(async () => {
    if (!draft.trim() || !streamerDid || !currentAccount) return
    const text = draft.trim()
    setDraft('')
    try {
      await agent.com.atproto.repo.createRecord({
        repo: currentAccount.did,
        collection: 'place.stream.chat.message',
        record: {
          $type: 'place.stream.chat.message',
          text,
          createdAt: new Date().toISOString(),
          streamer: streamerDid,
        },
      })
    } catch {}
  }, [draft, streamerDid, currentAccount, agent])

  return (
    <View style={chatStyles.container}>
      <Text
        style={[
          chatStyles.header,
          {color: t.atoms.text_contrast_medium.color},
        ]}>
        Chat
      </Text>
      <ScrollView
        ref={scrollRef}
        style={chatStyles.messages}
        contentContainerStyle={chatStyles.messagesContent}>
        {messages.length === 0 ? (
          <Text
            style={[
              chatStyles.emptyText,
              {color: t.atoms.text_contrast_low.color},
            ]}>
            No messages yet
          </Text>
        ) : (
          messages.map(msg => (
            <View key={msg.uri} style={chatStyles.message}>
              <Text style={chatStyles.messageText}>
                <Text
                  style={[
                    chatStyles.authorHandle,
                    {color: t.atoms.text_contrast_medium.color},
                  ]}>
                  {msg.author.displayName || msg.author.handle}
                </Text>{' '}
                {msg.text}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
      {currentAccount && (
        <View style={chatStyles.inputRow}>
          <TextInput
            accessibilityLabel="Chat message"
            accessibilityHint="Send a message to the streamer's chat"
            style={[
              chatStyles.input,
              {
                color: t.atoms.text.color,
                borderColor: t.atoms.border_contrast_low.borderColor,
              },
            ]}
            value={draft}
            onChangeText={setDraft}
            placeholder="Type a message..."
            placeholderTextColor={t.atoms.text_contrast_low.color}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
          />
        </View>
      )}
    </View>
  )
}

function HlsPlayer({
  handle,
  thumb,
  onOffline,
}: {
  handle: string
  thumb?: string
  onOffline: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isMuted, setIsMuted] = useState(true)
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const playlistUrl = getHlsUrl(handle)
    let hls: Hls | null = null

    if (Hls.isSupported()) {
      hls = new Hls({debug: false})
      hls.loadSource(playlistUrl)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {})
      })

      hls.on(Hls.Events.ERROR, (_: any, data: any) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            onOffline()
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls?.recoverMediaError()
          }
        }
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playlistUrl
      video.addEventListener(
        'loadedmetadata',
        () => {
          video.play().catch(() => {})
        },
        {once: true},
      )
      video.addEventListener('error', () => onOffline(), {once: true})
    }

    return () => {
      if (hls) hls.destroy()
    }
  }, [handle, onOffline])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setIsMuted(video.muted)
  }, [])

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play().catch(() => {})
      setIsPaused(false)
    } else {
      video.pause()
      setIsPaused(true)
    }
  }, [])

  return (
    <View style={{width: '100%', height: '100%'}}>
      <Pressable
        onPress={togglePlayPause}
        accessibilityRole="button"
        accessibilityLabel={isPaused ? 'Play stream' : 'Pause stream'}
        accessibilityHint="Toggles playback of the live stream"
        style={{width: '100%', height: '100%'}}>
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          poster={thumb || getThumbnailUrl(handle)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            backgroundColor: '#000',
          }}
        />
        {isPaused && (
          <View style={styles.playButtonOverlay}>
            <View style={styles.playButton}>
              <BlackskyLogo width={28} fill="#fff" />
            </View>
          </View>
        )}
      </Pressable>
      <Pressable
        onPress={toggleMute}
        style={playerStyles.muteButton}
        accessibilityRole="button"
        accessibilityLabel={isMuted ? 'Unmute' : 'Mute'}
        accessibilityHint="Toggles audio for the live stream">
        <Text style={playerStyles.muteButtonText}>
          {isMuted ? 'Unmute' : 'Mute'}
        </Text>
      </Pressable>
    </View>
  )
}

function StreamplaceHeader({
  title,
  description,
  live,
  viewerCount,
}: {
  title?: string
  description?: string
  live?: boolean
  viewerCount?: number
}) {
  const t = useTheme()
  return (
    <View style={styles.header}>
      <View style={styles.logoRow}>
        <View style={styles.logoContainer}>
          <Image
            source={streamplaceLogo}
            style={{width: 20, height: 20}}
            contentFit="contain"
            accessibilityIgnoresInvertColors
          />
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: t.atoms.text.color,
            }}>
            Streamplace
          </Text>
          {title ? (
            <Text
              style={[styles.headerTitle, {color: t.atoms.text.color}]}
              numberOfLines={1}>
              — {title}
            </Text>
          ) : null}
        </View>
        {live && (
          <View style={styles.liveRow}>
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
            <Text
              style={[
                styles.viewerCount,
                {color: t.atoms.text_contrast_medium.color},
              ]}>
              {(viewerCount ?? 0).toLocaleString()} watching
            </Text>
          </View>
        )}
      </View>
      {description ? (
        <Text
          style={[
            {fontSize: 11, marginTop: 4},
            {color: t.atoms.text_contrast_medium.color},
          ]}
          numberOfLines={1}>
          License: {description}
        </Text>
      ) : null}
    </View>
  )
}

function StreamplaceFooter({onPress}: {onPress: () => void}) {
  return (
    <View style={styles.footer}>
      <Pressable
        onPress={onPress}
        accessibilityRole="link"
        accessibilityLabel="Watch on Streamplace"
        accessibilityHint="Opens the stream on stream.place">
        <Text style={{fontSize: 12, color: '#8B8BFF'}}>
          Watch on Streamplace →
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    overflow: 'hidden',
  },
  header: {
    marginBottom: 10,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '400',
    flexShrink: 1,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveBadge: {
    backgroundColor: '#e53935',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  viewerCount: {
    fontSize: 11,
  },
  playerArea: {
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  playerAreaActive: {},
  playerContainer: {
    aspectRatio: 16 / 9,
    position: 'relative',
  },
  playerContainerActive: {
    aspectRatio: 16 / 9,
  },
  thumbnailContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  offlineOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  offlineText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    marginTop: 10,
    alignItems: 'flex-end',
  },
})

const chatStyles = StyleSheet.create({
  container: {
    height: 150,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  header: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    color: '#aaa',
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  emptyText: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 10,
    textAlign: 'center',
  },
  message: {
    marginBottom: 4,
  },
  messageText: {
    fontSize: 12,
    lineHeight: 16,
    color: '#fff',
  },
  authorHandle: {
    fontWeight: '600',
    fontSize: 12,
  },
  inputRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    padding: 6,
  },
  input: {
    fontSize: 12,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
  },
})

const playerStyles = StyleSheet.create({
  muteButton: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  muteButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
})
