import {render} from '@testing-library/react-native'

import {NavIndicator} from '#/components/onboarding-chrome'

describe('NavIndicator', () => {
  it('renders a spacer', () => {
    const {toJSON} = render(<NavIndicator />)

    expect(toJSON()).toBeTruthy()
  })
})
