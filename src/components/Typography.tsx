import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
} from 'react'
import {Text as RNText} from 'react-native'
import {UITextView} from 'react-native-uitextview'
import {LinguiContext, Trans as LinguiTrans} from '@lingui/react'

import {logger} from '#/logger'
import {atoms as a, ios, type TextStyleProp, useAlf, useTheme, web} from '#/alf'
import {
  childHasEmoji,
  normalizeTextStyles,
  renderChildrenWithEmoji,
  type TextProps,
} from '#/alf/typography'

export type {TextProps}
export {Text as Span} from 'react-native'

/**
 * Our main text component. Use this most of the time.
 */
export function Text({
  children,
  emoji,
  style,
  selectable,
  title,
  dataSet,
  numberOfLines,
  allowFontScaling = true,
  ...rest
}: TextProps) {
  const {fonts, flags} = useAlf()
  const t = useTheme()
  const lingui = useContext(LinguiContext)
  const s = normalizeTextStyles(
    [
      a.text_sm,
      t.atoms.text,
      a.leading_snug,
      web(numberOfLines === 1 && numberOfLinesClippingFix),
      style,
    ],
    {
      fontScale: allowFontScaling ? fonts.scaleMultiplier : 1,
      fontFamily: fonts.family,
      flags,
    },
  )

  const resolvedChildren = resolveTransChildren(children, lingui)

  if (__DEV__) {
    if (!emoji && childHasEmoji(resolvedChildren)) {
      logger.warn(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-base-to-string
        `Text: emoji detected but emoji not enabled: "${resolvedChildren}"\n\nPlease add <Text emoji />'`,
      )
    }
  }

  const shared = {
    uiTextView: true,
    selectable,
    numberOfLines,
    style: s,
    dataSet: Object.assign({tooltip: title}, dataSet || {}),
    allowFontScaling,
    ...rest,
  }

  if (selectable && ios(true)) {
    return (
      <UITextView {...shared}>
        {renderChildrenWithEmoji(resolvedChildren, shared, emoji ?? false, {
          allowNestedUITextView: false,
        })}
      </UITextView>
    )
  }

  return (
    <RNText {...shared}>
      {renderChildrenWithEmoji(resolvedChildren, shared, emoji ?? false)}
    </RNText>
  )
}

const tagRe = /<([a-zA-Z0-9]+)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9]+)\/>/
const voidElementTags: Record<string, boolean> = {
  area: true,
  base: true,
  br: true,
  col: true,
  embed: true,
  hr: true,
  img: true,
  input: true,
  keygen: true,
  link: true,
  meta: true,
  param: true,
  source: true,
  track: true,
  wbr: true,
  menuitem: true,
}

function resolveTransChildren(
  children: ReactNode,
  lingui: React.ContextType<typeof LinguiContext>,
): ReactNode {
  if (!lingui?.i18n) return children

  return Children.map(children, child => {
    if (
      isValidElement<{children?: ReactNode}>(child) &&
      child.type === Fragment
    ) {
      return cloneElement(
        child,
        undefined,
        resolveTransChildren(child.props.children, lingui),
      )
    }

    if (!isLinguiTransElement(child)) return child

    const {render, component, id, message, formats} = child.props
    if (render !== undefined || component !== undefined) return child

    const {values, components} = getInterpolationValuesAndComponents(
      child.props,
    )
    const translation = lingui.i18n._(id, values, {message, formats})
    return translation ? formatElements(translation, components) : null
  })
}

function isLinguiTransElement(
  child: ReactNode,
): child is ReactElement<React.ComponentProps<typeof LinguiTrans>> {
  return isValidElement(child) && child.type === LinguiTrans
}

