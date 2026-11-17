import { useId, useState, type FormEvent } from 'react'
import { parseGBP, type ISODate, type Pence } from '../lib/money'
import { penceToInput } from '../lib/format'
import { MoneyInput, Sheet } from './Sheet'

interface Props {
  open: boolean
  title: string
  label: string
  hint?: string
  initial?: Pence
  allowNegative?: boolean
  withNote?: boolean
  /** Show a date field, defaulting to this date. Dates after it can't be picked. */
  withDate?: ISODate
  submitLabel: string
  onSubmit: (amount: Pence, note: string, date: ISODate | undefined) => Promise<void>
  onClose: () => void
}

/** Bottom sheet for entering one amount, optionally with a note and date. */
export function AmountSheet(props: Props) {
  return (
    <Sheet open={props.open} title={props.title} onClose={props.onClose}>
      <AmountForm {...props} />
    </Sheet>
  )
}

function AmountForm({
  label,
  hint,
  initial,
  allowNegative = false,
  withNote = false,
  withDate,
  submitLabel,
  onSubmit,
  onClose,
}: Props) {
  const id = useId()
  const [text, setText] = useState(initial === undefined ? '' : penceToInput(initial))
  const [note, setNote] = useState('')
  const [date, setDate] = useState(withDate ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const amount = parseGBP(text)
    if (amount === null) return setError('Enter an amount like 12.50')
    if (!allowNegative && amount <= 0) return setError('Enter an amount above £0')
    if (withDate && (!date || date > withDate)) return setError('Pick today or an earlier day')
    setSaving(true)
    try {
      await onSubmit(amount, note, withDate ? date : undefined)
      onClose()
    } catch {
      setError('That didn’t save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor={`${id}-amount`}>{label}</label>
      <MoneyInput
        id={`${id}-amount`}
        value={text}
        onChange={(v) => {
          setText(v)
          setError('')
        }}
        invalid={!!error}
        describedBy={`${id}-hint`}
        autoFocus
      />
      <p id={`${id}-hint`} className={error ? 'error' : 'muted'}>
        {error || hint || ' '}
      </p>
      {withDate && (
        <>
          <label htmlFor={`${id}-date`}>Day</label>
          <input
            id={`${id}-date`}
            type="date"
            className="text-input"
            value={date}
            max={withDate}
            onChange={(e) => {
              setDate(e.target.value)
              setError('')
            }}
          />
        </>
      )}
      {withNote && (
        <>
          <label htmlFor={`${id}-note`}>Note (optional)</label>
          <input
            id={`${id}-note`}
            className="text-input"
            value={note}
            maxLength={60}
            onChange={(e) => setNote(e.target.value)}
          />
        </>
      )}
      <div className="sheet-actions">
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="button primary" disabled={saving}>
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
