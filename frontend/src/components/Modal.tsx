import { type ReactNode } from 'react'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
  /** Tighter paddings — for form-heavy dialogs that need to fit more on screen. */
  dense?: boolean
}

export default function Modal({ open, title, onClose, children, footer, width = 540, dense = false }: Props) {
  if (!open) return null
  const headPad = dense ? '12px 18px' : '16px 22px'
  const bodyPad = dense ? '14px 18px' : 22
  const footPad = dense ? '12px 18px' : '14px 22px'
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(28,27,25,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-bg-white)',
          border: '1px solid var(--color-border)',
          borderRadius: 16,
          boxShadow: 'var(--shadow-lg)',
          width: '100%',
          maxWidth: width,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: headPad,
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-primary)' }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.4rem',
              color: 'var(--color-text-light)',
              cursor: 'pointer',
              lineHeight: 1,
            }}
            aria-label="סגור"
          >
            ×
          </button>
        </div>
        <div style={{ padding: bodyPad, overflowY: 'auto' }}>{children}</div>
        {footer && (
          <div
            style={{
              padding: footPad,
              borderTop: '1px solid var(--color-border)',
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-end',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// Form input helpers used across admin screens.
export function Field({
  label,
  children,
  hint,
  inline = false,
}: {
  label: string
  children: ReactNode
  hint?: string
  /** Render the label on the same line as the input (label first, then field). */
  inline?: boolean
}) {
  const hintNode = hint && (
    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-light)', marginTop: 4 }}>
      {hint}
    </div>
  )

  if (inline) {
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label
            style={{
              fontSize: '0.78rem',
              fontWeight: 600,
              color: 'var(--color-text-light)',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </label>
          <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        </div>
        {hintNode}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          display: 'block',
          fontSize: '0.78rem',
          fontWeight: 600,
          color: 'var(--color-text-light)',
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
      {hintNode}
    </div>
  )
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg)',
  fontFamily: 'inherit',
  fontSize: '0.92rem',
  color: 'var(--color-text)',
}
