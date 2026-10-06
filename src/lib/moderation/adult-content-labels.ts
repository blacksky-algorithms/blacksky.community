import {type InterpretedLabelValueDefinition, LABELS} from '@atproto/api'

import {SELF_LABELS} from '../moderation'

const ADULT_LABEL_VALS = [...SELF_LABELS, 'gore'] as const

function adultLabelVal(identifier: string) {
  return ADULT_LABEL_VALS.find(val => val === identifier)
}

export function applyAdultContentBehavior(
  def: InterpretedLabelValueDefinition,
): InterpretedLabelValueDefinition {
  const val = adultLabelVal(def.identifier)
  if (!val) return def
  def.blurs = 'content'
  def.flags = [...LABELS[val].flags]
  def.behaviors.content = {
    ...def.behaviors.content,
    contentList: 'blur',
    contentView: 'blur',
  }
  return def
}

export function configureAdultContentLabelDefs() {
  for (const val of ADULT_LABEL_VALS) {
    applyAdultContentBehavior(LABELS[val])
  }
}

export function withAdultContentBehavior(
  defs: InterpretedLabelValueDefinition[],
): InterpretedLabelValueDefinition[] {
  return defs.map(applyAdultContentBehavior)
}
