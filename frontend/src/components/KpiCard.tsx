type Props = {
  label: string
  value: number | string
  sub?: string
  accent?: boolean
}

export default function KpiCard({ label, value, sub, accent }: Props) {
  return (
    <div className="tact-kpi">
      <div className="tact-kpi-label" style={accent ? { color: 'var(--color-accent)' } : undefined}>
        {label}
      </div>
      <div className="tact-kpi-val">{value.toLocaleString('he-IL')}</div>
      {sub && <div className="tact-kpi-sub">{sub}</div>}
    </div>
  )
}
