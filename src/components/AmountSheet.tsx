import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { formatGBP, parseGBP, type Pence } from '../lib/money'

interface Props {
  open: boolean
  title: string
  label: string
  hint?: string
  initial?: Pence
  allowNegative?: boolean
  withNote?: boolean
  submitLabel: string
  onSubmit: (amount: Pence, note: string) => Promise<void>
  onClose: () => void
}

/** Bottom sheet for entering one amount. Uses the native <dialog> for focus and back-button handling. */
export function AmountSheet({
  open,
  title,
  label,
  hint,
  initial,
  allowNegative = false,
  withNote = false,
  submitLabel,
  onSubmit,
  onClose,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setText(initial === undefined ? '' : formatGBP(initial).replace(/[£,]/g, ''))
      setNote('')
      setError('')
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open, initial])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const amount = parseGBP(text)
    if (amount === null) {
      setError('Enter an amount like 12.50')
      return
    }
    if (!allowNegative && amount <= 0) {
      setError('Enter an amount above £0')
      return
    }
    setSaving(true)
    try {
      await onSubmit(amount, note)
      onClose()
    } catch {
      setError('That didn’t save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog ref={ref} className="sheet" onClose={onClose} aria-labelledby={`${id}-title`}>
      <form onSubmit={submit}>
        <h2 id={`${id}-title`}>{title}</h2>
        <label htmlFor={`${id}-amount`}>{label}</label>
        <div className="money-input">
          <span aria-hidden="true">£</span>
          <input
            id={`${id}-amount`}
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setError('')
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-hint`}
            autoFocus
          />
        </div>
        <p id={`${id}-hint`} className={error ? 'error' : 'muted'}>
          {error || hint || ' '}
        </p>
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
    </dialog>
  )
}
