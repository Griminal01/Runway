import { useEffect, useId, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/**
 * Bottom sheet on the native <dialog>: focus trapping, Esc and the Android back gesture
 * all close it for free.
 */
export function Sheet({ open, title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog ref={ref} className="sheet" onClose={onClose} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      {open && children}
    </dialog>
  )
}

/** Money field used in sheets and forms: £ prefix, decimal keypad. */
export function MoneyInput({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  autoFocus,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  describedBy?: string
  autoFocus?: boolean
}) {
  return (
    <div className="money-input">
      <span aria-hidden="true">£</span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        autoFocus={autoFocus}
      />
    </div>
  )
}
