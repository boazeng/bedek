import { useEffect, useState } from 'react'
import type { SaleUnitType } from '../../lib/api'

/** Broadcast "collapse all / expand all" command. `n` bumps on every click so
 *  floors re-apply `all` even if its value is unchanged. */
export type CollapseCmd = { all: boolean; n: number }

/** Public-area units always belong to the house committee. */
export const PUBLIC_OWNER = 'הועד'

/** The "floor number" used as a public-area unit's number:
 *  ground (קרקע) → "00", basement (מרתף) → "-01" (-02 for a 2nd basement…),
 *  numbered floor (קומה 3) → "3". Special floors are checked first because
 *  their names may also contain a digit. */
export function floorNumberLabel(floorName: string): string {
  if (floorName.includes('מרתף')) {
    const m = floorName.match(/(\d+)/)
    const n = m ? Number(m[1]) : 1
    return `-${String(n).padStart(2, '0')}`
  }
  if (floorName.includes('קרקע')) return '00'
  const m = floorName.match(/(\d+)/)
  return m ? m[1] : floorName
}

export const UNIT_TYPE_OPTIONS: { value: SaleUnitType; label: string }[] = [
  { value: 'apartment', label: 'דירה' },
  { value: 'parking', label: 'חניה' },
  { value: 'storage', label: 'מחסן' },
  { value: 'shop', label: 'חנות' },
  { value: 'public_area', label: 'ציבורי' },
]

export const UNIT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  UNIT_TYPE_OPTIONS.map((o) => [o.value, o.label]),
)

/** Small ghost action button used throughout the builder rows. */
export function MiniBtn({
  onClick,
  children,
  danger,
  title,
}: {
  onClick: () => void
  children: React.ReactNode
  danger?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="tact-btn tact-btn-ghost"
      style={{
        padding: '4px 10px',
        fontSize: '0.78rem',
        color: danger ? 'var(--color-accent)' : undefined,
      }}
    >
      {children}
    </button>
  )
}

/** Inline-editable text. Commits on blur / Enter when changed. */
export function EditableText({
  value,
  onSave,
  placeholder,
  width,
  bold,
}: {
  value: string
  onSave: (next: string) => void
  placeholder?: string
  width?: number | string
  bold?: boolean
}) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])

  function commit() {
    const next = v.trim()
    if (next !== value) onSave(next)
  }

  return (
    <input
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setV(value)
      }}
      style={{
        width: width ?? 'auto',
        border: '1px solid transparent',
        borderRadius: 6,
        padding: '4px 8px',
        font: 'inherit',
        fontWeight: bold ? 700 : 500,
        background: 'transparent',
        color: 'var(--color-text)',
      }}
      onFocus={(e) => {
        e.target.style.borderColor = 'var(--color-border)'
        e.target.style.background = 'var(--color-bg-white)'
      }}
      onMouseEnter={(e) => {
        if (document.activeElement !== e.currentTarget)
          e.currentTarget.style.borderColor = 'var(--color-border)'
      }}
      onMouseLeave={(e) => {
        if (document.activeElement !== e.currentTarget)
          e.currentTarget.style.borderColor = 'transparent'
      }}
    />
  )
}
