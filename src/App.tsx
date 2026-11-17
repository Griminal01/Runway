import { useLiveQuery } from 'dexie-react-hooks'
import { useToday } from './hooks/useToday'
import { db } from './lib/db'
import { latestBalance, loadSafeTodayInput } from './lib/store'
import { Setup } from './screens/Setup'
import { Today } from './screens/Today'

export default function App() {
  const today = useToday()
  const data = useLiveQuery(async () => {
    const [input, balance] = await Promise.all([loadSafeTodayInput(db, today), latestBalance(db)])
    return { input, balance }
  }, [today])

  if (data === undefined) return <main aria-busy="true" />
  if (!data.input || !data.balance) return <Setup today={today} />
  return (
    <Today
      input={data.input}
      balanceEnteredAt={data.balance.enteredAt}
      balanceEstimated={data.balance.estimated}
    />
  )
}
