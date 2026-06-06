import { useEffect, useState } from 'react'
import {
  EntityTypes,
  Templates,
  type EntityTypeRow,
  type TemplateDetail,
  type TemplateItem,
  type TemplateWrite,
} from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import TactIcon from '../components/TactIcon'
import TactLogo from '../components/TactLogo'
import LoginPage from './LoginPage'
import { Field, inputStyle } from '../components/Modal'
import EntityPicker, { type PickResult } from '../components/EntityPicker'

type Props = { editingId: number | null }

// Single table layout — no more format-specific columns. Items are either
// locations or child-template refs; both render the same way.
//   # | ישות | תאור | חצים
const ITEM_GRID = '44px minmax(220px, 2.2fr) 1.2fr 144px'

const baseHeaderStyle: React.CSSProperties = {
  display: 'grid',
  gap: 8,
  padding: '8px 10px',
  background: 'var(--color-primary-soft)',
  borderRadius: '8px 8px 0 0',
  border: '1px solid var(--color-border)',
  borderBottom: 'none',
  fontSize: '0.74rem',
  fontWeight: 700,
  color: 'var(--color-primary)',
  letterSpacing: '0.02em',
}

const baseRowStyle: React.CSSProperties = {
  display: 'grid',
  gap: 8,
  alignItems: 'center',
  padding: '4px 10px',
  border: '1px solid var(--color-border)',
  borderTop: 'none',
  background: 'var(--color-bg-white)',
}


const tableInputStyle: React.CSSProperties = {
  ...inputStyle,
  padding: '5px 8px',
  fontSize: '0.85rem',
  background: 'transparent',
  border: '1px solid transparent',
}

const miniBtn: React.CSSProperties = {
  width: 24,
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--color-border)',
  borderRadius: 5,
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '0.65rem',
  color: 'var(--color-primary)',
  padding: 0,
  lineHeight: 1,
}

