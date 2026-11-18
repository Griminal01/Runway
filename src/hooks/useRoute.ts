import { useEffect, useState } from 'react'

export const ROUTES = ['today', 'food', 'income', 'bills', 'debt', 'settings'] as const
export type Route = (typeof ROUTES)[number]

function read(): Route {
  const name = window.location.hash.replace(/^#\/?/, '')
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'today'
}

/** Hash routing (#/food), so the Android back gesture moves between screens. */
export function useRoute(): Route {
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onChange = () => {
      setRoute(read())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function href(route: Route): string {
  return route === 'today' ? '#/' : `#/${route}`
}
