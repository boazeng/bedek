import { useEffect, useState } from 'react'
import { Malfunctions, type MalfunctionListRow, type ProjectItemNode } from '../lib/api'
import type { CollapseCmd } from './builder/shared'

const KIND_ICON: Record<string, string> = { building: '🏢', entrance: '🚪', floor: '🏬', unit: '🏠' }
const UNIT_TYPE_ICON: Record<string, string> = {
  apartment: '🏠',
  parking: '🅿️',
  storage: '📦',
  shop: '🏪',
  public_area: '🏛️',
}

const STATUS_LABEL: Record<string, string> = {
  pending_manager: 'ממתין לאישור',
  todo: 'לביצוע',
  negotiation: 'מו"מ',
  frozen: 'מוקפא',
  done: 'הסתיים',
  cancelled: 'בוטל',
}
const STATUS_CLASS: Record<string, string> = {
  todo: 'tact-badge-on',
  pending_manager: 'tact-badge-new',
  negotiation: 'tact-badge-soon',
  frozen: 'tact-badge-soon',
  done: 'tact-badge-pos',
  cancelled: 'tact-badge-soon',
}

type NodeProps = {
  projectId: number
  node: ProjectItemNode
  depth: number
  defectCounts: Map<number, number>
  collapseCmd: CollapseCmd
  onOpenUnit: (projectId: number, unitId: number) => void
}

function nodeHasDefects(node: ProjectItemNode, counts: Map<number, number>): boolean {
  if (node.kind === 'unit') return (counts.get(node.id) || 0) > 0
  return node.children.some((c) => nodeHasDefects(c, counts))
}

function TreeNode({ projectId, node, depth, defectCounts, collapseCmd, onOpenUnit }: NodeProps) {
  const isUnit = node.kind === 'unit'
  const [collapsed, setCollapsed] = useState(false)
  const [defects, setDefects] = useState<MalfunctionListRow[] | null>(null)

  useEffect(() => {
    if (collapseCmd) setCollapsed(collapseCmd.all)
  }, [collapseCmd?.n])

  // Lazy-load a unit's defects when it's first opened.
  useEffect(() => {
    if (isUnit && !collapsed && defects === null) {
      Malfunctions.byUnit(projectId, node.id).then(setDefects).catch(() => setDefects([]))
    }
  }, [isUnit, collapsed, defects, projectId, node.id])

  const openCount = isUnit ? defectCounts.get(node.id) || 0 : 0
  const icon = isUnit ? UNIT_TYPE_ICON[node.unit_type || ''] || '🏠' : KIND_ICON[node.kind] || '•'
  const indent = depth * 16

  return (
    <div>
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 10px',
          paddingInlineStart: 10 + indent,
          borderTop: depth === 0 ? undefined : '1px solid var(--color-border)',
          background: depth === 0 ? 'var(--color-primary-soft)' : 'transparent',
          cursor: 'pointer',
          fontWeight: depth === 0 ? 700 : 500,
        }}
      >
        <span style={{ width: 14, color: 'var(--color-primary)', fontSize: '0.7rem' }}>
          {collapsed ? '▸' : '▾'}
        </span>
        <span>{icon}</span>
        <span style={{ fontSize: depth === 0 ? '0.95rem' : '0.88rem' }}>{node.name}</span>
        {node.short_code && (
          <span style={{ fontFamily: 'var(--font-family-en)', fontSize: '0.72rem', color: 'var(--color-text-light)' }}>
            {node.short_code}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {isUnit && (
          <>
            <span
              className={`tact-badge ${openCount > 0 ? 'tact-badge-new' : 'tact-badge-soon'}`}
              style={{ fontFamily: 'var(--font-family-en)' }}
            >
              {openCount}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenUnit(projectId, node.id)
              }}
              className="tact-btn tact-btn-ghost"
              style={{ padding: '4px 12px', fontSize: '0.76rem' }}
            >
              צפה / נהל
            </button>
          </>
        )}
      </div>

      {!collapsed && isUnit && (
        <div style={{ paddingInlineStart: 10 + indent + 24, paddingBottom: 6 }}>
          {defects === null ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-light)', padding: '4px 0' }}>טוען…</div>
          ) : defects.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-light)', padding: '4px 0' }}>
              אין תקלות פתוחות
            </div>
          ) : (
            defects.map((d) => (
              <div
                key={d.id}
                onClick={() => onOpenUnit(projectId, node.id)}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  padding: '4px 0',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                }}
              >
                {d.number && (
                  <code style={{ fontFamily: 'var(--font-family-en)', fontSize: '0.72rem', color: 'var(--color-primary)' }}>
                    {d.number}
                  </code>
                )}
                <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{d.description}</span>
                <span className={`tact-badge ${STATUS_CLASS[d.status] || ''}`}>
                  {STATUS_LABEL[d.status] || d.status}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {!collapsed && !isUnit &&
        node.children.map((c) => (
          <TreeNode
            key={c.id}
            projectId={projectId}
            node={c}
            depth={depth + 1}
            defectCounts={defectCounts}
            collapseCmd={collapseCmd}
            onOpenUnit={onOpenUnit}
          />
        ))}
    </div>
  )
}

type Props = {
  projectId: number
  tree: ProjectItemNode[]
  defectCounts: Map<number, number>
  collapseCmd: CollapseCmd
  onOpenUnit: (projectId: number, unitId: number) => void
  /** Units-only: flatten to sale units, hiding building/entrance/floor levels. */
  flat?: boolean
}

function collectUnits(nodes: ProjectItemNode[]): ProjectItemNode[] {
  const out: ProjectItemNode[] = []
  const walk = (ns: ProjectItemNode[]) =>
    ns.forEach((n) => (n.kind === 'unit' ? out.push(n) : walk(n.children)))
  walk(nodes)
  return out
}

export { nodeHasDefects }

export default function MalfunctionTree({ projectId, tree, defectCounts, collapseCmd, onOpenUnit, flat }: Props) {
  const items = flat ? collectUnits(tree) : tree
  if (items.length === 0) {
    return (
      <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-light)' }}>
        {flat ? 'אין יחידות ממכר להצגה' : 'אין מבנה לפרויקט זה'}
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
      {items.map((n) => (
        <TreeNode
          key={n.id}
          projectId={projectId}
          node={n}
          depth={flat ? 1 : 0}
          defectCounts={defectCounts}
          collapseCmd={collapseCmd}
          onOpenUnit={onOpenUnit}
        />
      ))}
    </div>
  )
}
