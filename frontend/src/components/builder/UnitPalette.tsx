import { UNIT_TYPE_OPTIONS } from './shared'

/** Custom MIME type carried by a dragged unit-type chip. FloorNode reads it on drop. */
export const UNIT_DRAG_TYPE = 'application/x-unit-type'

const UNIT_ICON: Record<string, string> = {
  apartment: '🏠',
  parking: '🅿️',
  storage: '📦',
  shop: '🏪',
  public_area: '🏛️',
}

type Props = {
  /** Vertical (side-panel) layout when true; horizontal pill row otherwise. */
  vertical?: boolean
}

/** Draggable chips — one per sale-unit type. Drag a chip onto a floor to add a
 *  unit of that type there (the drop is handled by FloorNode). */
export default function UnitPalette({ vertical = false }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        alignItems: vertical ? 'stretch' : 'center',
        gap: 8,
        flexWrap: vertical ? 'nowrap' : 'wrap',
        background: 'var(--color-bg-white)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        padding: vertical ? 14 : '10px 14px',
      }}
    >
      <span
        style={{
          fontSize: '0.8rem',
          color: 'var(--color-text-light)',
          fontWeight: 600,
          marginBottom: vertical ? 4 : 0,
        }}
      >
        {vertical ? 'יחידות ממכר — גרור אל קומה' : 'גרור יחידה אל קומה:'}
      </span>
      {UNIT_TYPE_OPTIONS.map((opt) => (
        <div
          key={opt.value}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(UNIT_DRAG_TYPE, opt.value)
            e.dataTransfer.effectAllowed = 'copy'
          }}
          title={`גרור "${opt.label}" אל קומה`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: vertical ? 'flex-start' : 'center',
            gap: 8,
            padding: vertical ? '9px 12px' : '6px 12px',
            borderRadius: vertical ? 10 : 999,
            border: '1px solid var(--color-border)',
            background: 'var(--color-primary-soft)',
            color: 'var(--color-primary)',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'grab',
            userSelect: 'none',
          }}
        >
          <span aria-hidden style={{ fontSize: '1.05rem' }}>
            {UNIT_ICON[opt.value] || '▪'}
          </span>
          {opt.label}
        </div>
      ))}
    </div>
  )
}
