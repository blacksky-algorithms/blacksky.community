import {useCallback, useMemo} from 'react'
import {ActivityIndicator, View} from 'react-native'
import {type AppBskyActorDefs} from '@atproto/api'
import {Trans, useLingui} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'
import {useQueryClient} from '@tanstack/react-query'

import {cleanError} from '#/lib/strings/errors'
import {logger} from '#/logger'
import {
  type UpdateOp,
  usePostTypeFiltersQuery,
  useUpdatePostTypeFiltersMutation,
} from '#/state/queries/post-type-filters'
import {
  QUOTE_TYPES,
  REPOST_TYPE,
  isQuoteFilter,
  isRepostFilter,
} from '#/state/queries/post-type-filters/client-map'
import {useProfileQuery} from '#/state/queries/profile'
import {type NavigationProp} from '#/lib/routes/types'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import * as Admonition from '#/components/Admonition'
import {Filter_Stroke2_Corner0_Rounded as FilterIcon} from '#/components/icons/Filter'
import {Link} from '#/components/Link'
import {makeProfileLink} from '#/lib/routes/links'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {Eye_Stroke2_Corner0_Rounded as Eye} from '#/components/icons/Eye'

type Props = {
  navigation: NavigationProp
}

function describeTypes(
  types: readonly string[],
  isRepostOn: boolean,
  isQuoteOn: boolean,
): string {
  const labels: string[] = []
  if (isRepostOn) labels.push('Reposts')
  if (isQuoteOn) labels.push('Quote posts')
  return labels.join(', ')
}

function FilterRow({
  did,
  types,
  onToggleRepost,
  onToggleQuote,
  onRemoveAll,
}: {
  did: string
  types: readonly string[]
  onToggleRepost: () => void
  onToggleQuote: () => void
  onRemoveAll: () => void
}) {
  const t = useTheme()
  const {data: profile, isLoading} = useProfileQuery({did})
  const isRepostOn = isRepostFilter(types)
  const isQuoteOn = isQuoteFilter(types)
  const allActive = isRepostOn && isQuoteOn

  return (
    <View
      style={[a.py_lg, a.px_xl, a.border_t, t.atoms.border_contrast_low]}
      testID={`filteredAccount-${did}`}>
      <View style={[a.flex_row, a.align_center, a.gap_md, a.pb_md]}>
        <View style={[a.flex_1]}>
          {isLoading ? (
            <ActivityIndicator />
          ) : profile ? (
            <Link
              label={
                profile.displayName ?? profile.handle ?? did
              }
              to={makeProfileLink(profile)}>
              <Text
                style={[a.text_md, a.font_semi_bold, t.atoms.text_contrast_high]}>
                {profile.displayName ?? profile.handle ?? did}
              </Text>
              {profile.handle && profile.handle !== profile.displayName ? (
                <Text
                  style={[
                    a.text_sm,
                    t.atoms.text_contrast_medium,
                  ]}>
                  @{profile.handle}
                </Text>
              ) : null}
            </Link>
          ) : (
            <Text style={[a.text_md, a.font_semi_bold]} numberOfLines={1}>
              {did}
            </Text>
          )}
          <Text
            style={[a.text_sm, a.mt_xs, t.atoms.text_contrast_medium]}>
            <Trans>Filtering: {describeTypes(types, isRepostOn, isQuoteOn)}</Trans>
          </Text>
        </View>
      </View>
      <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
        {isRepostOn && (
          <Button
            variant="outline"
            color="secondary"
            label="Show reposts"
            onPress={onToggleRepost}
            testID={`filteredAccount-repost-${did}`}>
            <ButtonText>Show reposts</ButtonText>
            <ButtonIcon icon={Eye} />
          </Button>
        )}
        {isQuoteOn && (
          <Button
            variant="outline"
            color="secondary"
            label="Show quote posts"
            onPress={onToggleQuote}
            testID={`filteredAccount-quote-${did}`}>
            <ButtonText>Show quote posts</ButtonText>
            <ButtonIcon icon={Eye} />
          </Button>
        )}
        {allActive && (
          <Button
            variant="outline"
            color="negative"
            label="Remove all filters"
            onPress={onRemoveAll}
            testID={`filteredAccount-removeAll-${did}`}>
            <ButtonText>Remove all filters</ButtonText>
          </Button>
        )}
      </View>
    </View>
  )
}

