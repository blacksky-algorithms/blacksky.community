import {
  cloneElement,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  type I18n,
  type MessageDescriptor,
  type MessageOptions,
} from '@lingui/core'
import {useLingui} from '@lingui/react'

import {Text, type TextProps} from '#/components/Typography'

type RichTransTextComponents = Record<string, ReactElement>
type RichTransTextValues = Record<string, unknown>

const tagRe = /<([a-zA-Z0-9]+)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9]+)\/>/

export type RichTransTextProps = {
  message: MessageDescriptor
  values?: RichTransTextValues
  components?: RichTransTextComponents
  textProps?: Omit<TextProps, 'children'>
  segmentTextProps?: Omit<TextProps, 'children'>
  formats?: MessageOptions['formats']
  append?: ReactNode
}

export function RichTransText({
  message,
  values,
  components,
  textProps,
  segmentTextProps,
  formats,
  append,
}: RichTransTextProps) {
  const {i18n} = useLingui()

  return (
    <Text {...textProps}>
      {formatRichTransTextMessage(
        i18n,
        values
          ? {
              ...message,
              values: {
                ...message.values,
                ...values,
              },
            }
          : message,
        {
          components,
          textProps: segmentTextProps ?? getDefaultSegmentTextProps(textProps),
          formats,
        },
      )}
      {append}
    </Text>
  )
}

function getDefaultSegmentTextProps(
  textProps: Omit<TextProps, 'children'> | undefined,
) {
  if (!textProps) return undefined
  return {
    style: textProps.style,
    emoji: textProps.emoji,
  }
}

export function formatRichTransTextMessage(
  i18n: I18n,
  message: MessageDescriptor,
  options: {
    components?: RichTransTextComponents
    textProps?: Omit<TextProps, 'children'>
    formats?: MessageOptions['formats']
  } = {},
) {
  const {values, components} = collectValuesAndComponents(
    message.values,
    options.components,
  )
  const translation = i18n._(
    message.id,
    values as MessageDescriptor['values'],
    {
      message: message.message,
      formats: options.formats,
    },
  )

  return formatRichTransText(translation, {
    components,
    textProps: options.textProps,
  })
}

export function formatRichTransText(
  value: string,
  {
    components = {},
    textProps,
    keyPrefix = '$richTransText$',
  }: {
    components?: RichTransTextComponents
    textProps?: Omit<TextProps, 'children'>
    keyPrefix?: string
  } = {},
): ReactNode {
  const parts = value.split(tagRe)
  if (parts.length === 1) {
    return wrapText(value, textProps, keyPrefix)
  }

  const tree: ReactNode[] = []
  const before = parts.shift()
  if (before) {
    tree.push(wrapText(before, textProps, `${keyPrefix}_before`))
  }

  getElements(parts).forEach(([index, children, after], elementIndex) => {
    const component = components[index] as
      | ReactElement<{children?: ReactNode}>
      | undefined
    const key = `${keyPrefix}_${index}_${elementIndex}`

    if (component) {
      tree.push(
        cloneElement(
          component,
          {key},
          children
            ? formatRichTransText(children, {
                components,
                textProps,
                keyPrefix: key,
              })
            : component.props.children,
        ),
      )
    } else if (children) {
      tree.push(
        formatRichTransText(children, {
          components,
          textProps,
          keyPrefix: key,
        }),
      )
    }

    if (after) {
      tree.push(wrapText(after, textProps, `${key}_after`))
    }
  })

  return tree
}

function collectValuesAndComponents(
  values: RichTransTextValues | undefined,
  components: RichTransTextComponents = {},
) {
  const nextValues = {...values}
  const nextComponents = {...components}

  Object.entries(values ?? {}).forEach(([key, value]) => {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value == null
    ) {
      return
    }

    const index = String(Object.keys(nextComponents).length)
    nextComponents[index] = isValidElement(value) ? (
      value
    ) : (
      <Fragment>{value as ReactNode}</Fragment>
    )
    nextValues[key] = `<${index}/>`
  })

  return {values: nextValues, components: nextComponents}
}

function wrapText(
  value: string,
  textProps: Omit<TextProps, 'children'> | undefined,
  key: string,
) {
  if (!value) return null
  return (
    <Text key={key} {...textProps}>
      {value}
    </Text>
  )
}

function getElements(parts: string[]): [string, string, string][] {
  if (!parts.length) return []
  const [paired, children, unpaired, after] = parts.slice(0, 4)
  const current: [string, string, string] = [
    paired || unpaired,
    children || '',
    after || '',
  ]
  return [current].concat(getElements(parts.slice(4)))
}
