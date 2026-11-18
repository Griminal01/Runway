import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState, type FormEvent } from 'react'
import { AmountSheet } from '../components/AmountSheet'
import { MoneyInput, Sheet } from '../components/Sheet'
import { db, type Debt as DebtRow, type DebtPayment } from '../lib/db'
import { formatMonth, formatShortDate, ordinal, penceToInput, plural } from '../lib/format'
import {
  addDays,
  estimatedMinimum,
  formatAPR,
  formatGBP,
  monthKey,
  parseAPR,
  parseGBP,
  paymentToClearBy,
  safeToday,
  simulateDebt,
  spareForDebt,
  type DebtProjection,
  type SafeTodayInput,
} from '../lib/money'
import {
  addDebt,
  addDebtPayment,
  debtEstimate,
  debtTerms,
  deleteDebt,
  deleteDebtPayment,
  setDebtBalance,
  updateDebt,
} from '../lib/store'

function payoffLine(p: DebtProjection): string {
  if (p.stuck) return 'This doesn’t cover the interest, so it would never be paid off.'
  if (!p.payoffDate) return 'Paid off.'
  return `Paid off ${formatMonth(monthKey(p.payoffDate))} · ${plural(p.steps.length, 'payment')} · ${formatGBP(p.totalInterest)} interest`
}

export function Debt({ input }: { input: SafeTodayInput }) {
  const [adding, setAdding] = useState(false)
  const data = useLiveQuery(async () => {
    const [debts, payments] = await Promise.all([db.debts.toArray(), db.debtPayments.toArray()])
    return { debts, payments }
  })

  return (
    <main className="stack">
      <h1>Debt</h1>
      {data?.debts.length === 0 && (
        <section className="card">
          <p>
            Add a debt you want to clear, like PayPal Credit. Runway counts the monthly payment like
            a bill, shows when it’ll be paid off, and points out spare money you could put towards
            it.
          </p>
        </section>
      )}
      {data?.debts.map((debt) => (
        <DebtCard key={debt.id} debt={debt} payments={data.payments} input={input} />
      ))}
      <button className="button secondary wide" onClick={() => setAdding(true)}>
        Add a debt
      </button>
      <Sheet open={adding} title="Add a debt" onClose={() => setAdding(false)}>
        {adding && <DebtForm debt={null} onClose={() => setAdding(false)} />}
      </Sheet>
    </main>
  )
}

