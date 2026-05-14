import {useCallback} from 'react'
import {Pressable, type StyleProp, View, type ViewStyle} from 'react-native'
import {Image} from 'expo-image'
import {LinearGradient} from 'expo-linear-gradient'
import {type AppBskyEmbedExternal} from '@atproto/api'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {useHaptics} from '#/lib/haptics'
import {shareUrl} from '#/lib/sharing'
import {toNiceDomain} from '#/lib/strings/url-helpers'
import {useStandardDocumentQuery} from '#/state/queries/standard-site'
import {atoms as a, useTheme} from '#/alf'
import * as Dialog from '#/components/Dialog'
import {Divider} from '#/components/Divider'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {IS_NATIVE} from '#/env'
import {blobRefCid, parseStandardDocumentUri} from '#/types/standard-site'
import {DocumentBody} from './StandardSiteBlocks'

const PREVIEW_MAX_HEIGHT = 200

export function StandardSiteEmbed({
  link,
  atUri,
  style,
}: {
  link: AppBskyEmbedExternal.ViewExternal
  atUri: string
  style?: StyleProp<ViewStyle>
}) {
  const t = useTheme()
  const {_} = useLingui()
  const playHaptic = useHaptics()
  const dialogControl = Dialog.useDialogControl()
  const {data, isError} = useStandardDocumentQuery(atUri)

  const onPress = useCallback(() => {
    playHaptic('Light')
  }, [playHaptic])

  const onShareExternal = useCallback(() => {
    if (link.uri && IS_NATIVE) {
      playHaptic('Heavy')
      shareUrl(link.uri)
    }
  }, [link.uri, playHaptic])

  const onOpenReader = useCallback(() => {
    dialogControl.open()
  }, [dialogControl])

  if (isError && !data) {
    return (
      <FallbackCard
        link={link}
        style={style}
        onPress={onPress}
        onShareExternal={onShareExternal}
      />
    )
  }

  const document = data?.document
  const docDid = parseStandardDocumentUri(atUri)?.repo
  const coverCid = blobRefCid(document?.coverImage)
  const coverCdn =
    coverCid && docDid
      ? `https://cdn.bsky.app/img/feed_thumbnail/plain/${docDid}/${coverCid}@jpeg`
      : link.thumb || undefined
  const title = document?.title || link.title || link.uri
  const description = document?.description || link.description || ''
  const niceDomain = toNiceDomain(link.uri)

  return (
    <>
      <View
        style={[
          a.flex_col,
          a.rounded_md,
          a.border,
          a.overflow_hidden,
          t.atoms.border_contrast_low,
          style,
        ]}>
        {coverCdn ? (
          <Image
            style={[a.aspect_card]}
            source={{uri: coverCdn}}
            accessibilityIgnoresInvertColors
          />
        ) : null}

        <View style={[a.px_md, a.pt_md, a.gap_xs]}>
          <Text
            emoji
            numberOfLines={3}
            style={[a.text_xl, a.font_bold, a.leading_tight]}>
            {title}
          </Text>
          {description ? (
            <Text
              emoji
              numberOfLines={3}
              style={[a.text_sm, a.leading_snug, t.atoms.text_contrast_medium]}>
              {description}
            </Text>
          ) : null}
        </View>

        {document ? (
          <View
            style={[
              a.px_md,
              a.pt_md,
              a.overflow_hidden,
              {maxHeight: PREVIEW_MAX_HEIGHT},
            ]}>
            <DocumentBody document={document} ctx={{authorDid: docDid ?? ''}} />
            <LinearGradient
              colors={['rgba(0,0,0,0)', t.atoms.bg.backgroundColor]}
              style={[a.absolute, {left: 0, right: 0, bottom: 0, height: 64}]}
              pointerEvents="none"
            />
          </View>
        ) : null}

        {document ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={_(msg`Read more`)}
            accessibilityHint=""
            onPress={onOpenReader}>
            {({hovered}: {hovered?: boolean}) => (
              <View
                style={[
                  a.px_md,
                  a.py_sm,
                  a.align_center,
                  hovered ? t.atoms.bg_contrast_25 : null,
                ]}>
                <Text
                  style={[
                    a.text_sm,
                    a.font_semi_bold,
                    hovered
                      ? t.atoms.text_contrast_high
                      : t.atoms.text_contrast_medium,
                  ]}>
                  <Trans>Read more</Trans>
                </Text>
              </View>
            )}
          </Pressable>
        ) : null}

        <Divider />

        <Link
          label={_(msg`Open ${niceDomain}`)}
          to={link.uri}
          shouldProxy={true}
          onPress={onPress}
          onLongPress={onShareExternal}>
          {({hovered}) => (
            <View
              style={[
                a.px_md,
                a.py_sm,
                a.flex_row,
                a.align_center,
                a.justify_between,
                a.gap_sm,
                hovered ? t.atoms.bg_contrast_25 : null,
              ]}>
              <Text
                numberOfLines={1}
                style={[
                  a.flex_1,
                  a.text_xs,
                  hovered
                    ? t.atoms.text_contrast_high
                    : t.atoms.text_contrast_medium,
                ]}>
                {niceDomain}
              </Text>
              <Text
                style={[
                  a.text_xs,
                  a.font_semi_bold,
                  hovered
                    ? t.atoms.text_contrast_high
                    : t.atoms.text_contrast_medium,
                ]}>
                <Trans>Open ↗</Trans>
              </Text>
            </View>
          )}
        </Link>
      </View>

      {document ? (
        <Dialog.Outer
          control={dialogControl}
          nativeOptions={{fullHeight: true}}>
          <Dialog.Handle />
          <Dialog.ScrollableInner
            label={_(msg`Reading: ${title}`)}
            style={[a.gap_md]}>
            {coverCdn ? (
              <Image
                style={[a.aspect_card, a.rounded_md]}
                source={{uri: coverCdn}}
                accessibilityIgnoresInvertColors
              />
            ) : null}
            <Text style={[a.text_2xl, a.font_bold, a.leading_tight]}>
              {title}
            </Text>
            {description ? (
              <Text
                style={[
                  a.text_md,
                  a.leading_snug,
                  t.atoms.text_contrast_medium,
                ]}>
                {description}
              </Text>
            ) : null}
            <DocumentBody document={document} ctx={{authorDid: docDid ?? ''}} />
            <Link
              label={_(msg`Open ${niceDomain}`)}
              to={link.uri}
              shouldProxy={true}
              onPress={onPress}
              onLongPress={onShareExternal}>
              <View
                style={[
                  a.px_md,
                  a.py_md,
                  a.flex_row,
                  a.align_center,
                  a.justify_between,
                  a.gap_sm,
                  a.border_t,
                  t.atoms.border_contrast_low,
                  a.mt_md,
                ]}>
                <Text
                  numberOfLines={1}
                  style={[a.flex_1, a.text_sm, t.atoms.text_contrast_medium]}>
                  {niceDomain}
                </Text>
                <Text
                  style={[
                    a.text_sm,
                    a.font_semi_bold,
                    t.atoms.text_contrast_high,
                  ]}>
                  <Trans>Open ↗</Trans>
                </Text>
              </View>
            </Link>
            <Dialog.Close />
          </Dialog.ScrollableInner>
        </Dialog.Outer>
      ) : null}
    </>
  )
}