export function ModerationFilteredAccounts(_props: Props) {
  const t = useTheme()
  const {data, isLoading, error, refetch} = usePostTypeFiltersQuery()
  const updateFilters = useUpdatePostTypeFiltersMutation()
  const navigation = useNavigation<NavigationProp>()
  const queryClient = useQueryClient()
  const filters = data?.filters ?? []

  const grouped = useMemo(() => {
    return filters.map(f => ({
      did: f.subject,
      types: f.types,
    }))
  }, [filters])

  const refresh = useCallback(async () => {
    try {
      await refetch()
    } catch (err) {
      logger.error('Failed to refresh filtered accounts', {message: err})
    }
  }, [refetch])

  const removeType = useCallback(
    (subject: string, type: string) => {
      const op: UpdateOp = {op: 'remove', subject, type}
      updateFilters.mutate(op)
    },
    [updateFilters],
  )

  const removeAllFor = useCallback(
    (subject: string) => {
      removeType(subject, REPOST_TYPE)
      setTimeout(() => removeType(subject, QUOTE_TYPES[0]), 50)
    },
    [removeType],
  )

  const isEmpty = !isLoading && filters.length === 0

  return (
    <Layout.Screen testID="filteredAccountsScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Filtered Accounts</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        {isLoading ? (
          <View style={[a.p_xl, a.gap_md]}>
            <Admonition.Outer type="info" style={[a.flex_1]}>
              <Admonition.Row>
                <Admonition.Icon />
                <Admonition.Content>
                  <Admonition.Text>
                    <Trans>Filters haven't loaded yet.</Trans>
                  </Admonition.Text>
                </Admonition.Content>
              </Admonition.Row>
            </Admonition.Outer>
          </View>
        ) : error && filters.length === 0 ? (
          <View style={[a.p_xl, a.gap_md]}>
            <Text
              style={[
                a.text_md,
                a.leading_normal,
                a.pb_md,
                t.atoms.text_contrast_medium,
              ]}>
              <Trans>
                We were unable to load your post-type filters at this time.
              </Trans>
            </Text>
            <Text style={[a.text_md, a.leading_normal]}>
              {cleanError(error)}
            </Text>
            <Button
              variant="solid"
              color="primary"
              onPress={refresh}
              label="Try again">
              <ButtonText>Try again</ButtonText>
            </Button>
          </View>
        ) : isEmpty ? (
          <View
            style={[a.pt_2xl, a.px_xl, a.align_center, a.gap_lg]}>
            <FilterIcon
              size="xl"
              style={[t.atoms.text_contrast_medium]}
            />
            <View
              style={[
                a.py_md,
                a.px_lg,
                a.rounded_sm,
                t.atoms.bg_contrast_25,
                a.border,
                t.atoms.border_contrast_low,
                {maxWidth: 400},
              ]}>
              <Text
                style={[a.text_sm, a.text_center, t.atoms.text_contrast_high]}>
                <Trans>
                  You haven't filtered any accounts yet. To filter an
                  account, open the menu on one of their posts or on their
                  profile.
                </Trans>
              </Text>
            </View>
          </View>
        ) : (
          <View style={[]}>
            <Info />
            {grouped.map(f => (
              <FilterRow
                key={f.did}
                did={f.did}
                types={f.types}
                onToggleRepost={() => removeType(f.did, REPOST_TYPE)}
                onToggleQuote={() => removeType(f.did, QUOTE_TYPES[0])}
                onRemoveAll={() => removeAllFor(f.did)}
              />
            ))}
          </View>
        )}
      </Layout.Content>
    </Layout.Screen>
  )
}

function Info() {
  const t = useTheme()
  return (
    <View
      style={[
        a.w_full,
        t.atoms.bg_contrast_25,
        a.py_md,
        a.px_xl,
        a.border_t,
        {marginTop: a.border.borderWidth * -1},
        t.atoms.border_contrast_low,
      ]}>
      <Text style={[a.text_center, a.text_sm, t.atoms.text_contrast_high]}>
        <Trans>
          Filtered accounts have their selected post types hidden from your
          feed. Filters are stored on your PDS and sync across devices.
        </Trans>
      </Text>
    </View>
  )
}
