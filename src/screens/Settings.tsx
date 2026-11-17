import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState, type FormEvent } from 'react'
import { BackupCard } from '../components/Backup'
import { MoneyInput, Sheet } from '../components/Sheet'
import { BANK_HOLIDAY_LIST, BANK_HOLIDAYS_COVER_UNTIL_YEAR } from '../lib/bankHolidays'
import { db, type Settings as SettingsRow } from '../lib/db'
import { formatMonth, formatShortDate, penceToInput } from '../lib/format'
import {
  addDays,
  assertISODate,
  parseGBP,
  upcomingPaydays,
  type ISODate,
  type MonthKey,
} from '../lib/money'
import { bankHolidays, saveSettings, setBankHolidayEdit, setPaydayOverride } from '../lib/store'

export function Settings({ today }: { today: ISODate }) {
  const settings = useLiveQuery(() => db.settings.get('main'))
  return (
    <main className="stack">
      <h1>Settings</h1>
      {settings && <NumbersForm settings={settings} />}
      <BackupCard />
      <Paydays today={today} />
      <BankHolidays today={today} />
      <p className="muted small center">Everything is stored only on this phone.</p>
    </main>
  )
}

// --- Numbers ----------------------------------------------------------------

const NUMBER_FIELDS = [
  { key: 'weeklyFoodFloor', label: 'Food per week', hint: 'Set aside every Monday to Sunday.' },
  { key: 'buffer', label: 'Buffer', hint: 'Kept back for surprises.' },
  {
    key: 'plannedDailySpend',
    label: 'Usual daily spend',
    hint: 'Safe today at or above this shows green.',
  },
] as const

type NumberKey = (typeof NUMBER_FIELDS)[number]['key']

function NumbersForm({ settings }: { settings: SettingsRow }) {
  const id = useId()
  const [values, setValues] = useState<Record<NumberKey, string>>({
    weeklyFoodFloor: penceToInput(settings.weeklyFoodFloor),
    buffer: penceToInput(settings.buffer),
    plannedDailySpend: penceToInput(settings.plannedDailySpend),
  })
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = {} as Record<NumberKey, number>
    for (const field of NUMBER_FIELDS) {
      const pence = parseGBP(values[field.key])
      if (pence === null || pence < 0) {
        return setMessage({ error: true, text: `${field.label}: enter an amount of £0 or more` })
      }
      parsed[field.key] = pence
    }
    await saveSettings(db, { ...settings, ...parsed })
    setMessage({ error: false, text: 'Saved' })
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>Your numbers</h2>
      {NUMBER_FIELDS.map((field) => (
        <div key={field.key} className="field">
          <label htmlFor={`${id}-${field.key}`}>{field.label}</label>
          <MoneyInput
            id={`${id}-${field.key}`}
            value={values[field.key]}
            onChange={(v) => {
              setValues({ ...values, [field.key]: v })
              setMessage(null)
            }}
            describedBy={`${id}-${field.key}-hint`}
          />
          <p id={`${id}-${field.key}-hint`} className="muted small">
            {field.hint}
          </p>
        </div>
      ))}
      <p className={message?.error ? 'error' : 'muted'} role="status">
        {message?.text ?? ' '}
      </p>
      <button type="submit" className="button primary wide">
        Save numbers
      </button>
    </form>
  )
}

// --- Paydays ----------------------------------------------------------------

function Paydays({ today }: { today: ISODate }) {
  const [editing, setEditing] = useState<{
    month: MonthKey
    date: ISODate
    calculated: ISODate
  } | null>(null)
  const paydays = useLiveQuery(async () => {
    const [holidays, overrides] = await Promise.all([
      bankHolidays(db),
      db.paydayOverrides.toArray(),
    ])
    return upcomingPaydays(
      today,
      3,
      holidays,
      Object.fromEntries(overrides.map((o) => [o.month, o.date])),
    )
  }, [today])

  return (
    <section className="card">
      <h2>Paydays</h2>
      <p className="muted small">
        Worked out as the second-to-last working day of the month. Change one if you’re paid on a
        different day.
      </p>
      <ul className="rows">
        {paydays?.map((p) => (
          <li key={p.month} className="item">
            <div className="item-main static">
              <span className="item-name">{formatShortDate(p.date)}</span>
              <span className="muted small">
                {p.overridden
                  ? `Changed by you · usually ${formatShortDate(p.calculated)}`
                  : formatMonth(p.month)}
              </span>
            </div>
            <button className="chip" onClick={() => setEditing(p)}>
              Change
            </button>
          </li>
        ))}
      </ul>
      <Sheet
        open={editing !== null}
        title={editing ? `Payday in ${formatMonth(editing.month)}` : 'Payday'}
        onClose={() => setEditing(null)}
      >
        {editing && <PaydayForm {...editing} onClose={() => setEditing(null)} />}
      </Sheet>
    </section>
  )
}

