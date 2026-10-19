import {useState} from 'react'
import {ScrollView, View} from 'react-native'
import {Image} from 'expo-image'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'
import {useMutation, useQuery} from '@tanstack/react-query'

import {
  type CommonNavigatorParams,
  type NavigationProp,
} from '#/lib/routes/types'
import {logger} from '#/logger'
import {Nux, useSaveNux} from '#/state/queries/nuxs'
import {
  useAddSavedFeedsMutation,
  usePreferencesQuery,
  useUpdateSavedFeedsMutation,
} from '#/state/queries/preferences'
import {useAgent} from '#/state/session'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {Logo} from '#/view/icons/Logo'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {SearchInput} from '#/components/forms/SearchInput'
import * as Toggle from '#/components/forms/Toggle'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {
  ChevronBottom_Stroke2_Corner0_Rounded as ChevronBottomIcon,
  ChevronRight_Stroke2_Corner0_Rounded as ChevronRightIcon,
  ChevronTop_Stroke2_Corner0_Rounded as ChevronTopIcon,
} from '#/components/icons/Chevron'
import {TimesLarge_Stroke2_Corner0_Rounded as XIcon} from '#/components/icons/Times'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {
  ELECTION_DESK_FEED_URI,
  RACES_NATL_FEED_URI,
  stateFeedUri,
  US_STATES,
} from './feeds'
import {GRAZE_PARTNER, MIDTERMS_CTAS, type MidtermsCta} from './partners'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'Midterms'>

const STEP_COUNT = 4
const STATE_NAMES = new Map(US_STATES)

export function MidtermsScreen({}: Props) {
  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>2026 midterms</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <MidtermsFlow />
      </Layout.Content>
    </Layout.Screen>
  )
}

function MidtermsFlow() {
  const {_} = useLingui()
  const navigation = useNavigation<NavigationProp>()
  const [step, setStep] = useState(0)
  const [states, setStates] = useState<string[]>([])
  const [pins, setPins] = useState<string[]>([RACES_NATL_FEED_URI])

  const {data: preferences} = usePreferencesQuery()
  const {mutateAsync: addSavedFeeds} = useAddSavedFeedsMutation()
  const {mutateAsync: updateSavedFeeds} = useUpdateSavedFeedsMutation()
  const {mutate: saveNux} = useSaveNux()

  const save = useMutation({
    mutationFn: async () => {
      const saved = preferences?.savedFeeds ?? []
      const toAdd = pins.filter(uri => !saved.some(f => f.value === uri))
      const toPin = saved.filter(f => pins.includes(f.value) && !f.pinned)
      if (toAdd.length) {
        await addSavedFeeds(
          toAdd.map(uri => ({type: 'feed', value: uri, pinned: true})),
        )
      }
      if (toPin.length) {
        await updateSavedFeeds(toPin.map(f => ({...f, pinned: true})))
      }
      saveNux({id: Nux.Midterms2026Card, completed: true, data: undefined})
    },
    onSuccess: () => setStep(3),
    onError: e => {
      logger.error('Failed to pin midterms feeds', {message: e})
    },
  })

  return (
    <View style={[a.p_lg, a.gap_xl]}>
      <StepDots step={step} />

      {step === 0 && <WelcomeStep />}
      {step === 1 && <StatesStep states={states} onChange={setStates} />}
      {step === 2 && (
        <FeedsStep states={states} pins={pins} onChangePins={setPins} />
      )}
      {step === 3 && <GetInvolvedStep />}

      {step === 2 && save.isError && (
        <ErrorText
          text={_(
            msg`Couldn't pin your feeds. Check your connection and try again.`,
          )}
        />
      )}

      <View style={[a.flex_row, a.gap_md]}>
        {step > 0 && step < 3 && (
          <Button
            label={_(msg`Back`)}
            size="large"
            color="secondary"
            style={[a.flex_1]}
            onPress={() => setStep(step - 1)}>
            <ButtonText>
              <Trans>Back</Trans>
            </ButtonText>
          </Button>
        )}
        {step < 2 && (
          <Button
            label={step === 0 ? _(msg`Get started`) : _(msg`Next`)}
            size="large"
            color="primary"
            style={[a.flex_1]}
            onPress={() => setStep(step + 1)}>
            <ButtonText>
              {step === 0 ? <Trans>Get started</Trans> : <Trans>Next</Trans>}
            </ButtonText>
          </Button>
        )}
        {step === 2 && (
          <Button
            label={_(msg`Save`)}
            size="large"
            color="primary"
            style={[a.flex_1]}
            disabled={save.isPending}
            onPress={() => save.mutate()}>
            <ButtonText>
              <Trans>Save</Trans>
            </ButtonText>
            {save.isPending && <Loader />}
          </Button>
        )}
        {step === 3 && (
          <Button
            label={_(msg`Go to Home`)}
            size="large"
            color="primary"
            style={[a.flex_1]}
            onPress={() => navigation.navigate('Home')}>
            <ButtonText>
              <Trans>Go to Home</Trans>
            </ButtonText>
          </Button>
        )}
      </View>
    </View>
  )
}

