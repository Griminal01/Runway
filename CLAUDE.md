# Runway

Personal budgeting PWA for one user (Josh, UK, paid monthly in GBP), used on a Samsung Galaxy S24 Ultra in Chrome.

## Non-negotiable money rules
- All amounts are integer pence. Format as GBP (£1,234.56).
- Safe today = (balance - bills due before next payday - Food Floor remaining - pot top-ups due - buffer) / days until payday, floored at 0 for display.
- Food Floor money is never shown as spendable and never borrowed by other categories. Unspent food money rolls into next food week.
- Pots and the buffer are excluded from Safe today.
- Payday: penultimate working day of the month
- Colour state: green if Safe today >= planned daily free spend; amber if between 0 and that; red if 0 or the Food Floor is projected to be breached.

## Engineering
- React + TypeScript + Vite, vite-plugin-pwa, Dexie for IndexedDB. No backend. No analytics. No third-party calls.
- All money maths lives in src/lib/money.ts as pure functions with Vitest tests. Run tests before every commit.
- Never commit personal figures, statements or CSVs. Data lives only on the device.
- Mobile-first at 384px wide, dark mode default, touch targets >= 48px, works offline.
- Plain language in the UI. No guilt-tripping copy.
- Keep changes small and explain them in the PR description.