function PaydayForm({
  month,
  date,
  calculated,
  onClose,
}: {
  month: MonthKey
  date: ISODate
  calculated: ISODate
  onClose: () => void
}) {
  const id = useId()
  const [value, setValue] = useState(date)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      assertISODate(value)
    } catch {
      return setError('Pick a date')
    }
    await setPaydayOverride(db, month, value === calculated ? null : value)
    onClose()
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor={`${id}-date`}>Paid on</label>
      <input
        id={`${id}-date`}
        type="date"
        className="text-input"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setError('')
        }}
      />
      <p className="muted small">Usually {formatShortDate(calculated)}.</p>
      <p className="error" role="alert">
        {error}
      </p>
      <div className="sheet-actions">
        <button
          type="button"
          className="button secondary"
          onClick={async () => {
            await setPaydayOverride(db, month, null)
            onClose()
          }}
        >
          Use usual date
        </button>
        <button type="submit" className="button primary">
          Save
        </button>
      </div>
    </form>
  )
}

// --- Bank holidays ----------------------------------------------------------

const NAMES = new Map(BANK_HOLIDAY_LIST.map((h) => [h.date, h.name]))

function BankHolidays({ today }: { today: ISODate }) {
  const id = useId()
  const [newDate, setNewDate] = useState('')
  const thisYear = today.slice(0, 4)
  const data = useLiveQuery(async () => {
    const [effective, edits] = await Promise.all([bankHolidays(db), db.bankHolidayEdits.toArray()])
    return { effective, edits }
  })

  const removed = new Set(data?.edits.filter((e) => e.action === 'remove').map((e) => e.date))
  const rows = [...new Set([...(data?.effective ?? []), ...removed])]
    .filter((d) => d >= today)
    .sort()
  const yearAhead = addDays(today, 365)
  const soon = rows.filter((d) => d <= yearAhead)
  const later = rows.filter((d) => d > yearAhead)

  const row = (date: ISODate) => {
    const isRemoved = removed.has(date)
    const bundled = NAMES.has(date)
    return (
      <li key={date} className={`item${isRemoved ? ' paused' : ''}`}>
        <div className="item-main static">
          <span className="item-name">
            {formatShortDate(date)} {date.slice(0, 4)}
          </span>
          <span className="muted small">
            {isRemoved ? 'Not counted' : (NAMES.get(date) ?? 'Added by you')}
          </span>
        </div>
        <button
          className="chip"
          onClick={() => setBankHolidayEdit(db, date, isRemoved || !bundled ? null : 'remove')}
        >
          {isRemoved ? 'Restore' : 'Remove'}
        </button>
      </li>
    )
  }
  const needsUpdate = Number(thisYear) >= BANK_HOLIDAYS_COVER_UNTIL_YEAR

  return (
    <section className="card">
      <h2>Bank holidays</h2>
      <p className="muted small">
        England &amp; Wales. Used to work out paydays.
        {needsUpdate &&
          ` The built-in list ends in ${BANK_HOLIDAYS_COVER_UNTIL_YEAR}; add next year’s from gov.uk/bank-holidays.`}
      </p>
      <p className="muted small spaced">Next 12 months</p>
      <ul className="rows">{soon.map(row)}</ul>
      {later.length > 0 && (
        <details className="more">
          <summary>Show later years ({later.length})</summary>
          <ul className="rows">{later.map(row)}</ul>
        </details>
      )}
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!newDate) return
          await setBankHolidayEdit(db, newDate, NAMES.has(newDate) ? null : 'add')
          setNewDate('')
        }}
      >
        <label htmlFor={`${id}-add`} className="visually-hidden">
          Add a bank holiday
        </label>
        <input
          id={`${id}-add`}
          type="date"
          className="text-input"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
        />
        <button type="submit" className="button secondary" disabled={!newDate}>
          Add
        </button>
      </form>
    </section>
  )
}
