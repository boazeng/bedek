export default function ReportsPage() {
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
          דוחות
        </h2>
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
          דוחות וניתוחים על פרויקטים, יחידות ותקלות
        </div>
      </div>

      <div
        className="tact-kpi"
        style={{
          textAlign: 'center',
          padding: '60px 20px',
          border: '1px dashed var(--color-border)',
        }}
      >
        <div style={{ fontSize: '2rem', marginBottom: 10 }}>📊</div>
        <div className="tact-kpi-label">עמוד הדוחות בהכנה</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--color-text-light)', marginTop: 6 }}>
          נגדיר יחד אילו דוחות יוצגו כאן.
        </div>
      </div>
    </div>
  )
}
