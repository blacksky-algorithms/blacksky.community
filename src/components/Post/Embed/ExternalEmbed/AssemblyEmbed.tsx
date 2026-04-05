import React, {useCallback, useEffect, useRef, useState} from 'react'
import {Linking, Pressable, StyleSheet, View} from 'react-native'
import {type AppBskyEmbedExternal} from '@atproto/api'

import {type EmbedPlayerParams} from '#/lib/strings/embed-player'
import {useAgent, useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'

const ASSEMBLY_API = 'https://assembly.blacksky.community/api/v3'

interface Statement {
  tid: number
  txt: string
  remaining?: number
  author_name?: string
  author_avatar?: string
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
}

interface ParticipationInitResponse {
  auth?: {token: string}
  nextComment?: Statement
}

interface VoteResponse {
  auth?: {token: string}
  nextComment?: Statement
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
}: {
  link: AppBskyEmbedExternal.ViewExternal
  params: EmbedPlayerParams
}) {
  const t = useTheme()
  const agent = useAgent()
  const {currentAccount} = useSession()
  const conversationId = extractConversationId(link.uri)

  const [data, setData] = useState<EmbedConversationResponse | null>(null)
  const [statement, setStatement] = useState<Statement | null>(null)
  const [voting, setVoting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [allVoted, setAllVoted] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const conversationJwt = useRef<string | null>(null)

  const isAuthenticated = !!currentAccount?.did

  useEffect(() => {
    if (!conversationId) return

    const init = async () => {
      try {
        const convResp = await fetch(
          `${ASSEMBLY_API}/embed/conversation?conversation_id=${conversationId}`,
        )
        if (!convResp.ok) {
          if (convResp.status === 400 || convResp.status === 404) {
            setNotFound(true)
          }
          return
        }
        const convData = (await convResp.json()) as EmbedConversationResponse
        setData(convData)

        if (!convData.conversation.is_active) return

        if (isAuthenticated && currentAccount?.did) {
          const xidParams = new URLSearchParams({
            conversation_id: conversationId,
            includePCA: 'false',
            xid: currentAccount.did,
          })

          const initResp = await fetch(
            `${ASSEMBLY_API}/participationInit?${xidParams.toString()}`,
            {headers: {'X-Forwarded-Proto': 'https'}},
          )

          if (initResp.ok) {
            const initData =
              (await initResp.json()) as ParticipationInitResponse

            if (initData.auth?.token) {
              conversationJwt.current = initData.auth.token
            }

            if (initData.nextComment) {
              setStatement(initData.nextComment)
            } else {
              setStatement(convData.nextComment)
              if (!convData.nextComment) setAllVoted(true)
            }
          } else {
            setStatement(convData.nextComment)
            if (!convData.nextComment) setAllVoted(true)
          }
        } else {
          setStatement(convData.nextComment)
          if (!convData.nextComment) setAllVoted(true)
        }
      } catch {
        setError('Failed to load conversation')
      }
    }

    void init()
  }, [conversationId, isAuthenticated, currentAccount?.did])

  const handleVote = useCallback(
    async (value: -1 | 0 | 1) => {
      if (!statement || voting || !conversationJwt.current) return
      setVoting(true)
      setError(null)

      try {
        if (statement.at_uri && statement.at_cid && agent.session) {
          await agent.com.atproto.repo.createRecord({
            repo: agent.assertDid,
            collection: 'community.blacksky.assembly.vote',
            record: {
              $type: 'community.blacksky.assembly.vote',
              subject: {
                uri: statement.at_uri,
                cid: statement.at_cid,
              },
              value,
              createdAt: new Date().toISOString(),
            },
          })
        }

        const voteResp = await fetch(`${ASSEMBLY_API}/votes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${conversationJwt.current}`,
            'X-Forwarded-Proto': 'https',
          },
          body: JSON.stringify({
            conversation_id: conversationId,
            tid: statement.tid,
            vote: value,
            agid: 1,
            xid: currentAccount?.did,
          }),
        })

        if (!voteResp.ok) {
          throw new Error('Vote submission failed')
        }

        const voteResult = (await voteResp.json()) as VoteResponse

        if (voteResult.auth?.token) {
          conversationJwt.current = voteResult.auth.token
        }

        if (voteResult.nextComment) {
          setStatement(voteResult.nextComment)
        } else {
          setAllVoted(true)
          setStatement(null)
        }
      } catch {
        setError('Vote failed. Please try again.')
      } finally {
        setVoting(false)
      }
    },
    [agent, statement, conversationId, voting, currentAccount?.did],
  )

  const onVote = useCallback(
    (value: -1 | 0 | 1) => {
      void handleVote(value)
    },
    [handleVote],
  )

  const openAssembly = useCallback(() => {
    void Linking.openURL(
      `https://assembly.blacksky.community/${conversationId}`,
    )
  }, [conversationId])

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
          <View style={styles.logo} />
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

  if (!data.conversation.is_active) {
    return (
      <View
        style={[
          styles.card,
          {backgroundColor: t.atoms.bg_contrast_25.backgroundColor},
        ]}>
        <AssemblyHeader topic={data.conversation.topic} />
        <Text
          style={[
            a.text_sm,
            {color: t.atoms.text_contrast_medium.color, marginTop: 8},
          ]}>
          This conversation is closed.
        </Text>
        <AssemblyFooter onPress={openAssembly} />
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
        <AssemblyHeader topic={data.conversation.topic} />
        {statement ? (
          <View style={styles.statementCard}>
            <Text style={[a.text_md, a.font_bold, {lineHeight: 22}]}>
              {statement.txt}
            </Text>
          </View>
        ) : null}
        <Pressable
          style={styles.signInButton}
          onPress={openAssembly}
          accessibilityRole="link"
          accessibilityLabel="Sign in to vote"
          accessibilityHint="Opens the assembly page to sign in and vote">
          <Text style={[a.text_sm, a.font_semibold, {color: '#fff'}]}>
            Sign in to vote
          </Text>
        </Pressable>
        <AssemblyFooter onPress={openAssembly} />
      </View>
    )
  }

  return (
    <View
      style={[
        styles.card,
        {backgroundColor: t.atoms.bg_contrast_25.backgroundColor},
      ]}>
      <AssemblyHeader topic={data.conversation.topic} />

      {allVoted ? (
        <View style={{marginTop: 12}}>
          <Text
            style={[a.text_sm, {color: t.atoms.text_contrast_medium.color}]}>
            You've voted on all statements.
          </Text>
        </View>
      ) : statement ? (
        <>
          <View style={styles.statementCard}>
            {statement.author_name ? (
              <Text
                style={[
                  a.text_xs,
                  {color: t.atoms.text_contrast_medium.color, marginBottom: 4},
                ]}>
                {statement.author_name} wrote:
              </Text>
            ) : null}
            <Text style={[a.text_md, a.font_bold, {lineHeight: 22}]}>
              {statement.txt}
            </Text>
            {statement.remaining != null && statement.remaining > 0 && (
              <Text
                style={[
                  a.text_xs,
                  {
                    color: t.atoms.text_contrast_low.color,
                    marginTop: 6,
                    textAlign: 'right',
                  },
                ]}>
                {statement.remaining > 100 ? '100+' : statement.remaining}{' '}
                remaining
              </Text>
            )}
          </View>

          <View style={styles.voteButtons}>
            <Pressable
              style={[styles.voteButton, styles.agreeButton]}
              onPress={() => onVote(-1)}
              disabled={voting}
              accessibilityRole="button"
              accessibilityLabel="Agree"
              accessibilityHint="Vote agree on this statement">
              <Text style={[a.text_sm, a.font_semibold, {color: '#61C554'}]}>
                {voting ? '...' : 'Agree'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.voteButton, styles.disagreeButton]}
              onPress={() => onVote(1)}
              disabled={voting}
              accessibilityRole="button"
              accessibilityLabel="Disagree"
              accessibilityHint="Vote disagree on this statement">
              <Text style={[a.text_sm, a.font_semibold, {color: '#F40B42'}]}>
                {voting ? '...' : 'Disagree'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.voteButton, styles.passButton]}
              onPress={() => onVote(0)}
              disabled={voting}
              accessibilityRole="button"
              accessibilityLabel="Pass"
              accessibilityHint="Pass on this statement">
              <Text
                style={[
                  a.text_sm,
                  a.font_semibold,
                  {color: t.atoms.text_contrast_medium.color},
                ]}>
                {voting ? '...' : 'Pass'}
              </Text>
            </Pressable>
          </View>

          {error ? (
            <Text style={[a.text_xs, {color: '#F40B42', marginTop: 6}]}>
              {error}
            </Text>
          ) : null}
        </>
      ) : null}

      <AssemblyFooter onPress={openAssembly} />
    </View>
  )
}

