import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { AmountSheet } from '../components/AmountSheet'
import { Sheet } from '../components/Sheet'
import { db, type FoodSpendEntry } from '../lib/db'
import { formatShortDate } from '../lib/format'
import { addDays, foodWeekStart, formatGBP, type ISODate } from '../lib/money'
import { addFoodSpend, deleteFoodSpend } from '../lib/store'

const WEEKS_SHOWN = 6

export function Food({ today }: { today: ISODate }) {
  const [logging, setLogging] = useState(false)
  const [selected, setSelected] = useState<FoodSpendEntry | null>(null)
  const oldest = addDays(foodWeekStart(today), -7 * (WEEKS_SHOWN - 1))
  const spends = useLiveQuery(
    () => db.foodSpends.where('date').aboveOrEqual(oldest).reverse().sortBy('date'),
    [oldest],
  )

  const weeks = new Map<ISODate, FoodSpendEntry[]>()
  for (const spend of spends ?? []) {
    const week = foodWeekStart(spend.date)
    weeks.set(week, [...(weeks.get(week) ?? []), spend])
  }

  return (
    <main className="stack">
      <h1>Food</h1>
      <button className="button primary wide" onClick={() => setLogging(true)}>
        Log a food spend
      </button>

      {spends?.length === 0 && (
        <p className="muted">No food spends logged in the last {WEEKS_SHOWN} weeks.</p>
      )}

      {[...weeks.entries()].map(([week, items]) => (
        <section key={week} className="card">
          <h2 className="row-heading">
            <span>Week of {formatShortDate(week)}</span>
            <span className="amount">{formatGBP(items.reduce((t, s) => t + s.amount, 0))}</span>
          </h2>
          <ul className="rows">
            {items.map((spend) => (
              <li key={spend.id}>
                <button className="row row-button" onClick={() => setSelected(spend)}>
                  <span>
                    {formatShortDate(spend.date)}
                    {spend.note && <span className="muted"> · {spend.note}</span>}
                  </span>
                  <span className="amount">{formatGBP(spend.amount)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <AmountSheet
        open={logging}
        title="Log food spend"
        label="Amount"
        hint="Comes off that week’s food money and your balance."
        withNote
        withDate={today}
        submitLabel="Log it"
        onSubmit={async (amount, note, date) => {
          await addFoodSpend(db, date ?? today, amount, note)
        }}
        onClose={() => setLogging(false)}
      />

      <Sheet open={selected !== null} title="Food spend" onClose={() => setSelected(null)}>
        {selected && (
          <>
            <p className="sheet-figure amount">{formatGBP(selected.amount)}</p>
            <p className="muted">
              {formatShortDate(selected.date)}
              {selected.note && ` · ${selected.note}`}
            </p>
            <p className="muted">
              Deleting puts the money back on your balance, unless you’ve typed in a new balance
              since.
            </p>
            <div className="sheet-actions">
              <button className="button secondary" onClick={() => setSelected(null)}>
                Keep
              </button>
              <button
                className="button danger"
                onClick={async () => {
                  await deleteFoodSpend(db, selected.id!)
                  setSelected(null)
                }}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </Sheet>
    </main>
  )
}
