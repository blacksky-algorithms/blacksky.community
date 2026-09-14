import {At_Stroke2_Corner0_Rounded as At} from '#/components/icons/At'
import {
  AvatarAlien as Alien,
  AvatarApple as Apple,
  AvatarArc as EmojiArc,
  AvatarAtom as Atom,
  AvatarCelebrate as Celebrate,
  AvatarExplosion as Explosion,
  AvatarGameController as GameController,
  AvatarHeartEyes as EmojiHeartEyes,
  AvatarLab as Lab,
  AvatarLeaf as Leaf,
  AvatarMusicNote as MusicNote,
  AvatarRose as Rose,
  AvatarShaka as Shaka,
  AvatarUfo as UFO,
  AvatarZap as Zap,
} from '#/components/icons/AvatarStickers'

/**
 * If you want to add or remove icons from the selection, just add the name to the `emojiNames` array and
 * add the item to the `emojiItems` record..
 */

export const emojiNames = [
  'at',
  'arc',
  'heartEyes',
  'alien',
  'apple',
  'atom',
  'celebrate',
  'gameController',
  'leaf',
  'musicNote',
  'rose',
  'shaka',
  'ufo',
  'zap',
  'explosion',
  'lab',
] as const
export type EmojiName = (typeof emojiNames)[number]

export interface Emoji {
  name: EmojiName
  component: typeof EmojiArc
}
export const emojiItems: Record<EmojiName, Emoji> = {
  at: {
    name: 'at',
    component: At,
  },
  arc: {
    name: 'arc',
    component: EmojiArc,
  },
  heartEyes: {
    name: 'heartEyes',
    component: EmojiHeartEyes,
  },
  alien: {
    name: 'alien',
    component: Alien,
  },
  apple: {
    name: 'apple',
    component: Apple,
  },
  atom: {
    name: 'atom',
    component: Atom,
  },
  celebrate: {
    name: 'celebrate',
    component: Celebrate,
  },
  gameController: {
    name: 'gameController',
    component: GameController,
  },
  leaf: {
    name: 'leaf',
    component: Leaf,
  },
  musicNote: {
    name: 'musicNote',
    component: MusicNote,
  },
  rose: {
    name: 'rose',
    component: Rose,
  },
  shaka: {
    name: 'shaka',
    component: Shaka,
  },
  ufo: {
    name: 'ufo',
    component: UFO,
  },
  zap: {
    name: 'zap',
    component: Zap,
  },
  explosion: {
    name: 'explosion',
    component: Explosion,
  },
  lab: {
    name: 'lab',
    component: Lab,
  },
}

export const avatarColors = [
  '#FE8311',
  '#FED811',
  '#73DF84',
  '#1185FE',
  '#EF75EA',
  '#F55454',
] as const
export type AvatarColor = (typeof avatarColors)[number]
