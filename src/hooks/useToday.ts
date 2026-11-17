import { useEffect, useState } from 'react'
import { localToday } from '../lib/device'
import type { ISODate } from '../lib/money'

/** Today's local date, kept fresh when the app is reopened or left open past midnight. */
export function useToday(): ISODate {
  const [today, setToday] = useState(localToday)

  useEffect(() => {
    const refresh = () => setToday(localToday())
    const timer = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return today
}
