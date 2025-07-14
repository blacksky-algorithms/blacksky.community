import {useFonts} from 'expo-font'

/*
 * IMPORTANT: This is unused. Expo statically extracts these fonts.
 *
 * All used fonts MUST be configured here. Unused fonts can be commented out.
 *
 * This is used for both web fonts and native fonts.
 */
export function DO_NOT_USE() {
  return useFonts({
    'Inter-Regular': require('../../../assets/fonts/inter/Inter-Regular.otf'),
    'Inter-Italic': require('../../../assets/fonts/inter/Inter-Italic.otf'),
    'Inter-Bold': require('../../../assets/fonts/inter/Inter-SemiBold.otf'),
    'Inter-BoldItalic': require('../../../assets/fonts/inter/Inter-SemiBoldItalic.otf'),
    'Inter-Black': require('../../../assets/fonts/inter/Inter-ExtraBold.otf'),
    'Inter-BlackItalic': require('../../../assets/fonts/inter/Inter-ExtraBoldItalic.otf'),
    'Rubik-Regular': require('../../../assets/fonts/rubik/Rubik-Regular.ttf'),
    'Rubik-Italic': require('../../../assets/fonts/rubik/Rubik-Italic.ttf'),
    'Rubik-Bold': require('../../../assets/fonts/rubik/Rubik-SemiBold.ttf'),
    'Rubik-BoldItalic': require('../../../assets/fonts/rubik/Rubik-SemiBoldItalic.ttf'),
    'Rubik-Black': require('../../../assets/fonts/rubik/Rubik-ExtraBold.ttf'),
    'Rubik-BlackItalic': require('../../../assets/fonts/rubik/Rubik-ExtraBoldItalic.ttf'),
    'AzeretMono-Regular': require('../../../assets/fonts/azeret_mono/AzeretMono-Regular.ttf'),
    'AzeretMono-Italic': require('../../../assets/fonts/azeret_mono/AzeretMono-Italic.ttf'),
    'AzeretMono-Bold': require('../../../assets/fonts/azeret_mono/AzeretMono-SemiBold.ttf'),
    'AzeretMono-BoldItalic': require('../../../assets/fonts/azeret_mono/AzeretMono-SemiBoldItalic.ttf'),
    'AzeretMono-Black': require('../../../assets/fonts/azeret_mono/AzeretMono-ExtraBold.ttf'),
    'AzeretMono-BlackItalic': require('../../../assets/fonts/azeret_mono/AzeretMono-ExtraBoldItalic.ttf'),
  })
}
