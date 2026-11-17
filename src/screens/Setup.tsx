import { useState, type FormEvent } from 'react'
import { db } from '../lib/db'
import { parseGBP, type ISODate } from '../lib/money'
import { saveSettings, setBalance } from '../lib/store'

interface Field {
  key: 'balance' | 'weeklyFoodFloor' | 'buffer' | 'plannedDailySpend'
  label: string
  hint: string
  allowNegative?: boolean
}

const FIELDS: Field[] = [
  {
    key: 'balance',
    label: 'Current balance',
    hint: 'What your current account shows right now.',
    allowNegative: true,
  },
  {
    key: 'weeklyFoodFloor',
    label: 'Food per week',
    hint: 'Set aside every Monday to Sunday. Never counted as spendable.',
  },
  { key: 'buffer', label: 'Buffer', hint: 'Kept back for surprises. Can be £0.' },
  {
    key: 'plannedDailySpend',
    label: 'Usual daily spend',
    hint: 'What a normal day of non-food spending looks like for you.',
  },
]

/** First run: the four numbers Safe today needs. Bills and pots come next. */
export function Setup({ today }: { today: ISODate }) {
  const [values, setValues] = useState<Record<Field['key'], string>>({
    balance: '',
    weeklyFoodFloor: '',
    buffer: '0',
    plannedDailySpend: '',
  })
  const [errors, setErrors] = useState<Partial<Record<Field['key'], string>>>({})
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const parsed: Partial<Record<Field['key'], number>> = {}
    const nextErrors: typeof errors = {}
    for (const field of FIELDS) {
      const amount = parseGBP(values[field.key])
      if (amount === null) nextErrors[field.key] = 'Enter an amount like 12.50'
      else if (amount < 0 && !field.allowNegative) nextErrors[field.key] = 'Can’t be below £0'
      else parsed[field.key] = amount
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSaving(true)
    try {
      await db.transaction('rw', db.settings, db.balance, async () => {
        await saveSettings(db, {
          buffer: parsed.buffer!,
          weeklyFoodFloor: parsed.weeklyFoodFloor!,
          plannedDailySpend: parsed.plannedDailySpend!,
          foodTrackingStart: today,
        })
        await setBalance(db, parsed.balance!)
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <main>
      <h1>Welcome to Runway</h1>
      <p className="muted">
        Four numbers and you’ll see what’s safe to spend today. Everything stays on this phone.
      </p>
      <form className="stack" onSubmit={submit} noValidate>
        {FIELDS.map((field) => (
          <div key={field.key} className="field">
            <label htmlFor={field.key}>{field.label}</label>
            <div className="money-input">
              <span aria-hidden="true">£</span>
              <input
                id={field.key}
                inputMode="decimal"
                autoComplete="off"
                value={values[field.key]}
                onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                aria-invalid={errors[field.key] ? true : undefined}
                aria-describedby={`${field.key}-hint`}
              />
            </div>
            <p id={`${field.key}-hint`} className={errors[field.key] ? 'error' : 'muted'}>
              {errors[field.key] ?? field.hint}
            </p>
          </div>
        ))}
        <button type="submit" className="button primary wide" disabled={saving}>
          Show Safe today
        </button>
      </form>
    </main>
  )
}
