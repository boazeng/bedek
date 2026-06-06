import type { ReactNode } from 'react'

export type Column<T> = {
  header: string
  key: keyof T | string
  render?: (row: T) => ReactNode
  width?: number | string
  align?: 'start' | 'center' | 'end'
}

type Props<T> = {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string | number
  empty?: string
  actions?: (row: T) => ReactNode
}

export default function DataTable<T>({ rows, columns, rowKey, empty, actions }: Props<T>) {
  if (rows.length === 0) {
    return (
      <div
        style={{
          padding: '40px 20px',
          textAlign: 'center',
          background: 'var(--color-bg-white)',
          border: '1px dashed var(--color-border)',
          borderRadius: 14,
          color: 'var(--color-text-light)',
        }}
      >
        {empty || 'אין נתונים להצגה'}
      </div>
    )
  }
  return (
    <div
      style={{
        background: 'var(--color-bg-white)',
        border: '1px solid var(--color-border)',
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--color-primary-soft)' }}>
            {columns.map((c) => (
              <th
                key={String(c.key)}
                style={{
                  textAlign: c.align || 'start',
                  padding: '12px 16px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: 'var(--color-primary)',
                  letterSpacing: '0.02em',
                  width: c.width,
                }}
              >
                {c.header}
              </th>
            ))}
            {actions && (
              <th style={{ padding: '12px 16px', width: 120 }} />
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row)}
              style={{
                borderTop: i === 0 ? undefined : '1px solid var(--color-border)',
                fontSize: '0.9rem',
              }}
            >
              {columns.map((c) => (
                <td
                  key={String(c.key)}
                  style={{
                    padding: '12px 16px',
                    textAlign: c.align || 'start',
                    color: 'var(--color-text)',
                  }}
                >
                  {c.render ? c.render(row) : String((row as any)[c.key] ?? '')}
                </td>
              ))}
              {actions && (
                <td style={{ padding: '8px 16px', textAlign: 'end' }}>{actions(row)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
