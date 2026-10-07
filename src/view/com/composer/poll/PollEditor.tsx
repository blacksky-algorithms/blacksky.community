import {useState} from 'react'
import {View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'
import {nanoid} from 'nanoid/non-secure'
import {countGraphemes} from 'unicode-segmenter/grapheme'

import {
  getStatementIssues,
  isPollTopicPublishable,
  POLL_MAX_STATEMENTS,
  POLL_STATEMENT_MAX_CHARS,
  POLL_STATEMENT_MAX_GRAPHEMES,
  type PollDraft,
} from '#/lib/api/poll'
import {type PostAction} from '#/view/com/composer/state/composer'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import * as TextField from '#/components/forms/TextField'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {Poll_Stroke2_Corner0_Rounded as PollIcon} from '#/components/icons/Poll'
import {TimesLarge_Stroke2_Corner0_Rounded as XIcon} from '#/components/icons/Times'
import {VoteButtons} from '#/components/Post/Embed/ExternalEmbed/VoteButtons'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'

export function PollEditor({
  poll,
  text,
  dispatch,
}: {
  poll: PollDraft
  text: string
  dispatch: (action: PostAction) => void
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const ax = useAnalytics()
  const canAdd = poll.statements.length < POLL_MAX_STATEMENTS
  const canRemoveStatement = poll.statements.length > 1
  const issues = getStatementIssues(poll.statements)
  const isTopicMissing = text.trim().length === 0
  const isTopicInvalid = !isTopicMissing && !isPollTopicPublishable(text)
  const [rowKeys, setRowKeys] = useState(() =>
    poll.statements.map(() => nanoid()),
  )

  return (
    <View
      testID="pollEditor"
      style={[
        a.mt_lg,
        a.p_md,
        a.gap_md,
        a.rounded_md,
        a.border,
        t.atoms.border_contrast_low,
        t.atoms.bg_contrast_25,
      ]}>
      <View style={[a.flex_row, a.align_center, a.justify_between]}>
        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          <PollIcon size="sm" fill={t.palette.primary_500} />
          <Text
            style={[
              a.text_xs,
              a.font_bold,
              {color: t.palette.primary_500, textTransform: 'uppercase'},
            ]}>
            <Trans comment="Heading of the discussion editor card in the post composer">
              Discussion
            </Trans>
          </Text>
        </View>
        <Button
          testID="removePollBtn"
          label={l`Remove discussion`}
          size="tiny"
          variant="ghost"
          color="secondary"
          onPress={() => {
            ax.metric('composer:poll:remove', {})
            dispatch({type: 'embed_remove_poll'})
          }}>
          <ButtonText>
            <Trans>Remove</Trans>
          </ButtonText>
        </Button>
      </View>

      {(isTopicMissing || isTopicInvalid) && (
        <Text
          testID="pollTopicHint"
          style={[
            a.text_xs,
            isTopicInvalid
              ? {color: t.palette.negative_500}
              : t.atoms.text_contrast_medium,
          ]}>
          {isTopicInvalid ? (
            <Trans>
              Your post text contains characters that cannot be saved.
            </Trans>
          ) : (
            <Trans>Add post text to ask your question.</Trans>
          )}
        </Text>
      )}

      {poll.statements.map((statement, index) => {
        const issue = issues[index]
        const graphemes = countGraphemes(statement.trim())
        const isInvalid =
          issue === 'too_long' || issue === 'invalid' || issue === 'duplicate'
        const isBlankExtra = issue === 'empty' && canRemoveStatement
        const isOverByteCap =
          issue === 'too_long' && graphemes <= POLL_STATEMENT_MAX_GRAPHEMES
        return (
          <View key={rowKeys[index]} style={[a.gap_2xs]}>
            <View style={[a.flex_row, a.align_center, a.gap_xs]}>
              <View style={[a.flex_1]}>
                <TextField.Root isInvalid={isInvalid}>
                  <TextField.Input
                    testID={`pollStatementInput-${index}`}
                    maxLength={POLL_STATEMENT_MAX_CHARS}
                    label={l({
                      message: `Statement ${index + 1}`,
                      comment:
                        'Accessibility label for a poll statement text field in the composer. The number is the position of the statement.',
                    })}
                    placeholder={l({
                      message: 'Write a statement people can agree with',
                      comment:
                        'Placeholder for a poll statement text field in the composer',
                    })}
                    value={statement}
                    onChangeText={next =>
                      dispatch({
                        type: 'embed_update_poll_statement',
                        index,
                        text: next,
                      })
                    }
                    multiline
                  />
                </TextField.Root>
              </View>
              {canRemoveStatement && (
                <Button
                  testID={`pollStatementRemove-${index}`}
                  label={l`Remove statement`}
                  size="tiny"
                  shape="round"
                  variant="ghost"
                  color="secondary"
                  onPress={() => {
                    setRowKeys(keys =>
                      keys.length > 1
                        ? keys.filter((_, i) => i !== index)
                        : keys,
                    )
                    dispatch({type: 'embed_remove_poll_statement', index})
                  }}>
                  <ButtonIcon icon={XIcon} />
                </Button>
              )}
            </View>
            <Text
              testID={`pollStatementHint-${index}`}
              style={[
                a.text_xs,
                a.text_right,
                isInvalid
                  ? {color: t.palette.negative_500}
                  : t.atoms.text_contrast_medium,
              ]}>
              {issue === 'invalid' ? (
                <Trans>
                  This statement contains characters that cannot be saved.
                </Trans>
              ) : isOverByteCap ? (
                <Trans>This statement is too long. Shorten it to post.</Trans>
              ) : issue === 'duplicate' ? (
                <Trans>This statement repeats another one.</Trans>
              ) : isBlankExtra ? (
                <Trans>Add text or remove this statement to post.</Trans>
              ) : (
                `${graphemes} / ${POLL_STATEMENT_MAX_GRAPHEMES}`
              )}
            </Text>
          </View>
        )
      })}

      {canAdd && (
        <Button
          testID="addPollStatementBtn"
          label={l`Add another statement`}
          size="small"
          variant="outline"
          color="secondary"
          onPress={() => {
            ax.metric('composer:poll:statementAdd', {
              count: poll.statements.length + 1,
            })
            setRowKeys(keys =>
              keys.length < POLL_MAX_STATEMENTS ? [...keys, nanoid()] : keys,
            )
            dispatch({type: 'embed_add_poll_statement'})
          }}>
          <ButtonIcon icon={PlusIcon} position="left" />
          <ButtonText>
            <Trans>Add another statement</Trans>
          </ButtonText>
        </Button>
      )}

      <View
        testID="pollVotePreview"
        style={[{opacity: 0.5}]}
        pointerEvents="none"
        aria-hidden={true}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <VoteButtons disabled onVote={() => {}} />
      </View>
      <View>
        <Text style={[a.text_xs, a.leading_snug, t.atoms.text_contrast_medium]}>
          <Trans>Your post text is the question.</Trans>
        </Text>
        <Text style={[a.text_xs, a.leading_snug, t.atoms.text_contrast_medium]}>
          <Trans>Statements and votes in discussions are public.</Trans>
        </Text>
      </View>
    </View>
  )
}
