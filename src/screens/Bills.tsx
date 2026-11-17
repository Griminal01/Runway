import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState, type FormEvent } from 'react'
import { MoneyInput, Sheet } from '../components/Sheet'
import { db, type MonthlyEntry } from '../lib/db'
import { formatShortDate, ordinal, penceToInput } from '../lib/format'
import {
  formatGBP,
  monthKey,
  nextOccurrence,
  occurrenceKey,
  parseGBP,
  type ISODate,
} from '../lib/money'
import { addMonthly, deleteMonthly, setDone, updateMonthly } from '../lib/store'

type Kind = 'bills' | 'pots'

const COPY = {
  bills: {
    title: 'Bills',
    one: 'bill',
    intro: 'Taken from your balance before payday. Ones whose date has passed count as paid.',
    done: 'Paid',
    markDone: 'Mark paid',
  },
  pots: {
    title: 'Pots',
    one: 'pot top-up',
    intro: 'Money you move into savings pots each month. Kept out of Safe today.',
    done: 'Moved',
    markDone: 'Mark moved',
  },
} as const

export function Bills({ today }: { today: ISODate }) {
  return (
    <main className="stack">
      <h1>Bills &amp; pots</h1>
      <MonthlySection kind="bills" today={today} />
      <MonthlySection kind="pots" today={today} />
    </main>
  )
}

function MonthlySection({ kind, today }: { kind: Kind; today: ISODate }) {
  const copy = COPY[kind]
  const [editing, setEditing] = useState<MonthlyEntry | 'new' | null>(null)
  const data = useLiveQuery(async () => {
    const [items, done] = await Promise.all([db[kind].toArray(), db.done.toArray()])
    return { items, done: new Set(done.map((d) => d.key)) }
  }, [kind])

  const items = [...(data?.items ?? [])].sort(
    (a, b) => Number(b.active) - Number(a.active) || a.dayOfMonth - b.dayOfMonth,
  )
  const monthlyTotal = items.filter((i) => i.active).reduce((t, i) => t + i.amount, 0)

  return (
    <section className="card">
      <h2 className="row-heading">
        <span>{copy.title}</span>
        <span className="amount muted">{formatGBP(monthlyTotal)} a month</span>
      </h2>
      <p className="muted small">{copy.intro}</p>

      <ul className="rows">
        {items.map((item) => {
          const next = nextOccurrence(item.dayOfMonth, today)
          const key = occurrenceKey(item.id, monthKey(next))
          const isDone = data?.done.has(key) ?? false
          return (
            <li key={item.id} className={`item${item.active ? '' : ' paused'}`}>
              <button className="item-main" onClick={() => setEditing(item)}>
                <span className="item-name">{item.name}</span>
                <span className="muted small">
                  {item.active
                    ? `${ordinal(item.dayOfMonth)} · next ${formatShortDate(next)}`
                    : 'Paused'}
                </span>
              </button>
              <span className="amount">{formatGBP(item.amount)}</span>
              {item.active && (
                <button
                  className={`chip${isDone ? ' on' : ''}`}
                  aria-pressed={isDone}
                  onClick={() => setDone(db, item.id, monthKey(next), !isDone)}
                >
                  {isDone ? `✓ ${copy.done}` : copy.markDone}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <button className="button secondary wide" onClick={() => setEditing('new')}>
        Add a {copy.one}
      </button>

      <Sheet
        open={editing !== null}
        title={editing === 'new' ? `Add a ${copy.one}` : `Edit ${copy.one}`}
        onClose={() => setEditing(null)}
      >
        {editing !== null && (
          <MonthlyForm
            kind={kind}
            item={editing === 'new' ? null : editing}
            onClose={() => setEditing(null)}
          />
        )}
      </Sheet>
    </section>
  )
}

function MonthlyForm({
  kind,
  item,
  onClose,
}: {
  kind: Kind
  item: MonthlyEntry | null
  onClose: () => void
}) {
  const id = useId()
  const [name, setName] = useState(item?.name ?? '')
  const [amount, setAmount] = useState(item ? penceToInput(item.amount) : '')
  const [day, setDay] = useState(item ? String(item.dayOfMonth) : '')
  const [active, setActive] = useState(item?.active ?? true)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const pence = parseGBP(amount)
    const dayNum = Number(day)
    if (!name.trim()) return setError('Give it a name')
    if (pence === null || pence <= 0) return setError('Enter an amount above £0')
    if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31)
      return setError('Day must be 1 to 31')
    const input = { name, amount: pence, dayOfMonth: dayNum, active }
    try {
      if (item) await updateMonthly(db, kind, item.id, input)
      else await addMonthly(db, kind, input)
      onClose()
    } catch {
      setError('That didn’t save. Please try again.')
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor={`${id}-name`}>Name</label>
      <input
        id={`${id}-name`}
        className="text-input"
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        autoFocus={!item}
      />
      <label htmlFor={`${id}-amount`}>Amount each month</label>
      <MoneyInput id={`${id}-amount`} value={amount} onChange={setAmount} />
      <label htmlFor={`${id}-day`} className="spaced">
        Day of the month
      </label>
      <input
        id={`${id}-day`}
        className="text-input"
        inputMode="numeric"
        value={day}
        maxLength={2}
        onChange={(e) => setDay(e.target.value.replace(/\D/g, ''))}
        aria-describedby={`${id}-dayhint`}
      />
      <p id={`${id}-dayhint`} className="muted small">
        If a month is shorter, the last day of that month is used.
      </p>
      {item && (
        <label className="toggle">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>Active (untick to pause)</span>
        </label>
      )}
      <p className="error" role="alert">
        {error}
      </p>
      <div className="sheet-actions">
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="button primary">
          Save
        </button>
      </div>
      {item && (
        <button
          type="button"
          className="button danger wide spaced"
          onClick={async () => {
            if (!confirmDelete) return setConfirmDelete(true)
            await deleteMonthly(db, kind, item.id)
            onClose()
          }}
        >
          {confirmDelete ? 'Tap again to delete' : 'Delete'}
        </button>
      )}
    </form>
  )
}