function StepDots({step}: {step: number}) {
  const t = useTheme()
  return (
    <View style={[a.flex_row, a.align_center, a.gap_sm]}>
      {Array.from({length: STEP_COUNT}, (_, i) => (
        <View
          key={i}
          style={[
            a.rounded_full,
            {height: 6, width: i === step ? 24 : 6},
            i <= step
              ? {backgroundColor: t.palette.primary_500}
              : t.atoms.bg_contrast_100,
          ]}
        />
      ))}
      <Text style={[a.text_xs, a.ml_xs, t.atoms.text_contrast_medium]}>
        <Trans>
          Step {step + 1} of {STEP_COUNT}
        </Trans>
      </Text>
    </View>
  )
}

function WelcomeStep() {
  const t = useTheme()
  return (
    <View style={[a.gap_xl]}>
      <View
        style={[
          a.flex_row,
          a.align_center,
          a.justify_center,
          a.gap_lg,
          a.py_xl,
          a.rounded_md,
          t.atoms.bg_contrast_25,
        ]}>
        <Logo width={64} />
        <XIcon size="md" style={[t.atoms.text_contrast_low]} />
        <Image
          source={require('../../../assets/images/graze_logo.webp')}
          accessibilityIgnoresInvertColors
          style={[a.rounded_full, {width: 64, height: 64}]}
        />
      </View>
      <View style={[a.gap_sm]}>
        <Text style={[a.text_3xl, a.font_bold, a.leading_tight]}>
          <Trans>Election 2026 on Blacksky</Trans>
        </Text>
        <Text style={[a.text_md, a.leading_snug, t.atoms.text_contrast_medium]}>
          <Trans>
            Blacksky is partnering with Graze to provide up-to-date,
            community-curated information about the US midterm elections in
            2026.
          </Trans>
        </Text>
      </View>
    </View>
  )
}

const VISIBLE_CHIPS = 3

