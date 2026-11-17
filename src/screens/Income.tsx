import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { AmountSheet } from '../components/AmountSheet'
import { Sheet } from '../components/Sheet'
import { db, type IncomeEntry } from '../lib/db'
import { formatMonth, formatShortDate } from '../lib/format'
import { formatGBP, monthKey, type ISODate } from '../lib/money'
import { addIncome, deleteIncome } from '../lib/store'

const MONTHS_SHOWN = 6

function monthsBack(today: ISODate, n: number): ISODate {
  const [y, m] = today.split('-').map(Number)
  const total = y * 12 + (m - 1) - n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
}

/** Money in apart from salary: selling things, refunds, gifts. */
export function Income({ today }: { today: ISODate }) {
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<IncomeEntry | null>(null)
  const oldest = monthsBack(today, MONTHS_SHOWN - 1)
  const entries = useLiveQuery(
    () => db.income.where('date').aboveOrEqual(oldest).reverse().sortBy('date'),
    [oldest],
  )

  const months = new Map<string, IncomeEntry[]>()
  for (const entry of entries ?? []) {
    const key = monthKey(entry.date)
    months.set(key, [...(months.get(key) ?? []), entry])
  }

  return (
    <main className="stack">
      <h1>Income</h1>
      <p className="muted">
        Money in apart from your pay, like selling something. It’s added to your balance, so it
        shows up in Safe today straight away.
      </p>
      <button className="button primary wide" onClick={() => setAdding(true)}>
        Add income
      </button>

      {entries?.length === 0 && (
        <p className="muted">No extra income in the last {MONTHS_SHOWN} months.</p>
      )}

      {[...months.entries()].map(([month, items]) => (
        <section key={month} className="card">
          <h2 className="row-heading">
            <span>{formatMonth(month)}</span>
            <span className="amount">{formatGBP(items.reduce((t, i) => t + i.amount, 0))}</span>
          </h2>
          <ul className="rows">
            {items.map((entry) => (
              <li key={entry.id}>
                <button className="row row-button" onClick={() => setSelected(entry)}>
                  <span>
                    {formatShortDate(entry.date)}
                    {entry.note && <span className="muted"> · {entry.note}</span>}
                  </span>
                  <span className="amount">{formatGBP(entry.amount)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <AmountSheet
        open={adding}
        title="Add income"
        label="Amount received"
        hint="Added to your balance."
        withNote
        withDate={today}
        submitLabel="Add it"
        onSubmit={async (amount, note, date) => {
          await addIncome(db, date ?? today, amount, note)
        }}
        onClose={() => setAdding(false)}
      />

      <Sheet open={selected !== null} title="Income" onClose={() => setSelected(null)}>
        {selected && (
          <>
            <p className="sheet-figure amount">{formatGBP(selected.amount)}</p>
            <p className="muted">
              {formatShortDate(selected.date)}
              {selected.note && ` · ${selected.note}`}
            </p>
            <p className="muted">
              Deleting takes it back off your balance, unless you’ve typed in a new balance since.
            </p>
            <div className="sheet-actions">
              <button className="button secondary" onClick={() => setSelected(null)}>
                Keep
              </button>
              <button
                className="button danger"
                onClick={async () => {
                  await deleteIncome(db, selected.id!)
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
