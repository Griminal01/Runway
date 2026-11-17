# Runway

Personal budgeting PWA for one user (Josh, UK, paid monthly in GBP), used on a Samsung Galaxy S24 Ultra in Chrome.

## Non-negotiable money rules

- All amounts are integer pence. Format as GBP (£1,234.56).
- Safe today = (balance - bills due before next payday - Food Floor remaining - pot top-ups due - buffer) / days until payday, floored at 0 for display.
- Food Floor money is never shown as spendable and never borrowed by other categories. Unspent food money rolls into next food week.
- Pots and the buffer are excluded from Safe today.
- Bills and pot top-ups can have an end date (date of the final payment). Payments up to and including it count; nothing after it does.
- Extra income (money in apart from pay, e.g. selling something) is added to the stored balance straight away, as an estimate until the next manual balance update. Deleting it takes it back off, unless a manual balance update has happened since.
- Payday: by default, the penultimate working day of the month. Working days are Monday to Friday, excluding England & Wales bank holidays.
  - Bank holidays come from a list bundled with the app (no network fetch). Update it yearly; the user can also add or remove dates in settings.
  - The user can manually override the payday date for any month (e.g. early pay at Christmas). An override always wins over the calculated date.
- Days until payday counts today but not payday itself, so it is never less than 1. On payday the period rolls over: balance and bills are measured against the following payday.
- Food weeks run Monday to Sunday, regardless of payday.
  - Food Floor remaining = what is left of the current food week, plus the full weekly Food Floor for each later food week that starts before next payday. A week that starts before payday but ends after it counts in full for the current period, so the next pay never starts short on food.
  - Unspent food money at the end of a food week rolls into the next food week, even across a payday. It is never released as spendable.
  - Food overspend within a week is taken from Safe today, not from the next food week.
  - Logging a food spend also lowers the stored balance by the same amount, until the next manual balance update replaces it. Deleting a logged spend puts it back, unless a manual balance update has happened since.
- Colour state: green if Safe today >= planned daily free spend; amber if above £0 but below that; red if £0 or the Food Floor is projected to be breached.
  - The Food Floor is projected to be breached when balance - bills due before payday - Food Floor remaining < 0 (pots and buffer are ignored for this check).

## Engineering

- React + TypeScript + Vite, vite-plugin-pwa, Dexie for IndexedDB. No backend. No analytics. No third-party calls.
- All money maths lives in src/lib/money.ts as pure functions with Vitest tests. Run tests before every commit.
- Never commit personal figures, statements or CSVs. Data lives only on the device.
- Mobile-first at 384px wide, dark mode default, touch targets >= 48px, works offline.
- Plain language in the UI. No guilt-tripping copy.
- Keep changes small and explain them in the PR description.
