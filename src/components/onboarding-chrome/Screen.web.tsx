import {View} from 'react-native'

import {useBrand} from '#/lib/community/BrandContext'
import {LoggedOutLayout} from '#/view/com/util/layouts/LoggedOutLayout'
import {atoms as a} from '#/alf'

export function Screen({children}: React.PropsWithChildren) {
  const brand = useBrand()

  return (
    <LoggedOutLayout
      leadin=""
      title={brand.web.title}
      description={brand.messages.welcomeMessage}
      scrollable>
      <View style={[a.w_full, a.px_xl, a.pb_xl]}>{children}</View>
    </LoggedOutLayout>
  )
}

export function Footer({children}: React.PropsWithChildren) {
  return <View style={[a.gap_md, a.pt_2xl]}>{children}</View>
}