function DebtCard({
  debt,
  payments,
  input,
}: {
  debt: DebtRow
  payments: DebtPayment[]
  input: SafeTodayInput
}) {
  const today = input.today
  const [sheet, setSheet] = useState<'extra' | 'balance' | 'edit' | null>(null)
  const [selected, setSelected] = useState<DebtPayment | null>(null)
  const [tryText, setTryText] = useState('')

  const terms = debtTerms(debt)
  const owed = debtEstimate(debt, payments, today)
  const plan = simulateDebt(owed, terms, debt.monthlyPayment, today)
  const minimum = simulateDebt(owed, terms, estimatedMinimum, today)
  const paidOff = Math.max(0, debt.startBalance - owed)
  const percent = debt.startBalance > 0 ? Math.round((paidOff / debt.startBalance) * 100) : 100

  const spare = spareForDebt(safeToday(input), input.plannedDailySpend)
  const spareUse = Math.min(spare, owed)
  const withSpare = simulateDebt(owed - spareUse, terms, debt.monthlyPayment, today)

  const promo =
    debt.interestFreeUntil && debt.interestFreeUntil >= today
      ? paymentToClearBy(owed, debt.dayOfMonth, today, debt.interestFreeUntil)
      : null

  const tryPence = parseGBP(tryText)
  const tryPlan =
    tryPence !== null && tryPence > 0 ? simulateDebt(owed, terms, tryPence, today) : null

  const mine = payments
    .filter((p) => p.debtId === debt.id)
    .sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : -1))
    .slice(0, 5)

  const sheets = (
    <>
      <AmountSheet
        open={sheet === 'extra'}
        title={`Pay extra off ${debt.name}`}
        label="Amount paid"
        hint="Comes off your bank balance and what you owe."
        initial={spareUse > 0 ? spareUse : undefined}
        withDate={today}
        submitLabel="Log payment"
        onSubmit={async (amount, _note, date) => {
          await addDebtPayment(db, debt.id, date ?? today, amount)
        }}
        onClose={() => setSheet(null)}
      />
      <AmountSheet
        open={sheet === 'balance'}
        title={`What you owe on ${debt.name}`}
        label="Balance owed"
        hint="What the PayPal app shows right now. Replaces the estimate."
        initial={owed}
        allowNegative={false}
        submitLabel="Save"
        onSubmit={async (amount) => {
          await setDebtBalance(db, debt.id, amount)
        }}
        onClose={() => setSheet(null)}
      />
      <Sheet open={sheet === 'edit'} title={`Edit ${debt.name}`} onClose={() => setSheet(null)}>
        {sheet === 'edit' && <DebtForm debt={debt} onClose={() => setSheet(null)} />}
      </Sheet>
    </>
  )

  if (owed === 0) {
    return (
      <section className="card">
        <h2>{debt.name}</h2>
        <p className="hero-amount green-text amount">£0.00</p>
        <p>Paid off. That’s {formatGBP(debt.startBalance)} cleared.</p>
        <p className="muted small">It no longer counts in Safe today.</p>
        <div className="actions spaced">
          <button className="button secondary" onClick={() => setSheet('balance')}>
            Update balance
          </button>
          <button className="button secondary" onClick={() => setSheet('edit')}>
            Edit
          </button>
        </div>
        {sheets}
      </section>
    )
  }

  return (
    <>
      <section className="card">
        <h2 className="row-heading">
          <span>{debt.name}</span>
          <span className="muted small">{formatAPR(debt.aprBp)} APR</span>
        </h2>
        <p className="debt-amount amount">{formatGBP(owed)}</p>
        <p className="muted small">
          {owed === debt.balance
            ? `Owed, as typed in ${formatShortDate(debt.balanceUpdatedAt.slice(0, 10))}`
            : 'Owed today (estimate from payments since you last updated it)'}
        </p>
        <div
          className="bar spaced"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Paid off so far"
        >
          <div className="bar-fill" style={{ width: `${percent}%` }} />
        </div>
        <p className="small">
          {formatGBP(paidOff)} paid off of {formatGBP(debt.startBalance)} ({percent}%)
        </p>
      </section>

      <section className="card">
        <h2>Your plan</h2>
        <ul className="rows">
          <li className="row strong">
            <span>
              {formatGBP(debt.monthlyPayment)} a month on the {ordinal(debt.dayOfMonth)}
            </span>
          </li>
        </ul>
        <p>{payoffLine(plan)}</p>
        <p className="muted small spaced">
          Minimum payments only (estimated): {payoffLine(minimum).replace('Paid off', 'paid off')}
        </p>
        {!plan.stuck && !minimum.stuck && minimum.totalInterest > plan.totalInterest && (
          <p className="small spaced">
            Your plan saves about {formatGBP(minimum.totalInterest - plan.totalInterest)} in
            interest compared with minimum payments.
          </p>
        )}
      </section>

      {promo && (
        <section className="card reminder">
          <h2>0% until {formatShortDate(debt.interestFreeUntil!)}</h2>
          <p className="spaced">
            {debt.monthlyPayment >= promo.perPayment
              ? `Your plan clears it before interest starts on ${formatShortDate(addDays(debt.interestFreeUntil!, 1))}.`
              : `Paying ${formatGBP(promo.perPayment)} a month (${plural(promo.payments, 'payment')}) clears it before interest starts on ${formatShortDate(addDays(debt.interestFreeUntil!, 1))}.`}
          </p>
          <p className="muted small">
            If only part of the balance is on 0%, this is a rough guide: check PayPal for the exact
            split.
          </p>
        </section>
      )}

      <section className="card">
        <h2>Pay it off sooner</h2>
        {spareUse > 0 ? (
          <>
            <p className="spaced">
              You could pay <strong>{formatGBP(spareUse)}</strong> extra now and still have your
              usual {formatGBP(input.plannedDailySpend)} a day until payday.
            </p>
            {!withSpare.stuck && withSpare.steps.length < plan.steps.length && (
              <p className="muted small">
                That would clear it {plural(plan.steps.length - withSpare.steps.length, 'month')}{' '}
                sooner and save about {formatGBP(plan.totalInterest - withSpare.totalInterest)}{' '}
                interest.
              </p>
            )}
          </>
        ) : (
          <p className="muted spaced">
            Nothing spare above your usual daily spend right now. Your regular payment is already
            set aside.
          </p>
        )}
        <button className="button primary wide spaced" onClick={() => setSheet('extra')}>
          Pay extra
        </button>
      </section>

      <section className="card">
        <h2>What if I paid…</h2>
        <label htmlFor={`try-${debt.id}`} className="visually-hidden">
          Monthly amount to try
        </label>
        <div className="inline-form">
          <MoneyInput id={`try-${debt.id}`} value={tryText} onChange={setTryText} />
        </div>
        <p className="small spaced" aria-live="polite">
          {tryPlan ? payoffLine(tryPlan) : 'Type a monthly amount to compare.'}
        </p>
        {tryPlan && !tryPlan.stuck && tryPence !== debt.monthlyPayment && (
          <button
            className="button secondary wide"
            onClick={async () => {
              await updateDebt(db, debt.id, {
                name: debt.name,
                balance: debt.balance,
                aprBp: debt.aprBp,
                monthlyPayment: tryPence!,
                dayOfMonth: debt.dayOfMonth,
                active: debt.active,
                ...(debt.interestFreeUntil ? { interestFreeUntil: debt.interestFreeUntil } : {}),
              })
              setTryText('')
            }}
          >
            Make {formatGBP(tryPence!)} my monthly payment
          </button>
        )}
      </section>

      {mine.length > 0 && (
        <section className="card">
          <h2>Extra payments</h2>
          <ul className="rows">
            {mine.map((p) => (
              <li key={p.id}>
                <button className="row row-button" onClick={() => setSelected(p)}>
                  <span>{formatShortDate(p.date)}</span>
                  <span className="amount">{formatGBP(p.amount)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="actions">
        <button className="button secondary" onClick={() => setSheet('balance')}>
          Update balance
        </button>
        <button className="button secondary" onClick={() => setSheet('edit')}>
          Edit
        </button>
      </div>

      {sheets}
      <Sheet open={selected !== null} title="Extra payment" onClose={() => setSelected(null)}>
        {selected && (
          <>
            <p className="sheet-figure amount">{formatGBP(selected.amount)}</p>
            <p className="muted">{formatShortDate(selected.date)}</p>
            <p className="muted">
              Deleting puts it back on your bank balance and the amount owed, unless you’ve typed
              either in since.
            </p>
            <div className="sheet-actions">
              <button className="button secondary" onClick={() => setSelected(null)}>
                Keep
              </button>
              <button
                className="button danger"
                onClick={async () => {
                  await deleteDebtPayment(db, selected.id!)
                  setSelected(null)
                }}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </Sheet>
    </>
  )
}

function DebtForm({ debt, onClose }: { debt: DebtRow | null; onClose: () => void }) {
  const id = useId()
  const [name, setName] = useState(debt?.name ?? 'PayPal Credit')
  const [balance, setBalance] = useState(debt ? penceToInput(debt.balance) : '')
  const [apr, setApr] = useState(debt ? String(debt.aprBp / 100) : '23.9')
  const [payment, setPayment] = useState(debt ? penceToInput(debt.monthlyPayment) : '')
  const [day, setDay] = useState(debt ? String(debt.dayOfMonth) : '')
  const [hasPromo, setHasPromo] = useState(debt?.interestFreeUntil !== undefined)
  const [promoDate, setPromoDate] = useState(debt?.interestFreeUntil ?? '')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const bal = parseGBP(balance)
    const pay = parseGBP(payment)
    const aprBp = parseAPR(apr)
    const dayNum = Number(day)
    if (!name.trim()) return setError('Give it a name')
    if (bal === null || bal < 0) return setError('Enter what you owe, like 850.00')
    if (aprBp === null) return setError('Enter the APR as a percentage, like 23.9')
    if (pay === null || pay <= 0) return setError('Enter a monthly payment above £0')
    if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) {
      return setError('Payment day must be 1 to 31')
    }
    if (hasPromo && !/^\d{4}-\d{2}-\d{2}$/.test(promoDate)) {
      return setError('Pick the date the 0% offer ends')
    }
    const input = {
      name,
      balance: bal,
      aprBp,
      monthlyPayment: pay,
      dayOfMonth: dayNum,
      active: debt?.active ?? true,
      ...(hasPromo ? { interestFreeUntil: promoDate } : {}),
    }
    try {
      if (debt) await updateDebt(db, debt.id, input)
      else await addDebt(db, input)
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
      />
      <label htmlFor={`${id}-bal`} className="spaced">
        Owed now
      </label>
      <MoneyInput id={`${id}-bal`} value={balance} onChange={setBalance} />
      <label htmlFor={`${id}-apr`} className="spaced">
        APR (%)
      </label>
      <input
        id={`${id}-apr`}
        className="text-input"
        inputMode="decimal"
        value={apr}
        onChange={(e) => setApr(e.target.value)}
        aria-describedby={`${id}-aprhint`}
      />
      <p id={`${id}-aprhint`} className="muted small">
        On your PayPal statement. 23.9% is PayPal Credit’s usual rate.
      </p>
      <label htmlFor={`${id}-pay`}>Monthly payment</label>
      <MoneyInput id={`${id}-pay`} value={payment} onChange={setPayment} />
      <label htmlFor={`${id}-day`} className="spaced">
        Payment day of the month
      </label>
      <input
        id={`${id}-day`}
        className="text-input"
        inputMode="numeric"
        value={day}
        maxLength={2}
        onChange={(e) => setDay(e.target.value.replace(/\D/g, ''))}
      />
      <label className="toggle">
        <input type="checkbox" checked={hasPromo} onChange={(e) => setHasPromo(e.target.checked)} />
        <span>On a 0% offer</span>
      </label>
      {hasPromo && (
        <>
          <label htmlFor={`${id}-promo`}>0% ends on</label>
          <input
            id={`${id}-promo`}
            type="date"
            className="text-input"
            value={promoDate}
            onChange={(e) => setPromoDate(e.target.value)}
          />
        </>
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
      {debt && (
        <button
          type="button"
          className="button danger wide spaced"
          onClick={async () => {
            if (!confirmDelete) return setConfirmDelete(true)
            await deleteDebt(db, debt.id)
            onClose()
          }}
        >
          {confirmDelete ? 'Tap again to delete' : 'Delete'}
        </button>
      )}
    </form>
  )
}
