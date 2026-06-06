import type { StatusBreakdown } from '../lib/api'

type Props = { breakdown: StatusBreakdown }

export default function StatusBar({ breakdown }: Props) {
  const total =
    breakdown.pending_manager +
    breakdown.todo +
    breakdown.negotiation +
    breakdown.frozen +
    breakdown.done +
    breakdown.cancelled
  if (total === 0) {
    return <div className="text-xs text-taupe">אין ליקויים</div>
  }
  const pct = (n: number) => `${(n / total) * 100}%`
  return (
    <div>
      <div className="tact-statbar">
        <span className="seg-pending" style={{ width: pct(breakdown.pending_manager) }} title={`ממתין לאישור: ${breakdown.pending_manager}`} />
        <span className="seg-todo" style={{ width: pct(breakdown.todo) }} title={`לביצוע: ${breakdown.todo}`} />
        <span className="seg-nego" style={{ width: pct(breakdown.negotiation + breakdown.frozen) }} title={`מו"מ/מוקפא: ${breakdown.negotiation + breakdown.frozen}`} />
        <span className="seg-done" style={{ width: pct(breakdown.done) }} title={`הסתיים: ${breakdown.done}`} />
      </div>
      <div className="tact-stat-legend mt-2">
        <span><span className="dot" style={{ background: 'var(--color-accent)' }} />ממתין: {breakdown.pending_manager}</span>
        <span><span className="dot" style={{ background: 'var(--color-primary)' }} />לביצוע: {breakdown.todo}</span>
        <span><span className="dot" style={{ background: '#C99238' }} />מו"מ: {breakdown.negotiation}</span>
        <span><span className="dot" style={{ background: 'var(--color-pos)' }} />הסתיים: {breakdown.done}</span>
      </div>
    </div>
  )
}
