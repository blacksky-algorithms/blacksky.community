import {useCallback, useEffect, useRef, useState} from 'react'
import {Image, Pressable, StyleSheet, View} from 'react-native'
import {
  type AppBskyEmbedExternal,
  type AppBskyRichtextFacet,
  RichText,
} from '@atproto/api'
import {Trans, useLingui} from '@lingui/react/macro'

import {assemblyReportUrl, assemblyUrl} from '#/lib/api/assembly'
import {pollTopicFromText, type PollVoteValue} from '#/lib/api/poll'
import {useOpenLink} from '#/lib/hooks/useOpenLink'
import {type EmbedPlayerParams} from '#/lib/strings/embed-player'
import {expandLinks} from '#/lib/strings/rich-text-manip'
import {useAgent, useSession} from '#/state/session'
import {Logo as BlackskyLogo} from '#/view/icons/Logo'
import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {ASSEMBLY_URL} from '#/env'
import {VoteButtons} from './VoteButtons'

const ASSEMBLY_API = `${ASSEMBLY_URL.replace(/\/+$/, '')}/api/v3`

const VOTE_NUMBERS: Record<PollVoteValue, -1 | 0 | 1> = {
  agree: -1,
  disagree: 1,
  pass: 0,
}

interface Statement {
  tid: number
  txt: string
  remaining?: number
  is_seed?: boolean
  author_name?: string
  author_avatar?: string
  author_is_blacksky_member?: boolean
  author_is_funder?: boolean
  author_is_team?: boolean
  author_is_oss_supporter?: boolean
  at_uri?: string
  at_cid?: string
}

interface ConversationMeta {
  conversation_id: string
  topic: string
  description?: string
  is_active: boolean
  auth_needed_to_vote: boolean
  at_uri?: string
  at_cid?: string
}

interface EmbedConversationResponse {
  conversation: ConversationMeta
  nextComment: Statement | null
  report_id?: string | null
}

interface ParticipationInitResponse {
  auth?: {token: string}
  nextComment?: Statement
}

interface VoteResponse {
  auth?: {token: string}
  nextComment?: Statement
}

function repeatsTopic(
  topic: string,
  text: string | undefined,
  facets: AppBskyRichtextFacet.Main[] | undefined,
): boolean {
  if (!text) return false
  if (pollTopicFromText(text) === topic) return true
  if (!facets?.length) return false
  return (
    pollTopicFromText(expandLinks(new RichText({text, facets})).text) === topic
  )
}

function extractConversationId(uri: string): string {
  try {
    const url = new URL(uri)
    return url.pathname.slice(1)
  } catch {
    return ''
  }
}

