import { href, type Route } from '../hooks/useRoute'

const ITEMS: { route: Route; label: string; icon: string }[] = [
  { route: 'today', label: 'Today', icon: 'M4 12l8-8 8 8M6 10v10h12V10' },
  {
    route: 'food',
    label: 'Food',
    icon: 'M6 3v8a2 2 0 004 0V3M8 11v10M17 3c-2 0-3 3-3 6s1 4 3 4v8',
  },
  {
    route: 'bills',
    label: 'Bills & pots',
    icon: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6',
  },
  {
    route: 'settings',
    label: 'Settings',
    icon: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  },
]

export function Nav({ current }: { current: Route }) {
  return (
    <nav className="nav" aria-label="Main">
      {ITEMS.map((item) => (
        <a
          key={item.route}
          href={href(item.route)}
          className="nav-item"
          aria-current={item.route === current ? 'page' : undefined}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={item.icon} />
          </svg>
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  )
}
