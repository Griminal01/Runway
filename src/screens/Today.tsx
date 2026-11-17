import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { AmountSheet } from '../components/AmountSheet'
import { db } from '../lib/db'
import { formatShortDate, paydayLine, statusFor } from '../lib/format'
import {
  currentFoodWeek,
  formatGBP,
  safeToday,
  type DueOccurrence,
  type SafeTodayInput,
} from '../lib/money'
import { addFoodSpend, setBalance } from '../lib/store'

interface Props {
  input: SafeTodayInput
  balanceEnteredAt: string
  balanceEstimated: boolean
}

export function Today({ input, balanceEnteredAt, balanceEstimated }: Props) {
  const [sheet, setSheet] = useState<'balance' | 'food' | null>(null)
  const names = useLiveQuery(async () => {
    const [bills, pots] = await Promise.all([db.bills.toArray(), db.pots.toArray()])
    return new Map([...bills, ...pots].map((x) => [x.id, x.name]))
  })

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
        <button className="button primary" onClick={() => setSheet('food')}>
          Log food spend
        </button>
        <button className="button secondary" onClick={() => setSheet('balance')}>
          Update balance
        </button>
      </div>

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

      <details className="card">
        <summary>
          <h2>Where your money is</h2>
        </summary>
        <ul className="rows">
          <li className="row strong">
            <span>
              Balance{' '}
              <span className="muted">
                ({balanceEstimated ? `estimate after food spends, ${enteredLabel}` : enteredLabel})
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
