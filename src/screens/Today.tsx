import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { AmountSheet } from '../components/AmountSheet'
import { backupReminder } from '../lib/backup'
import { saveBackupFile } from '../lib/backupFile'
import { db } from '../lib/db'
import { formatMonth, formatShortDate, paydayLine, statusFor } from '../lib/format'
import {
  currentFoodWeek,
  formatGBP,
  monthKey,
  safeToday,
  simulateDebt,
  type DueOccurrence,
  type SafeTodayInput,
} from '../lib/money'
import {
  addFoodSpend,
  addIncome,
  debtEstimate,
  debtItemId,
  debtTerms,
  setBalance,
} from '../lib/store'

interface Props {
  input: SafeTodayInput
  balanceEnteredAt: string
  balanceEstimated: boolean
}

export function Today({ input, balanceEnteredAt, balanceEstimated }: Props) {
  const [sheet, setSheet] = useState<'balance' | 'food' | 'income' | null>(null)
  const lookup = useLiveQuery(async () => {
    const [bills, pots, debts, debtPayments] = await Promise.all([
      db.bills.toArray(),
      db.pots.toArray(),
      db.debts.toArray(),
      db.debtPayments.toArray(),
    ])
    return {
      names: new Map([
        ...[...bills, ...pots].map((x) => [x.id, x.name] as const),
        ...debts.map((d) => [debtItemId(d.id), `${d.name} payment`] as const),
      ]),
      debts: debts
        .filter((d) => d.active)
        .map((d) => {
          const owed = debtEstimate(d, debtPayments, input.today)
          const plan = simulateDebt(owed, debtTerms(d), d.monthlyPayment, input.today)
          return { id: d.id, name: d.name, owed, payoffDate: plan.payoffDate }
        })
        .filter((d) => d.owed > 0),
    }
  }, [input.today])
  const names = lookup?.names

  const settings = useLiveQuery(() => db.settings.get('main'))
  const reminder = settings ? backupReminder(settings) : null

  const result = safeToday(input)
  const status = statusFor(result, input.plannedDailySpend)
  const food = currentFoodWeek(input.today, input.food)
  const foodLeft = food.available - food.spent
  const foodPercent =
    food.available > 0 ? Math.min(100, Math.round((food.spent / food.available) * 100)) : 0

  const enteredDay = new Date(balanceEnteredAt)
  const enteredLabel = enteredDay.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  const minus = (pence: number) => (pence === 0 ? formatGBP(0) : `−${formatGBP(pence)}`)

  const lineItems = (items: DueOccurrence[]) =>
    items.map((item) => (
      <li key={`${item.id}-${item.dueDate}`} className="row sub">
        <span>
          {names?.get(item.id) ?? '…'}{' '}
          <span className="muted">{formatShortDate(item.dueDate)}</span>
        </span>
        <span className="amount">{formatGBP(item.amount)}</span>
      </li>
    ))

  return (
    <main className="stack">
      <section className={`hero ${result.colour}`} aria-live="polite">
        <p className="hero-label">Safe today</p>
        <p className="hero-amount amount">{formatGBP(result.display)}</p>
        <p className="hero-line">{paydayLine(result)}</p>
        <p className="status">
          <span className={`dot ${result.colour}`} aria-hidden="true" />
          <strong>{status.label}.</strong> {status.message}
        </p>
      </section>

      <div className="actions">
        <button className="button primary span-2" onClick={() => setSheet('food')}>
          Log food spend
        </button>
        <button className="button secondary" onClick={() => setSheet('income')}>
          Add income
        </button>
        <button className="button secondary" onClick={() => setSheet('balance')}>
          Update balance
        </button>
      </div>

      {reminder !== null && (
        <section className="card reminder">
          <p>
            {reminder === 'never'
              ? 'Your data is only on this phone. A backup keeps it safe if the phone is lost.'
              : `It’s been ${reminder} days since your last backup.`}
          </p>
          <button className="button secondary wide spaced" onClick={() => void saveBackupFile(db)}>
            Save a backup
          </button>
        </section>
      )}

      <section className="card">
        <h2>Food this week</h2>
        <div
          className="bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={foodPercent}
          aria-label="Food money used this week"
        >
          <div
            className={`bar-fill${food.overspend > 0 ? ' over' : ''}`}
            style={{ width: `${foodPercent}%` }}
          />
        </div>
        <ul className="rows">
          <li className="row">
            <span>Spent</span>
            <span className="amount">{formatGBP(food.spent)}</span>
          </li>
          <li className="row">
            <span>
              Available{' '}
              {food.carriedIn > 0 && (
                <span className="muted">(incl. {formatGBP(food.carriedIn)} rolled over)</span>
              )}
            </span>
            <span className="amount">{formatGBP(food.available)}</span>
          </li>
          <li className="row strong">
            <span>{foodLeft >= 0 ? 'Left this week' : 'Over this week'}</span>
            <span className="amount">{formatGBP(Math.abs(foodLeft))}</span>
          </li>
        </ul>
        <a className="link" href="#/food">
          See food spends
        </a>
        {food.overspend > 0 && (
          <p className="muted">
            The extra {formatGBP(food.overspend)} comes out of Safe today. Next week’s food money is
            untouched.
          </p>
        )}
      </section>

      {lookup?.debts.map((d) => (
        <a key={d.id} className="card card-link" href="#/debt">
          <span>
            <strong>{d.name}</strong>
            <span className="muted small block">
              {d.payoffDate
                ? `Paid off ${formatMonth(monthKey(d.payoffDate))} on your plan`
                : 'See your plan'}
            </span>
          </span>
          <span className="amount strong">{formatGBP(d.owed)}</span>
        </a>
      ))}

      <details className="card">
        <summary>
          <h2>Where your money is</h2>
        </summary>
        <ul className="rows">
          <li className="row strong">
            <span>
              Balance{' '}
              <span className="muted">
                (
                {balanceEstimated
                  ? `estimate after logged spends and income, ${enteredLabel}`
                  : enteredLabel}
                )
              </span>
            </span>
            <span className="amount">{formatGBP(result.balance)}</span>
          </li>
          <li className="row">
            <span>Bills to come</span>
            <span className="amount">{minus(result.billsTotal)}</span>
          </li>
          {lineItems(result.billsDue)}
          <li className="row">
            <span>Food set aside</span>
            <span className="amount">{minus(result.foodRemaining)}</span>
          </li>
          <li className="row">
            <span>Pots</span>
            <span className="amount">{minus(result.potsTotal)}</span>
          </li>
          {lineItems(result.potsDue)}
          <li className="row">
            <span>Buffer</span>
            <span className="amount">{minus(result.buffer)}</span>
          </li>
          <li className="row strong total">
            <span>Spare until payday</span>
            <span className="amount">{formatGBP(result.spare)}</span>
          </li>
          <li className="row">
            <span>Shared over {result.days === 1 ? '1 day' : `${result.days} days`}</span>
            <span className="amount">{formatGBP(result.display)} a day</span>
          </li>
        </ul>
      </details>

      <AmountSheet
        open={sheet === 'food'}
        title="Log food spend"
        label="Amount"
        hint="Comes off this week’s food money and your balance."
        withNote
        submitLabel="Log it"
        onSubmit={async (amount, note) => {
          await addFoodSpend(db, input.today, amount, note)
        }}
        onClose={() => setSheet(null)}
      />
      <AmountSheet
        open={sheet === 'income'}
        title="Add income"
        label="Amount received"
        hint="Money in apart from your pay, e.g. selling something. Added to your balance."
        withNote
        submitLabel="Add it"
        onSubmit={async (amount, note) => {
          await addIncome(db, input.today, amount, note)
        }}
        onClose={() => setSheet(null)}
      />
      <AmountSheet
        open={sheet === 'balance'}
        title="Update balance"
        label="Current balance"
        hint="What your current account shows right now."
        initial={input.balance}
        allowNegative
        submitLabel="Save"
        onSubmit={async (amount) => {
          await setBalance(db, amount)
        }}
        onClose={() => setSheet(null)}
      />
    </main>
  )
}