function StatesStep({
  states,
  onChange,
}: {
  states: string[]
  onChange: (states: string[]) => void
}) {
  const t = useTheme()
  const {_} = useLingui()
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(false)

  const q = query.trim().toLowerCase()
  const visibleStates = q
    ? US_STATES.filter(([, name]) => name.toLowerCase().includes(q))
    : US_STATES
  const chips = expanded ? states : states.slice(0, VISIBLE_CHIPS)
  const overflow = states.length - chips.length

  return (
    <View style={[a.gap_lg]}>
      <Text style={[a.text_2xl, a.font_bold]}>
        <Trans>Which states do you want to follow?</Trans>
      </Text>

      {states.length > 0 && (
        <View style={[a.flex_row, a.align_start, a.gap_sm]}>
          <View style={[a.flex_1, a.flex_row, a.flex_wrap, a.gap_sm]}>
            {chips.map(code => {
              const name = STATE_NAMES.get(code) ?? code
              return (
                <StateChip
                  key={code}
                  label={name}
                  a11yLabel={_(msg`Remove ${name}`)}
                  removable
                  onPress={() => onChange(states.filter(s => s !== code))}
                />
              )
            })}
            {overflow > 0 && (
              <StateChip
                label={`+${overflow}`}
                a11yLabel={_(msg`Show all selected states`)}
                onPress={() => setExpanded(true)}
              />
            )}
          </View>
          {states.length > VISIBLE_CHIPS && (
            <Button
              label={
                expanded
                  ? _(msg`Show fewer states`)
                  : _(msg`Show all selected states`)
              }
              size="small"
              variant="ghost"
              color="secondary"
              shape="round"
              onPress={() => setExpanded(!expanded)}>
              <ButtonIcon
                icon={expanded ? ChevronTopIcon : ChevronBottomIcon}
              />
            </Button>
          )}
        </View>
      )}

      <SearchInput
        value={query}
        onChangeText={setQuery}
        onClearText={() => setQuery('')}
        placeholder={_(msg`Search states…`)}
      />

      <ScrollView
        nestedScrollEnabled
        style={[a.rounded_md, t.atoms.bg_contrast_25, {maxHeight: 343}]}>
        <Toggle.Group
          type="checkbox"
          label={_(msg`Your states`)}
          values={states}
          onChange={onChange}>
          {visibleStates.map(([code, name], index) => (
            <Toggle.Item key={code} name={code} label={name}>
              {({selected}) => (
                <View
                  style={[
                    a.flex_1,
                    a.flex_row,
                    a.align_center,
                    a.justify_between,
                    a.px_lg,
                    {height: 48},
                    index > 0 && [a.border_t, t.atoms.border_contrast_low],
                  ]}>
                  <Text style={[a.text_md]}>{name}</Text>
                  {selected && (
                    <CheckIcon
                      size="sm"
                      style={{color: t.palette.primary_500}}
                    />
                  )}
                </View>
              )}
            </Toggle.Item>
          ))}
        </Toggle.Group>
        {visibleStates.length === 0 && (
          <Text style={[a.p_lg, a.text_md, t.atoms.text_contrast_medium]}>
            <Trans>No states match "{query}"</Trans>
          </Text>
        )}
      </ScrollView>
    </View>
  )
}

function StateChip({
  label,
  a11yLabel,
  removable,
  onPress,
}: {
  label: string
  a11yLabel: string
  removable?: boolean
  onPress: () => void
}) {
  const t = useTheme()
  return (
    <Button
      label={a11yLabel}
      onPress={onPress}
      style={[
        a.flex_row,
        a.align_center,
        a.gap_xs,
        a.pl_md,
        removable ? a.pr_sm : a.pr_md,
        a.py_xs,
        a.rounded_full,
        {backgroundColor: t.palette.primary_500},
      ]}
      hoverStyle={{opacity: 0.8}}>
      <Text style={[a.text_sm, a.font_semi_bold, {color: t.palette.white}]}>
        {label}
      </Text>
      {removable && <XIcon size="xs" style={{color: t.palette.white}} />}
    </Button>
  )
}