function FallbackCard({
  link,
  style,
  onPress,
  onShareExternal,
}: {
  link: AppBskyEmbedExternal.ViewExternal
  style?: StyleProp<ViewStyle>
  onPress: () => void
  onShareExternal: () => void
}) {
  const t = useTheme()
  const {_} = useLingui()
  return (
    <Link
      label={link.title || _(msg`Open link to ${toNiceDomain(link.uri)}`)}
      to={link.uri}
      shouldProxy={true}
      onPress={onPress}
      onLongPress={onShareExternal}>
      {({hovered}) => (
        <View
          style={[
            a.flex_col,
            a.rounded_md,
            a.overflow_hidden,
            a.w_full,
            a.border,
            style,
            hovered
              ? t.atoms.border_contrast_high
              : t.atoms.border_contrast_low,
          ]}>
          {link.thumb ? (
            <Image
              style={[a.aspect_card]}
              source={{uri: link.thumb}}
              accessibilityIgnoresInvertColors
            />
          ) : null}
          <View style={[a.flex_1, a.pt_sm, {gap: 3}]}>
            <View style={[{gap: 3}, a.pb_xs, a.px_md]}>
              <Text
                emoji
                numberOfLines={3}
                style={[a.text_md, a.font_semi_bold, a.leading_snug]}>
                {link.title || link.uri}
              </Text>
              {link.description ? (
                <Text
                  emoji
                  numberOfLines={link.thumb ? 2 : 4}
                  style={[a.text_sm, a.leading_snug]}>
                  {link.description}
                </Text>
              ) : null}
            </View>
            <View style={[a.px_md]}>
              <Divider />
              <View
                style={[a.flex_row, a.align_center, a.pb_sm, {paddingTop: 6}]}>
                <Text
                  numberOfLines={1}
                  style={[
                    a.text_xs,
                    a.leading_snug,
                    t.atoms.text_contrast_medium,
                  ]}>
                  {toNiceDomain(link.uri)}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </Link>
  )
}
