import {colors} from '#/lib/styles'
import {useTheme} from '#/alf'

export function useChromeColors() {
  const t = useTheme()
  const isLight = t.name === 'light'
  return {
    accent: isLight ? t.palette.primary_500 : colors.green2,
    onAccent: isLight ? t.palette.white : colors.black,
    accentSubtle: isLight ? t.palette.primary_25 : 'rgba(210, 252, 81, 0.08)',
    fieldBg: isLight ? t.palette.contrast_50 : '#262644',
    fieldBorder: isLight ? t.palette.contrast_100 : '#464985',
    placeholder: isLight ? t.palette.contrast_500 : '#7878A5',
    inputText: isLight ? t.atoms.text.color : '#F8FAF9',
  }
}
