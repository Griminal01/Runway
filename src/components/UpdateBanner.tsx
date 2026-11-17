import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const HOUR = 60 * 60 * 1000

/**
 * Lets the service worker update without reloading under your thumb:
 * a new version waits until you tap Reload.
 */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // Check for a new version hourly and whenever the app comes back to the front.
      setInterval(() => void registration.update(), HOUR)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update()
      })
    },
  })

  // The offline note is informational only, so it tidies itself away.
  useEffect(() => {
    if (!offlineReady) return
    const timer = setTimeout(() => setOfflineReady(false), 6000)
    return () => clearTimeout(timer)
  }, [offlineReady, setOfflineReady])

  if (needRefresh) {
    return (
      <div className="banner" role="status">
        <span>Update ready.</span>
        <button className="chip" onClick={() => setNeedRefresh(false)}>
          Later
        </button>
        <button className="chip on" onClick={() => void updateServiceWorker(true)}>
          Reload
        </button>
      </div>
    )
  }

  if (offlineReady) {
    return (
      <div className="banner" role="status">
        <span>Runway now works offline.</span>
        <button className="chip" onClick={() => setOfflineReady(false)}>
          OK
        </button>
      </div>
    )
  }

  return null
}
