export type FlairRenderer = 'flame' | 'pulse' | 'shimmer' | 'static'

export interface FlairSpec {
  token: string
  name: string
  renderer: FlairRenderer
  colors: string[]
  availability: 'all' | 'subscriber' | 'og' | 'moderator'
}

const DECORATIONS = new Map<string, FlairSpec>([
  [
    'community.blacksky.actor.flair#inferno',
    {
      token: 'community.blacksky.actor.flair#inferno',
      name: 'Inferno',
      renderer: 'flame',
      colors: ['#F40B42', '#FF6B35', '#FFD700'],
      availability: 'all',
    },
  ],
  [
    'community.blacksky.actor.flair#cipherPulse',
    {
      token: 'community.blacksky.actor.flair#cipherPulse',
      name: 'Cipher Pulse',
      renderer: 'pulse',
      colors: ['#6060E9', '#8686FF', '#D2FC51'],
      availability: 'all',
    },
  ],
  [
    'community.blacksky.actor.flair#glitchShift',
    {
      token: 'community.blacksky.actor.flair#glitchShift',
      name: 'Glitch Shift',
      renderer: 'shimmer',
      colors: ['#00FFFF', '#FF00FF', '#FFFF00'],
      availability: 'all',
    },
  ],
  [
    'community.blacksky.actor.flair#communityGlow',
    {
      token: 'community.blacksky.actor.flair#communityGlow',
      name: 'Community Glow',
      renderer: 'pulse',
      colors: ['#D2FC51', '#F8FAF9', '#D2FC51'],
      availability: 'all',
    },
  ],
  [
    'community.blacksky.actor.flair#modShield',
    {
      token: 'community.blacksky.actor.flair#modShield',
      name: 'Mod Shield',
      renderer: 'static',
      colors: ['#6060E9'],
      availability: 'moderator',
    },
  ],
])

export function resolveDecoration(decoration: string): FlairSpec | null {
  return DECORATIONS.get(decoration) ?? null
}

export function getAllDecorations(): FlairSpec[] {
  return Array.from(DECORATIONS.values())
}