function AssemblyHeader({topic}: {topic: string}) {
  return (
    <View style={styles.header}>
      <View style={styles.logoContainer}>
        <View style={styles.logo} />
        <Text style={{fontSize: 11, fontWeight: '600', color: '#8B8BFF'}}>
          People's Assembly
        </Text>
      </View>
      <Text
        style={[{fontSize: 15, fontWeight: '700', marginTop: 6}]}
        numberOfLines={2}>
        {topic}
      </Text>
    </View>
  )
}

function AssemblyFooter({onPress}: {onPress: () => void}) {
  return (
    <View style={styles.footer}>
      <Pressable
        onPress={onPress}
        accessibilityRole="link"
        accessibilityLabel="Submit a statement"
        accessibilityHint="Opens the assembly conversation page">
        <Text style={{fontSize: 12, color: '#8B8BFF'}}>
          Submit a statement →
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
  logo: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: '#8B8BFF',
  },
  statementCard: {
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    marginTop: 8,
  },
  voteButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  voteButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
  },
  agreeButton: {
    borderColor: '#61C554',
  },
  disagreeButton: {
    borderColor: '#F40B42',
  },
  passButton: {
    borderColor: 'rgba(0,0,0,0.15)',
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
    alignItems: 'flex-end',
  },
})