function FeedsStep({
  states,
  pins,
  onChangePins,
}: {
  states: string[]
  pins: string[]
  onChangePins: (pins: string[]) => void
}) {
  const t = useTheme()
  const {_} = useLingui()
  const feedUris = [
    RACES_NATL_FEED_URI,
    ...states.map(stateFeedUri),
    ELECTION_DESK_FEED_URI,
  ]
  const {data: views} = useFeedViews(feedUris)

  return (
    <View style={[a.gap_md]}>
      <View style={[a.gap_sm]}>
        <Text style={[a.text_2xl, a.font_bold]}>
          <Trans>What feeds do you want to see?</Trans>
        </Text>
        <Text style={[a.text_md, a.leading_snug, t.atoms.text_contrast_medium]}>
          <Trans>Pinned feeds show up as tabs on your Home.</Trans>
        </Text>
      </View>
      <Toggle.Group
        type="checkbox"
        label={_(msg`Feeds to pin`)}
        values={pins}
        onChange={onChangePins}
        style={[a.gap_sm]}>
        {feedUris.map(uri => {
          const view = views?.find(v => v.uri === uri)
          return (
            <Toggle.Item
              key={uri}
              name={uri}
              label={_(msg`Pin ${view?.displayName ?? ''}`)}>
              <View
                style={[
                  a.flex_1,
                  a.flex_row,
                  a.align_center,
                  a.gap_md,
                  a.p_md,
                  a.rounded_md,
                  a.border,
                  t.atoms.border_contrast_low,
                  t.atoms.bg_contrast_25,
                ]}>
                <UserAvatar type="algo" size={40} avatar={view?.avatar} />
                <View style={[a.flex_1, a.gap_2xs]}>
                  <Text style={[a.text_md, a.font_bold]}>
                    {view?.displayName ?? ''}
                  </Text>
                  <Text
                    style={[
                      a.text_sm,
                      a.leading_snug,
                      t.atoms.text_contrast_medium,
                    ]}>
                    {view?.description ?? ''}
                  </Text>
                </View>
                <Toggle.Platform />
              </View>
            </Toggle.Item>
          )
        })}
      </Toggle.Group>
    </View>
  )
}

function GetInvolvedStep() {
  const t = useTheme()
  return (
    <View style={[a.gap_lg]}>
      <View style={[a.gap_sm]}>
        <View style={[a.flex_row, a.align_center, a.gap_sm]}>
          <CheckIcon size="lg" style={{color: t.palette.positive_500}} />
          <Text style={[a.text_2xl, a.font_bold]}>
            <Trans>You're set</Trans>
          </Text>
        </View>
        <Text style={[a.text_md, a.leading_snug, t.atoms.text_contrast_medium]}>
          <Trans>
            Your feeds are on Home. Want to do more this election? Get involved
            with {GRAZE_PARTNER.name}.
          </Trans>
        </Text>
      </View>
      <View style={[a.gap_md]}>
        {MIDTERMS_CTAS.map(cta => (
          <CtaCard key={cta.title.id} cta={cta} />
        ))}
      </View>
    </View>
  )
}

function CtaCard({cta}: {cta: MidtermsCta}) {
  const t = useTheme()
  const {i18n} = useLingui()
  return (
    <Link
      to={cta.url}
      label={i18n._(cta.title)}
      style={[a.rounded_md, a.overflow_hidden]}>
      {({hovered, pressed}) => (
        <View
          style={[
            a.flex_1,
            a.flex_row,
            a.align_center,
            a.gap_md,
            a.p_md,
            a.rounded_md,
            a.border,
            t.atoms.border_contrast_low,
            hovered || pressed
              ? t.atoms.bg_contrast_50
              : t.atoms.bg_contrast_25,
          ]}>
          <View style={[a.flex_1, a.gap_xs]}>
            <Text style={[a.text_md, a.font_bold]}>{i18n._(cta.title)}</Text>
            <Text
              style={[a.text_sm, a.leading_snug, t.atoms.text_contrast_medium]}>
              {i18n._(cta.description)}
            </Text>
          </View>
          <ChevronRightIcon size="md" style={[t.atoms.text_contrast_low]} />
        </View>
      )}
    </Link>
  )
}

function useFeedViews(uris: string[]) {
  const agent = useAgent()
  return useQuery({
    queryKey: ['midterms-feed-views', uris],
    queryFn: async () => {
      const res = await agent.app.bsky.feed.getFeedGenerators({feeds: uris})
      return res.data.feeds
    },
  })
}

function ErrorText({text}: {text: string}) {
  const t = useTheme()
  return (
    <Text style={[a.text_sm, {color: t.palette.negative_500}]}>{text}</Text>
  )
}