export default function TemplateEditorPage({ editingId }: Props) {
  const { user, loading: authLoading } = useAuth()

  // The id we're currently editing — initialized from the URL via props,
  // promoted to the just-created id on first successful save. Subsequent saves
  // then go to PUT instead of POST. (App.tsx reads the URL once at mount, so
  // we can't rely on the prop changing after history.replaceState.)
  const [currentEditingId, setCurrentEditingId] = useState<number | null>(editingId)

  // Read scope/company from the URL on mount. Used only for the *create* path
  // (saving a new template). Editing an existing template keeps its company_id
  // as stored — the editor doesn't move templates between scopes.
  const urlParams = new URLSearchParams(window.location.search)
  const urlScope = urlParams.get('scope')  // 'system' | 'company' | null
  const urlCompanyId = (() => {
    const raw = urlParams.get('company_id')
    return raw ? Number(raw) : null
  })()
  // Track the editing template's company_id so subsequent saves preserve it.
  const [editingCompanyId, setEditingCompanyId] = useState<number | null>(
    urlScope === 'company' ? urlCompanyId : null,
  )

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [entityTypeId, setEntityTypeId] = useState<number | null>(null)
  const [isActive, setIsActive] = useState(true)
  const [items, setItems] = useState<TemplateItem[]>([])
  const [entityTypes, setEntityTypes] = useState<EntityTypeRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(editingId !== null)
  // EntityPicker state: which row we're picking for (idx), and is the picker open?
  const [pickerOpenForIdx, setPickerOpenForIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!user) return
    EntityTypes.list()
      .then(setEntityTypes)
      .catch((e) => setError(String(e)))
  }, [user])

  useEffect(() => {
    if (!user) return
    if (editingId === null) {
      setLoading(false)
      return
    }
    setLoading(true)
    Templates.get(editingId)
      .then((t: TemplateDetail) => {
        setName(t.name)
        setCode(t.code || '')
        setEntityTypeId(t.entity_type_id)
        setIsActive(t.is_active)
        setItems(t.items)
        setEditingCompanyId(t.company_id)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [editingId, user])

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <span style={{ color: 'var(--color-text-light)' }}>טוען…</span>
      </div>
    )
  }
  if (!user) return <LoginPage />

  function emptyLocationItem(): TemplateItem {
    return {
      item_kind: 'location',
      location_name: '',
      child_template_id: null,
      quantity: 1,
      label: null,
    }
  }

  /** Insert an empty location row at `afterIdx + 1`, or append if null. */
  function insertEmptyRow(afterIdx: number | null) {
    setItems((prev) => {
      const next = [...prev]
      const insertIdx = afterIdx === null ? next.length : afterIdx + 1
      next.splice(insertIdx, 0, emptyLocationItem())
      // Focus the new row's name input shortly after render.
      setTimeout(() => {
        const el = document.querySelector<HTMLInputElement>(
          `input[data-name-input="${insertIdx}"]`,
        )
        el?.focus()
        el?.select()
      }, 0)
      return next
    })
    setSavedMsg(null)
  }

  /** Apply a picker selection to the row at `idx`. */
  function applyPick(idx: number, pick: PickResult) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it
        if (pick.kind === 'location') {
          return {
            ...it,
            item_kind: 'location',
            location_name: pick.name,
            child_template_id: null,
            child_template_name: null,
          }
        }
        return {
          ...it,
          item_kind: 'template',
          location_name: null,
          child_template_id: pick.id,
          child_template_name: pick.name,
        }
      }),
    )
    setPickerOpenForIdx(null)
    setSavedMsg(null)
  }

  function duplicateItem(idx: number) {
    setItems((prev) => {
      const src = prev[idx]
      if (!src) return prev
      const clone: TemplateItem = {
        item_kind: src.item_kind,
        location_name: src.location_name,
        child_template_id: src.child_template_id,
        child_template_name: src.child_template_name,
        quantity: src.quantity,
        label: src.label,
      }
      const next = [...prev]
      next.splice(idx + 1, 0, clone)
      return next
    })
    setSavedMsg(null)
  }

  function moveItem(idx: number, dir: 'up' | 'down') {
    const newIdx = dir === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= items.length) return
    const next = [...items]
    ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
    setItems(next)
    setSavedMsg(null)
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
    setSavedMsg(null)
  }

  function updateItem(idx: number, patch: Partial<TemplateItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
    setSavedMsg(null)
  }

  async function save() {
    setError(null)
    if (!name.trim()) {
      setError('שם התבנית הוא שדה חובה')
      return
    }
    if (entityTypeId === null) {
      setError('יש לבחור ישות מורכבת לתבנית')
      return
    }
    setSaving(true)
    const body: TemplateWrite = {
      name: name.trim(),
      code: code.trim() || null,
      // Legacy 'format' field kept on the backend for back-compat; behavior is
      // now driven entirely by entity_type. Send the simplest default.
      format: 'simple',
      entity_type_id: entityTypeId,
      // null = system template. Set = scoped to that company. For new templates
      // this comes from the URL scope; for existing ones it stays as loaded.
      company_id: editingCompanyId,
      // Description is kept in sync with name (one logical field, two storage
      // columns for legacy compat). User edits only the name input.
      description: name.trim() || null,
      is_active: isActive,
      items: items.map((it) => ({
        item_kind: it.item_kind,
        location_name: it.item_kind === 'location' ? it.location_name : null,
        child_template_id: it.item_kind === 'template' ? it.child_template_id : null,
        quantity: it.quantity,
        label: it.label || null,
      })),
    }
    try {
      if (currentEditingId === null) {
        const created = await Templates.create(body)
        // Rewrite the URL so a refresh stays on the saved template, AND promote
        // the in-component id so subsequent saves are PUT not POST.
        setCurrentEditingId(created.id)
        window.history.replaceState(null, '', `/templates/edit/${created.id}`)
      } else {
        await Templates.update(currentEditingId, body)
      }
      setSavedMsg('נשמר בהצלחה')
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="tact-aurora" style={{ minHeight: '100vh' }}>
      {/* Top bar */}
      <div
        style={{
          background: 'var(--color-bg-white)',
          borderBottom: '1px solid var(--color-border)',
          padding: '14px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <TactLogo word="cmm" size={0.95} />
          <span style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>
            עורך תבנית
          </span>
        </div>
        <button
          onClick={() => window.close()}
          className="tact-btn tact-btn-ghost"
          style={{ padding: '8px 16px', fontSize: '0.85rem' }}
        >
          סגור חלון ×
        </button>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px 60px' }}>
        <h1 style={{ fontSize: '1.5rem', color: 'var(--color-primary)', fontWeight: 700, marginBottom: 4 }}>
          {currentEditingId === null ? 'תבנית חדשה' : 'עריכת תבנית'}
        </h1>
        <p style={{ color: 'var(--color-text-light)', fontSize: '0.85rem', marginBottom: 24 }}>
          תבנית מערכת לשימוש חוזר. תוכל לחבר מיקומים ותבניות-בנות.
        </p>

        {loading ? (
          <div style={{ color: 'var(--color-text-light)' }}>טוען…</div>
        ) : (
          <div
            style={{
              background: 'var(--color-bg-white)',
              border: '1px solid var(--color-border)',
              borderRadius: 14,
              padding: '24px 22px',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <Field label="שם התבנית" hint='למשל "דירת 4 חדרים", "בניין מגורים סטנדרטי"'>
                <input style={inputStyle} value={name} onChange={(e) => { setName(e.target.value); setSavedMsg(null) }} />
              </Field>
              <Field label="קוד יחודי" hint='אופציונלי. למשל "APT-4R"'>
                <input
                  style={{ ...inputStyle, fontFamily: 'var(--font-family-en)' }}
                  value={code}
                  onChange={(e) => { setCode(e.target.value); setSavedMsg(null) }}
                />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <Field
                label="ישות מורכבת"
                hint={(() => {
                  const et = entityTypes.find((e) => e.id === entityTypeId)
                  if (!et) return 'בחר את הישות שהתבנית מייצגת — היא קובעת מה ייווצר בעץ הפרויקט'
                  const kindLabel: Record<string, string> = {
                    building: 'בניין',
                    floor: 'קומה',
                    unit: 'יחידה',
                    location: 'מיקום',
                  }
                  return `יישום התבנית ייצור צומת מסוג "${kindLabel[et.kind] || et.kind}" עם הפריטים שלמטה בתוכה`
                })()}
              >
                <select
                  style={inputStyle}
                  value={entityTypeId ?? ''}
                  onChange={(e) => { setEntityTypeId(e.target.value ? Number(e.target.value) : null); setSavedMsg(null) }}
                >
                  <option value="">— בחר ישות מורכבת —</option>
                  {entityTypes.filter((et) => et.is_active).map((et) => (
                    <option key={et.id} value={et.id}>{et.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="סטטוס">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 10 }}>
                  <input type="checkbox" checked={isActive} onChange={(e) => { setIsActive(e.target.checked); setSavedMsg(null) }} />
                  <span style={{ fontSize: '0.9rem' }}>פעיל</span>
                </label>
              </Field>
            </div>

            <div style={{ marginTop: 18, marginBottom: 10 }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                פריטים בתבנית ({items.length})
              </div>
            </div>

            <div>
              <div style={{ ...baseHeaderStyle, gridTemplateColumns: ITEM_GRID }}>
                <span style={{ textAlign: 'center' }}>מס׳</span>
                <span>ישות</span>
                <span>תאור</span>
                <span style={{ textAlign: 'center' }}>פעולות</span>
              </div>
              {items.map((it, idx) => {
                const isTemplate = it.item_kind === 'template'
                return (
                  <div key={idx} style={{ ...baseRowStyle, gridTemplateColumns: ITEM_GRID }}>
                    <span
                      style={{
                        textAlign: 'center',
                        fontFamily: 'var(--font-family-en)',
                        fontWeight: 600,
                        color: 'var(--color-primary)',
                        fontSize: '0.88rem',
                      }}
                    >
                      {idx + 1}
                    </span>

                    {/* Entity column: editable input for locations, readonly for templates.
                        Long names wrap to a second line instead of being clipped. */}
                    <span style={{ display: 'flex', alignItems: 'flex-start', gap: 4, minWidth: 0, padding: '4px 0' }}>
                      <TactIcon name={isTemplate ? 'copy' : 'layout'} size={14} />
                      {isTemplate ? (
                        <span
                          style={{
                            fontSize: '0.9rem',
                            flex: 1,
                            color: 'var(--color-primary)',
                            fontWeight: 600,
                            wordBreak: 'break-word',
                            overflowWrap: 'anywhere',
                            lineHeight: 1.35,
                          }}
                        >
                          {it.child_template_name || `#${it.child_template_id}`}
                        </span>
                      ) : (
                        <textarea
                          data-name-input={idx}
                          placeholder='שם ישות · F11 לבחירה'
                          rows={1}
                          style={{
                            ...tableInputStyle,
                            flex: 1,
                            resize: 'none',
                            overflow: 'hidden',
                            minHeight: 28,
                            lineHeight: 1.35,
                            paddingTop: 4,
                            paddingBottom: 4,
                          }}
                          ref={(el) => {
                            if (el) {
                              // Auto-grow to content height.
                              el.style.height = 'auto'
                              el.style.height = `${el.scrollHeight}px`
                            }
                          }}
                          value={it.location_name || ''}
                          onChange={(e) => updateItem(idx, { location_name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'F11') {
                              e.preventDefault()
                              setPickerOpenForIdx(idx)
                            }
                          }}
                        />
                      )}
                      <button
                        onClick={() => setPickerOpenForIdx(idx)}
                        style={{
                          ...miniBtn,
                          width: 22,
                          height: 22,
                          color: 'var(--color-text-light)',
                          flexShrink: 0,
                        }}
                        title="בחר מרשימה (F11)"
                      >
                        ⋯
                      </button>
                    </span>

                    <input
                      placeholder="תאור אופציונלי"
                      style={tableInputStyle}
                      value={it.label || ''}
                      onChange={(e) => updateItem(idx, { label: e.target.value })}
                    />

                    <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                      <button style={miniBtn} disabled={idx === 0} onClick={() => moveItem(idx, 'up')} title="העלה">▲</button>
                      <button style={miniBtn} disabled={idx === items.length - 1} onClick={() => moveItem(idx, 'down')} title="הורד">▼</button>
                      <button
                        onClick={() => duplicateItem(idx)}
                        style={miniBtn}
                        title="שכפל שורה"
                      >⧉</button>
                      <button
                        onClick={() => insertEmptyRow(idx)}
                        style={{ ...miniBtn, color: 'var(--color-pos)' }}
                        title="הוסף שורה אחרי"
                      >+</button>
                      <button
                        onClick={() => removeItem(idx)}
                        style={{ ...miniBtn, color: 'var(--color-accent)' }}
                        title="הסר"
                      >×</button>
                    </div>
                  </div>
                )
              })}

              {/* Add-row footer: click + to append empty row at the end */}
              <button
                onClick={() => insertEmptyRow(null)}
                style={{
                  width: '100%',
                  padding: '6px',
                  border: '1px dashed var(--color-border)',
                  borderTop: 'none',
                  background: 'var(--color-bg)',
                  color: 'var(--color-primary)',
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  fontSize: '1.05rem',
                  cursor: 'pointer',
                  borderRadius: '0 0 8px 8px',
                  lineHeight: 1.2,
                  transition: 'background .15s',
                }}
                title="הוסף שורה בסוף הרשימה"
              >
                +
              </button>
            </div>

            {error && <div style={{ color: 'var(--color-accent)', marginTop: 14 }}>{error}</div>}
            {savedMsg && <div style={{ color: 'var(--color-pos)', marginTop: 14, fontWeight: 600 }}>{savedMsg}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
              <button onClick={() => window.close()} className="tact-btn tact-btn-ghost">
                סגור
              </button>
              <button onClick={save} disabled={saving} className="tact-btn tact-btn-primary">
                {saving ? 'שומר…' : 'שמור'}
              </button>
            </div>
          </div>
        )}
      </div>

      <EntityPicker
        open={pickerOpenForIdx !== null}
        onClose={() => setPickerOpenForIdx(null)}
        excludeTemplateId={currentEditingId}
        onPick={(result) => {
          if (pickerOpenForIdx !== null) applyPick(pickerOpenForIdx, result)
        }}
      />
    </div>
  )
}
