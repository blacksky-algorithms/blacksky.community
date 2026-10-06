import {Image, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {atoms as a, useTheme} from '#/alf'
import {Leaflet} from '#/components/icons/community/Leaflet'
import {Offprint} from '#/components/icons/community/Offprint'
import {Pckt} from '#/components/icons/community/Pckt'
import {Text} from '#/components/Typography'

export function ConnectedApps() {
  const {_} = useLingui()
  const t = useTheme()
  const apps = [
    {
      name: 'Leaflet',
      description: _(msg`Blogging`),
      color: '#ffe65a',
      icon: <Leaflet width={26} fill="#639f48" />,
    },
    {
      name: 'Spark',
      description: _(msg`Short-form video`),
      color: '#ff008c',
      image: require('../../../assets/onboarding/spark.png'),
    },
    {
      name: 'Streamplace',
      description: _(msg`Live streaming`),
      color: '#080e0f',
      image: require('../../../assets/onboarding/streamplace.png'),
    },
    {
      name: 'Blento',
      description: _(msg`Personal homepage`),
      color: '#161e27',
      image: require('../../../assets/onboarding/blento.jpg'),
    },
    {
      name: 'Germ',
      description: _(msg`Encrypted DMs`),
      color: '#7ee541',
      image: require('../../../assets/images/germ_logo.webp'),
    },
    {
      name: 'Offprint',
      description: _(msg`Publishing`),
      color: '#080e0f',
      icon: <Offprint width={30} fill="#ffffff" />,
    },
    {
      name: 'Popfeed',
      description: _(msg`Pop culture reviews`),
      color: '#643cec',
      image: require('../../../assets/onboarding/popfeed.png'),
    },
    {
      name: 'Skylight',
      description: _(msg`Short-form video`),
      color: '#8964ed',
      image: require('../../../assets/onboarding/skylight.jpg'),
    },
    {
      name: 'Semble',
      description: _(msg`Research & collections`),
      color: '#ffffff',
      image: require('../../../assets/onboarding/semble.png'),
    },
    {
      name: 'pckt',
      description: _(msg`Writing in community`),
      color: '#ff6262',
      icon: <Pckt width={24} fill="#080e0f" />,
    },
    {
      name: 'Bluesky',
      description: _(msg`App view`),
      color: '#0085ff',
      image: require('../../../assets/onboarding/bluesky.png'),
    },
    {
      name: 'ATStore',
      description: _(msg`App directory`),
      color: '#416f99',
      image: require('../../../assets/onboarding/atstore.webp'),
    },
  ]
  return (
    <View style={[a.flex_row, a.flex_wrap, {gap: 8}]}>
      {apps.map(app => (
        <View
          key={app.name}
          style={[
            a.flex_row,
            a.align_center,
            a.gap_sm,
            a.rounded_sm,
            t.name === 'light'
              ? t.atoms.bg_contrast_50
              : {backgroundColor: '#293848'},
            {width: '48.5%', flexGrow: 1, padding: 12, minHeight: 58},
          ]}>
          <View
            style={[
              a.align_center,
              a.justify_center,
              a.rounded_sm,
              {width: 32, height: 32, backgroundColor: app.color},
            ]}>
            {app.icon ?? (
              <Image
                accessibilityIgnoresInvertColors
                source={app.image}
                style={{width: 32, height: 32, borderRadius: 8}}
              />
            )}
          </View>
          <View style={a.flex_1}>
            <Text style={[a.text_sm, {fontWeight: '300'}]}>{app.name}</Text>
            <Text
              style={[
                a.text_xs,
                {color: '#8686ff', fontSize: 10, fontWeight: '300'},
              ]}>
              {app.description}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}
