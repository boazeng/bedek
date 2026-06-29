import { useEffect, useMemo, useState } from 'react'
import Modal from '../Modal'
import { inputStyle } from '../Modal'
import type { CrmCustomer } from '../../lib/api'

type Props = {
  open: boolean
  unitLabel: string
  customers: CrmCustomer[]
  selectedIds: number[]
  onClose: () => void
  onSave: (membershipIds: number[]) => Promise<void>
}

/** Searchable multi-select of CRM customers to link to a sale unit. */
export default function UnitCustomersModal({ open, unitLabel, customers, selectedIds, onClose, onSave }: Props) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set(selectedIds))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setSelected(new Set(selectedIds))
      setSearch('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        (c.customer_number || '').toLowerCase().includes(q) ||
        (c.nickname || '').toLowerCase().includes(q),
    )
  }, [customers, search])

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function save() {
    setBusy(true)
    try {
      await onSave([...selected])
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={`לקוחות — ${unitLabel}`}
      onClose={onClose}
      footer={
        <>
          <button className="tact-btn tact-btn-ghost" onClick={onClose} disabled={busy}>
            ביטול
          </button>
          <button className="tact-btn tact-btn-primary" onClick={save} disabled={busy}>
            {busy ? 'שומר…' : `שמור (${selected.size})`}
          </button>
        </>
      }
    >
      <input
        style={{ ...inputStyle, marginBottom: 10 }}
        value={search}
        placeholder="חיפוש לקוח לפי שם / מספר…"
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />
      <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {filtered.length === 0 ? (
          <div style={{ color: 'var(--color-text-light)', fontSize: '0.85rem', padding: '10px 4px' }}>
            לא נמצאו לקוחות. הוסף לקוחות בעמוד "לקוחות".
          </div>
        ) : (
          filtered.map((c) => (
            <label
              key={c.membership_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 8px',
                borderRadius: 8,
                cursor: 'pointer',
                background: selected.has(c.membership_id) ? 'var(--color-primary-soft)' : 'transparent',
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(c.membership_id)}
                onChange={() => toggle(c.membership_id)}
              />
              <span style={{ fontWeight: 600 }}>{c.full_name}</span>
              {c.customer_number && (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>#{c.customer_number}</span>
              )}
              {c.nickname && (
                <span style={{ fontSize: '0.78rem', color: 'var(--color-text-light)' }}>({c.nickname})</span>
              )}
              {c.phone && (
                <span style={{ marginInlineStart: 'auto', fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                  {c.phone}
                </span>
              )}
            </label>
          ))
        )}
      </div>
    </Modal>
  )
}
