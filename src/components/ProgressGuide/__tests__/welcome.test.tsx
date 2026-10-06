import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {fireEvent, render} from '@testing-library/react-native'

import {ProgressGuideList} from '../List'

const mockDismiss = jest.fn()
jest.mock('#/state/session', () => ({
  useSession: () => ({currentAccount: {did: 'did:web:example.com'}}),
}))
jest.mock('#/state/queries/profile-follows', () => ({
  useProfileFollowsQuery: () => ({
    data: {pages: [{follows: Array(10).fill({})}]},
  }),
}))
jest.mock('#/state/shell/progress-guide', () => ({
  useProgressGuide: (name: string) =>
    name === 'welcome' ? {guide: 'welcome', isComplete: false} : undefined,
  useProgressGuideControls: () => ({endProgressGuide: mockDismiss}),
}))
jest.mock('#/lib/community/BrandContext', () => ({
  useBrand: () => ({metadata: {displayName: 'Blacksky'}}),
}))
jest.mock('#/view/com/util/UserAvatar', () => ({UserAvatar: () => null}))

i18n.activate('en')
it('shows the welcome prompt even with starter-pack follows and supports dismissal', () => {
  const screen = render(
    <I18nProvider i18n={i18n}>
      <ProgressGuideList />
    </I18nProvider>,
  )
  expect(
    screen.getByText('Make your first post to announce your arrival.'),
  ).toBeTruthy()
  expect(mockDismiss).not.toHaveBeenCalled()
  fireEvent.press(screen.getByLabelText('Dismiss welcome message'))
  expect(mockDismiss).toHaveBeenCalledTimes(1)
})
