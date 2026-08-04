import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'

import * as persisted from '#/state/persisted'

type StateContext = boolean
type SetContext = (v: boolean) => void

const stateContext = createContext<StateContext>(
  Boolean(persisted.defaults.alwaysUseHomeAppview),
)
stateContext.displayName = 'AlwaysUseHomeAppviewStateContext'
const setContext = createContext<SetContext>((_: boolean) => {})
setContext.displayName = 'AlwaysUseHomeAppviewSetContext'

export function Provider({children}: {children: React.ReactNode}) {
  const [state, setState] = useState(
    Boolean(persisted.get('alwaysUseHomeAppview')),
  )

  const setStateWrapped = useCallback(
    (value: persisted.Schema['alwaysUseHomeAppview']) => {
      setState(Boolean(value))
      void persisted.write('alwaysUseHomeAppview', value)
    },
    [setState],
  )

  useEffect(() => {
    return persisted.onUpdate('alwaysUseHomeAppview', next => {
      setState(Boolean(next))
    })
  }, [setStateWrapped])

  return (
    <stateContext.Provider value={state}>
      <setContext.Provider value={setStateWrapped}>
        {children}
      </setContext.Provider>
    </stateContext.Provider>
  )
}

export const useAlwaysUseHomeAppview = () => useContext(stateContext)
export const useSetAlwaysUseHomeAppview = () => useContext(setContext)
