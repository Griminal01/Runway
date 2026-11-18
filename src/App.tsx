import { useLiveQuery } from 'dexie-react-hooks'
import { Nav } from './components/Nav'
import { useRoute } from './hooks/useRoute'
import { useToday } from './hooks/useToday'
import { db } from './lib/db'
import { latestBalance, loadSafeTodayInput } from './lib/store'
import { Bills } from './screens/Bills'
import { Debt } from './screens/Debt'
import { Food } from './screens/Food'
import { Income } from './screens/Income'
import { Settings } from './screens/Settings'
import { Setup } from './screens/Setup'
import { Today } from './screens/Today'

export default function App() {
  const today = useToday()
  const route = useRoute()
  const data = useLiveQuery(async () => {
    const [input, balance] = await Promise.all([loadSafeTodayInput(db, today), latestBalance(db)])
    return { input, balance }
  }, [today])

  if (data === undefined) return <main aria-busy="true" />
  if (!data.input || !data.balance) return <Setup today={today} />

  return (
    <>
      {route === 'today' && (
        <Today
          input={data.input}
          balanceEnteredAt={data.balance.enteredAt}
          balanceEstimated={data.balance.estimated}
        />
      )}
      {route === 'food' && <Food today={today} />}
      {route === 'income' && <Income today={today} />}
      {route === 'bills' && <Bills today={today} />}
      {route === 'debt' && <Debt input={data.input} />}
      {route === 'settings' && <Settings today={today} />}
      <Nav current={route} />
    </>
  )
}
