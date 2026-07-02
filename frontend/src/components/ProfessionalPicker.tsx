import { useEffect, useRef, useState } from 'react'
import { CompanyProfessionals, type CompanyProfessionalRow } from '../lib/api'
import { useAuth, useEffectiveCompanyId } from '../lib/AuthContext'

const ADD_NEW = '__add_new__'

type Props = {
  value: string
  onChange: (v: string) => void
  style?: React.CSSProperties
  placeholder?: string
}

/**
 * Pick a professional from the company's trade catalog, OR type a brand-new one
 * ad-hoc. The typed value is used only on this defect — it does NOT add to the
 * company's professional classifications (that is managed separately).
 */
export default function ProfessionalPicker({ value, onChange, style, placeholder }: Props) {
  const { user } = useAuth()
  const companyId = useEffectiveCompanyId()
  const [trades, setTrades] = useState<CompanyProfessionalRow[]>([])
  const [custom, setCustom] = useState(false)
  const initRef = useRef(false)

  useEffect(() => {
    const cid = user?.role === 'super_admin' ? companyId ?? undefined : undefined
    CompanyProfessionals.list(cid)
      .then((rows) => setTrades(rows.filter((r) => r.is_active)))
      .catch(() => setTrades([]))
  }, [user?.role, companyId])

  // On first load, drop into free-text mode if the value isn't a known trade.
  useEffect(() => {
    if (initRef.current || !trades.length) return
    initRef.current = true
    if (value && !trades.some((t) => t.name === value)) setCustom(true)
  }, [trades, value])

  if (custom) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          autoFocus
          style={{ ...style, flex: 1 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || 'שם מקצוע חדש'}
        />
        <button
          type="button"
          className="tact-btn tact-btn-ghost"
          style={{ padding: '0 12px', whiteSpace: 'nowrap' }}
          onClick={() => {
            setCustom(false)
            onChange('')
          }}
          title="בחירה מרשימת סיווגי החברה"
        >
          רשימה
        </button>
      </div>
    )
  }

  return (
    <select
      style={style}
      value={value}
      onChange={(e) => {
        if (e.target.value === ADD_NEW) {
          setCustom(true)
          onChange('')
        } else {
          onChange(e.target.value)
        }
      }}
    >
      <option value="">— בחר מקצוע —</option>
      {trades.map((t) => (
        <option key={t.id} value={t.name}>
          {t.name}
        </option>
      ))}
      <option value={ADD_NEW}>➕ הוסף מקצוע חדש…</option>
    </select>
  )
}
