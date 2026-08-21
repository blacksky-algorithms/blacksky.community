import {createContext, useContext, useEffect, useMemo, useState} from 'react'

import * as persisted from '#/state/persisted'

type HomeView = NonNullable<persisted.Schema['homeView']>

const StateContext = createContext<HomeView>('pager')
const SetContext = createContext<(value: HomeView) => void>(() => {})

export function Provider({children}: React.PropsWithChildren) {
  const [homeView, setHomeView] = useState<HomeView>(
    () => persisted.get('homeView') ?? 'pager',
  )
  const setValue = useMemo(
    () => (value: HomeView) => {
      setHomeView(value)
      persisted.write('homeView', value)
    },
    [],
  )

  useEffect(() => {
    return persisted.onUpdate('homeView', value => {
      setHomeView(value ?? 'pager')
    })
  }, [])

  return (
    <StateContext.Provider value={homeView}>
      <SetContext.Provider value={setValue}>{children}</SetContext.Provider>
    </StateContext.Provider>
  )
}

export function useHomeView() {
  return useContext(StateContext)
}

export function useSetHomeView() {
  return useContext(SetContext)
}
