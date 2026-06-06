import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import {
  SystemLocations,
  Templates,
  type TemplateListRow,
} from '../lib/api'

export type PickResult =
  | { kind: 'location'; name: string }
  | { kind: 'template'; id: number; name: string }

type Props = {
  open: boolean
  onClose: () => void
  onPick: (result: PickResult) => void
  /** Template id to exclude from the templates tab (prevents self-reference). */
  excludeTemplateId?: number | null
}

type TabKey = 'locations' | 'templates'

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '10px 14px',
  border: 'none',
  background: active ? 'var(--color-primary)' : 'transparent',
  color: active ? 'var(--color-text-white)' : 'var(--color-text-light)',
  fontFamily: 'inherit',
  fontSize: '0.92rem',
  fontWeight: active ? 600 : 500,
  cursor: 'pointer',
  borderRadius: 999,
  transition: 'background .15s, color .15s',
})

const listBtnStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'start',
  padding: '8px 12px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  borderRadius: 6,
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  color: 'var(--color-text)',
}

export default function EntityPicker({
  open,
  onClose,
  onPick,
  excludeTemplateId,
}: Props) {
  const [tab, setTab] = useState<TabKey>('locations')
  const [locations, setLocations] = useState<string[]>([])
  const [templates, setTemplates] = useState<TemplateListRow[]>([])
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setFilter('')
    Promise.all([SystemLocations.list(), Templates.list({})])
      .then(([locs, tpls]) => {
        setLocations(locs)
        setTemplates(tpls)
      })
      .catch((e) => setError(String(e)))
  }, [open])

  const filteredLocations = useMemo(
    () => locations.filter((l) => l.includes(filter.trim())),
    [locations, filter],
  )
  const filteredTemplates = useMemo(
    () =>
      templates
        .filter((t) => t.id !== excludeTemplateId)
        .filter((t) => t.name.includes(filter.trim())),
    [templates, filter, excludeTemplateId],
  )

  return (
    <Modal open={open} title="בחר ישות" onClose={onClose} width={580}>
      <div
        style={{
          display: 'flex',
          gap: 4,
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 999,
          padding: 4,
          marginBottom: 14,
        }}
      >
        <button style={tabBtnStyle(tab === 'locations')} onClick={() => setTab('locations')}>
          ישויות ({filteredLocations.length})
        </button>
        <button style={tabBtnStyle(tab === 'templates')} onClick={() => setTab('templates')}>
          תבניות ({filteredTemplates.length})
        </button>
      </div>

      <input
        autoFocus
        placeholder="חיפוש…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid var(--color-border)',
          background: 'var(--color-bg)',
          fontFamily: 'inherit',
          fontSize: '0.9rem',
          color: 'var(--color-text)',
          marginBottom: 10,
        }}
      />

      {error && <div style={{ color: 'var(--color-accent)', marginBottom: 8 }}>{error}</div>}

      <div
        style={{
          maxHeight: 360,
          overflowY: 'auto',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: 4,
        }}
      >
        {tab === 'locations' ? (
          filteredLocations.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-light)', fontSize: '0.88rem' }}>
              לא נמצאו מיקומים מתאימים
            </div>
          ) : (
            filteredLocations.map((name) => (
              <button
                key={name}
                style={listBtnStyle}
                onClick={() => onPick({ kind: 'location', name })}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--color-primary-soft)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
              >
                {name}
              </button>
            ))
          )
        ) : filteredTemplates.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-light)', fontSize: '0.88rem' }}>
            לא נמצאו תבניות מתאימות
          </div>
        ) : (
          filteredTemplates.map((t) => (
            <button
              key={t.id}
              style={listBtnStyle}
              onClick={() => onPick({ kind: 'template', id: t.id, name: t.name })}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--color-primary-soft)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
            >
              <span style={{ fontWeight: 500 }}>{t.name}</span>
              {t.entity_type_name && (
                <span style={{ color: 'var(--color-text-light)', fontSize: '0.82rem' }}> · {t.entity_type_name}</span>
              )}
            </button>
          ))
        )}
      </div>
    </Modal>
  )
}