function getInterpolationValuesAndComponents({
  values: propsValues,
  components: propsComponents,
}: React.ComponentProps<typeof LinguiTrans>) {
  if (!propsValues) {
    return {
      values: undefined,
      components: propsComponents,
    }
  }

  const values = {...propsValues}
  const components = {...propsComponents}

  Object.entries(propsValues).forEach(([key, valueForKey]) => {
    if (
      typeof valueForKey === 'string' ||
      typeof valueForKey === 'number' ||
      typeof valueForKey === 'boolean' ||
      valueForKey == null
    ) {
      return
    }

    const index = Object.keys(components).length
    components[index] = <>{valueForKey as ReactNode}</>
    values[key] = `<${index}/>`
  })

  return {values, components}
}

function formatElements(value: string, elements: Record<string, unknown> = {}) {
  const parts = value.split(tagRe)
  if (parts.length === 1) return value

  const uniqueId = makeCounter(0, '$lingui-text$')
  const tree: ReactNode[] = []
  const before = parts.shift()
  if (before) tree.push(before)

  for (const [index, elementChildren, after] of getElements(parts)) {
    let element = typeof index !== 'undefined' ? elements[index] : undefined
    if (
      !isValidElement<{children?: ReactNode}>(element) ||
      (typeof element.type === 'string' &&
        voidElementTags[element.type] &&
        elementChildren)
    ) {
      element = <></>
    }
    if (Array.isArray(element)) {
      element = <>{element}</>
    }
    const elementToClone = isValidElement<{children?: ReactNode}>(element) ? (
      element
    ) : (
      <>{element as ReactNode}</>
    )

    tree.push(
      cloneElement(
        elementToClone,
        {key: uniqueId()},
        elementChildren
          ? formatElements(elementChildren, elements)
          : elementToClone.props.children,
      ),
    )

    if (after) tree.push(after)
  }

  return tree.length === 1 ? tree[0] : tree
}

function getElements(parts: string[]): [string, string, string][] {
  if (!parts.length) return []

  const [paired, children, unpaired, after] = parts.slice(0, 4)
  const triple: [string, string, string] = [
    paired || unpaired,
    children || '',
    after || '',
  ]
  return [triple].concat(getElements(parts.slice(4, parts.length)))
}

const makeCounter = (count = 0, prefix = '') => {
  return () => `${prefix}_${count++}`
}

function createHeadingElement({level}: {level: number}) {
  return function HeadingElement({style, ...rest}: TextProps) {
    const attr =
      web({
        role: 'heading',
        'aria-level': level,
      }) || {}
    return <Text {...attr} {...rest} style={style} />
  }
}

/*
 * Use semantic components when it's beneficial to the user or to a web scraper
 */
export const H1 = createHeadingElement({level: 1})
export const H2 = createHeadingElement({level: 2})
export const H3 = createHeadingElement({level: 3})
export const H4 = createHeadingElement({level: 4})
export const H5 = createHeadingElement({level: 5})
export const H6 = createHeadingElement({level: 6})
export function P({style, ...rest}: TextProps) {
  const attr =
    web({
      role: 'paragraph',
    }) || {}
  return (
    <Text {...attr} {...rest} style={[a.text_md, a.leading_relaxed, style]} />
  )
}

/**
 * HACKFIX: React Native Web applies `overflow: hidden` to
 * text when using the `numberOfLines` prop, which causes it to clip
 * ascenders/descenders. It only needs to be doing this for the X axis,
 * so override the style with `overflowX: 'hidden'`.
 * Note this only works for `numberOfLines={1}` -sfn
 *
 * @see https://github.com/necolas/react-native-web/pull/2836
 */
const numberOfLinesClippingFix = {
  overflowY: 'visible',
  overflowX: 'clip',
  // mimic browser default behavior of `min-width: 0` on `overflow: hidden`
  // elements to allow text to shrink smaller than its intrinsic width when
  // necessary
  minWidth: 0,
  // this is neater and supports vertical writing modes, but it's only baseline newly available
  // overflowInline: 'clip',
} satisfies React.CSSProperties as TextStyleProp