export function AssemblyEmbed({
  link,
  postText,
  postFacets,
}: {
  link: AppBskyEmbedExternal.ViewExternal
  params: EmbedPlayerParams
  postText?: string
  postFacets?: AppBskyRichtextFacet.Main[]
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const ax = useAnalytics()
  const agent = useAgent()
  const openLink = useOpenLink()
  const {currentAccount} = useSession()
  const conversationId = extractConversationId(link.uri)
  const hasCompleted = useRef(false)

  const [data, setData] = useState<EmbedConversationResponse | null>(null)
  const [statement, setStatement] = useState<Statement | null>(null)
  const [voting, setVoting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [allVoted, setAllVoted] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [participation, setParticipation] = useState<{
    did: string
    token: string
  } | null>(null)

  const viewerDid = currentAccount?.did
  const isAuthenticated = !!viewerDid
  const participationToken =
    participation && participation.did === viewerDid
      ? participation.token
      : null

  useEffect(() => {
    if (!conversationId) return
    let cancelled = false

    const init = async () => {
      try {
        const convResp = await fetch(
          `${ASSEMBLY_API}/embed/conversation?conversation_id=${conversationId}`,
        )
        if (cancelled) return
        if (!convResp.ok) {
          if (convResp.status === 400 || convResp.status === 404) {
            setNotFound(true)
          }
          return
        }
        const convData = (await convResp.json()) as EmbedConversationResponse
        if (cancelled) return
        setData(convData)
        setStatement(convData.nextComment)
        setAllVoted(!convData.nextComment)
        if (!convData.conversation.is_active) return
      } catch {
        if (!cancelled) setError('Failed to load conversation')
        return
      }

      if (viewerDid) {
        try {
          const xidParams = new URLSearchParams({
            conversation_id: conversationId,
            includePCA: 'false',
            xid: viewerDid,
          })

          const initResp = await fetch(
            `${ASSEMBLY_API}/participationInit?${xidParams.toString()}`,
          )

          if (initResp.ok) {
            const initData =
              (await initResp.json()) as ParticipationInitResponse
            if (cancelled) return

            if (initData.auth?.token) {
              setParticipation({did: viewerDid, token: initData.auth.token})
            }

            if (initData.nextComment) {
              setStatement(initData.nextComment)
            } else {
              setStatement(null)
              setAllVoted(true)
            }
          }
        } catch {}
      }
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [conversationId, viewerDid])

  const handleVote = useCallback(
    async (value: PollVoteValue) => {
      if (!statement || voting) return
      setVoting(true)
      setError(null)

      try {
        const vote = VOTE_NUMBERS[value]
        let voteAtUri: string | undefined

        if (agent.session && statement.at_uri && statement.at_cid) {
          const createResult = await agent.com.atproto.repo.createRecord({
            repo: agent.assertDid,
            collection: 'community.blacksky.assembly.vote',
            record: {
              $type: 'community.blacksky.assembly.vote',
              subject: {
                uri: statement.at_uri,
                cid: statement.at_cid,
              },
              value: vote,
              createdAt: new Date().toISOString(),
            },
          })
          voteAtUri = createResult.data.uri
        }

        const voteHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        if (participationToken) {
          voteHeaders.Authorization = `Bearer ${participationToken}`
        }
        const voteResp = await fetch(`${ASSEMBLY_API}/embed/vote`, {
          method: 'POST',
          headers: voteHeaders,
          body: JSON.stringify({
            conversation_id: conversationId,
            tid: statement.tid,
            vote,
            ...(voteAtUri ? {vote_at_uri: voteAtUri} : {}),
          }),
        })

        if (!voteResp.ok) {
          const errBody = await voteResp.text()
          if (errBody.includes('polis_err_post_votes_social_needed')) {
            setError('Sign in required to vote.')
          } else {
            throw new Error('Vote submission failed')
          }
          return
        }

        const voteResult = (await voteResp.json()) as VoteResponse

        ax.metric('assembly:vote', {
          conversationId,
          tid: statement.tid,
          value,
          remaining: voteResult.nextComment?.remaining ?? 0,
        })

        if (voteResult.nextComment) {
          setStatement(voteResult.nextComment)
        } else {
          setAllVoted(true)
          setStatement(null)
          if (!hasCompleted.current) {
            hasCompleted.current = true
            ax.metric('assembly:complete', {conversationId})
          }
        }
      } catch {
        setError('Vote failed. Please try again.')
      } finally {
        setVoting(false)
      }
    },
    [agent, ax, statement, conversationId, voting, participationToken],
  )

  const onVote = useCallback(
    (value: PollVoteValue) => {
      void handleVote(value)
    },
    [handleVote],
  )

  const openAssembly = useCallback(() => {
    openLink(assemblyUrl(conversationId))
  }, [openLink, conversationId])

  const reportId = data?.report_id
  const openResults = useCallback(() => {
    if (reportId) openLink(assemblyReportUrl(reportId))
  }, [openLink, reportId])

  if (notFound) {
    return (
      <View
        style={[
          styles.card,
          {backgroundColor: t.atoms.bg_contrast_25.backgroundColor},
        ]}>
        <Text style={[a.text_sm, {color: t.atoms.text_contrast_medium.color}]}>
          This conversation is no longer available.
        </Text>
      </View>
    )
  }

  if (error && !data) {
    return (
      <View
        style={[
          styles.card,
          {backgroundColor: t.atoms.bg_contrast_25.backgroundColor},
        ]}>
        <Text style={[a.text_sm, {color: t.atoms.text_contrast_medium.color}]}>
          {error}
        </Text>
      </View>
    )
  }

  if (!data) {
    return (
      <View
        style={[
          styles.card,
          {backgroundColor: t.atoms.bg_contrast_25.backgroundColor},
        ]}>
        <View style={styles.logoContainer}>
          <BlackskyLogo width={20} fill={t.atoms.text.color} />
          <Text style={{fontSize: 11, fontWeight: '600', color: '#8B8BFF'}}>
            People's Assembly
          </Text>
        </View>
        <Text
          style={[
            a.text_sm,
            {color: t.atoms.text_contrast_medium.color, marginTop: 8},
          ]}>
          Loading...
        </Text>
      </View>
    )
  }

  const topic = repeatsTopic(data.conversation.topic, postText, postFacets)
    ? undefined
    : data.conversation.topic
  const footer = (
    <AssemblyFooter
      onPress={openAssembly}
      onPressResults={reportId ? openResults : undefined}
    />
  )

  if (!data.conversation.is_active) {
    return (
      <View
        style={[
          styles.card,
          {backgroundColor: t.atoms.bg_contrast_25.backgroundColor},
        ]}>
        <AssemblyHeader
          topic={topic}
          description={data.conversation.description}
        />
        <Text
          style={[
            a.text_sm,
            {color: t.atoms.text_contrast_medium.color, marginTop: 8},
          ]}>
          This conversation is closed.
        </Text>
        {footer}
      </View>
    )
  }

  if (data.conversation.auth_needed_to_vote && !isAuthenticated) {
    return (
      <View
        style={[
          styles.card,
          {backgroundColor: t.atoms.bg_contrast_25.backgroundColor},
        ]}>
        <AssemblyHeader
          topic={topic}
          description={data.conversation.description}
        />
        <Pressable
          style={styles.signInButton}
          onPress={openAssembly}
          accessibilityRole="link"
          accessibilityLabel={l`Sign in to vote`}
          accessibilityHint={l`Opens the assembly page to sign in and vote`}>
          <Text style={[a.text_sm, a.font_semi_bold, {color: '#fff'}]}>
            <Trans>Sign in to vote</Trans>
          </Text>
        </Pressable>
        {footer}
      </View>
    )
  }

  return (
    <View
      style={[
        styles.card,
        {backgroundColor: t.atoms.bg_contrast_25.backgroundColor},
      ]}>
      <AssemblyHeader
        topic={topic}
        description={data.conversation.description}
      />

      {allVoted ? (
        <View style={{marginTop: 12}}>
          <Text
            style={[a.text_sm, {color: t.atoms.text_contrast_medium.color}]}>
            You've voted on all statements.
          </Text>
        </View>
      ) : statement ? (
        <>
          <View style={styles.statementCardStack}>
            <View style={styles.statementCard}>
              {!statement.is_seed && (
                <View style={styles.statementAuthorRow}>
                  {statement.author_avatar ? (
                    <Image
                      source={{uri: statement.author_avatar}}
                      style={styles.authorAvatar}
                      accessibilityIgnoresInvertColors
                    />
                  ) : (
                    <View
                      style={[styles.authorAvatar, {backgroundColor: '#ddd'}]}
                    />
                  )}
                  <View style={{flex: 1}}>
                    <Text style={[a.text_xs, {color: '#666'}]}>
                      {statement.author_name || 'Anonymous'} wrote:
                    </Text>
                    {(statement.author_is_team ||
                      statement.author_is_blacksky_member ||
                      statement.author_is_funder ||
                      statement.author_is_oss_supporter) && (
                      <View style={styles.badgeRow}>
                        {statement.author_is_team && (
                          <View
                            style={[styles.badge, {backgroundColor: '#000'}]}>
                            <Text style={[styles.badgeText, {color: '#fff'}]}>
                              Admin
                            </Text>
                          </View>
                        )}
                        {statement.author_is_blacksky_member && (
                          <View
                            style={[
                              styles.badge,
                              {backgroundColor: '#8B8BFF'},
                            ]}>
                            <Text style={[styles.badgeText, {color: '#fff'}]}>
                              Member
                            </Text>
                          </View>
                        )}
                        {statement.author_is_funder && (
                          <View
                            style={[
                              styles.badge,
                              {backgroundColor: '#D2FC51'},
                            ]}>
                            <Text style={[styles.badgeText, {color: '#000'}]}>
                              Funder
                            </Text>
                          </View>
                        )}
                        {statement.author_is_oss_supporter && (
                          <View
                            style={[
                              styles.badge,
                              {backgroundColor: '#FF6B35'},
                            ]}>
                            <Text style={[styles.badgeText, {color: '#fff'}]}>
                              OSS
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              )}
              <Text
                style={[
                  a.text_md,
                  a.font_bold,
                  {lineHeight: 22, color: '#000'},
                ]}>
                {statement.txt}
              </Text>
              {statement.remaining != null && statement.remaining > 0 && (
                <Text
                  style={[
                    a.text_xs,
                    {
                      color: '#999',
                      marginTop: 6,
                      textAlign: 'right',
                    },
                  ]}>
                  {statement.remaining > 100 ? '100+' : statement.remaining}{' '}
                  remaining
                </Text>
              )}
            </View>
            {(statement.remaining ?? 0) > 1 && (
              <View style={styles.stackLayer1} />
            )}
            {(statement.remaining ?? 0) > 2 && (
              <View style={styles.stackLayer2} />
            )}
          </View>

          <View style={styles.voteButtons}>
            <VoteButtons
              pending={voting}
              disabled={voting}
              passLabel={l`Pass / Unsure`}
              onVote={onVote}
            />
          </View>

          {error ? (
            <Text style={[a.text_xs, {color: '#F40B42', marginTop: 6}]}>
              {error}
            </Text>
          ) : null}
        </>
      ) : null}

      {footer}
    </View>
  )
}

function AssemblyHeader({
  topic,
  description,
}: {
  topic?: string
  description?: string
}) {
  const t = useTheme()
  return (
    <View style={styles.header}>
      <View style={styles.logoContainer}>
        <BlackskyLogo width={20} fill={t.atoms.text.color} />
        <Text
          style={{fontSize: 11, fontWeight: '600', color: t.atoms.text.color}}>
          People's Assembly
        </Text>
      </View>
      {topic ? (
        <Text
          style={[{fontSize: 15, fontWeight: '700', marginTop: 6}]}
          numberOfLines={2}>
          {topic}
        </Text>
      ) : null}
      {description ? (
        <Text
          style={[
            a.text_xs,
            {color: t.atoms.text_contrast_medium.color, marginTop: 4},
          ]}
          numberOfLines={2}>
          {description}
        </Text>
      ) : null}
    </View>
  )
}

function AssemblyFooter({
  onPress,
  onPressResults,
}: {
  onPress: () => void
  onPressResults?: () => void
}) {
  const {t: l} = useLingui()
  return (
    <View style={styles.footer}>
      {onPressResults ? (
        <Pressable
          onPress={onPressResults}
          accessibilityRole="link"
          accessibilityLabel={l`See results`}
          accessibilityHint={l`Opens the assembly results page`}>
          <Text style={{fontSize: 12, color: '#8B8BFF'}}>
            <Trans>See results</Trans>
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="link"
        accessibilityLabel={l`Submit a statement`}
        accessibilityHint={l`Opens the assembly conversation page`}>
        <Text style={{fontSize: 12, color: '#8B8BFF'}}>
          <Trans>Submit a statement →</Trans>
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
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statementCardStack: {
    marginTop: 8,
    marginBottom: 6,
  },
  statementCard: {
    padding: 12,
    borderRadius: 5,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: 'lightgray',
    backgroundColor: '#fff',
    position: 'relative',
    zIndex: 3,
  },
  stackLayer1: {
    height: 16,
    marginTop: -12,
    marginHorizontal: '0.5%',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: 'lightgray',
    borderRadius: 5,
    backgroundColor: '#fff',
    zIndex: 2,
  },
  stackLayer2: {
    height: 16,
    marginTop: -12,
    marginHorizontal: '1%',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#eee',
    borderRadius: 5,
    backgroundColor: '#fafafa',
    zIndex: 1,
  },
  voteButtons: {
    marginTop: 10,
  },
  statementAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  authorAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '600',
  },
  signInButton: {
    backgroundColor: '#8B8BFF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  footer: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 12,
  },
})
