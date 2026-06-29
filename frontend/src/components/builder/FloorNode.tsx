import { useState } from 'react'
import { ProjectTree, type BulkAddUnitsPayload, type ProjectItemNode } from '../../lib/api'
import { EditableText, MiniBtn, UNIT_TYPE_LABEL } from './shared'
import AddUnitsModal from './AddUnitsModal'
import { UNIT_DRAG_TYPE } from './UnitPalette'

type Props = {
  projectId: number
  floor: ProjectItemNode
  onRefresh: () => void
  onConfirmDelete: (label: string) => Promise<boolean>
}

export default function FloorNode({ projectId, floor, onRefresh, onConfirmDelete }: Props) {
  const [addOpen, setAddOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const units = floor.children

  async function rename(next: string) {
    await ProjectTree.update(projectId, floor.id, { name: next })
    onRefresh()
  }
  async function remove() {
    if (!(await onConfirmDelete(`הקומה "${floor.name}" וכל היחידות שתחתיה`))) return
    await ProjectTree.remove(projectId, floor.id)
    onRefresh()
  }
  async function addUnits(body: BulkAddUnitsPayload) {
    await ProjectTree.bulkAddUnits(projectId, floor.id, body)
    onRefresh()
  }
  async function setUnitNumber(u: ProjectItemNode, next: string) {
    const label = UNIT_TYPE_LABEL[u.unit_type || ''] || 'יחידה'
    await ProjectTree.update(projectId, u.id, {
      number: next,
      name: `${label} ${next}`.trim(),
    })
    onRefresh()
  }
  async function setUnitCustomer(u: ProjectItemNode, next: string) {
    await ProjectTree.update(projectId, u.id, { customer_name: next })
    onRefresh()
  }
  async function removeUnit(u: ProjectItemNode) {
    if (!(await onConfirmDelete(`"${u.name}"`))) return
    await ProjectTree.remove(projectId, u.id)
    onRefresh()
  }

  async function dropUnit(unitType: string) {
    await ProjectTree.bulkAddUnits(projectId, floor.id, { unit_type: unitType, count: 1 })
    onRefresh()
  }

  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(UNIT_DRAG_TYPE)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        if (!dragOver) setDragOver(true)
      }}
      onDragLeave={(e) => {
        // Ignore leave events bubbling from child elements.
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        setDragOver(false)
      }}
      onDrop={(e) => {
        const unitType = e.dataTransfer.getData(UNIT_DRAG_TYPE)
        setDragOver(false)
        if (!unitType) return
        e.preventDefault()
        dropUnit(unitType)
      }}
      style={{
        border: dragOver ? '2px dashed var(--color-accent)' : '1px solid var(--color-border)',
        borderRadius: 10,
        background: dragOver ? 'var(--color-primary-soft)' : 'var(--color-bg)',
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
        <span style={{ fontSize: '0.9rem' }}>🏬</span>
        <EditableText value={floor.name} onSave={rename} bold width={150} />
        <span style={{ flex: 1 }} />
        <MiniBtn onClick={() => setAddOpen(true)}>+ יחידות</MiniBtn>
        <MiniBtn onClick={remove} danger title="מחק קומה">
          מחק
        </MiniBtn>
      </div>

      {units.length === 0 && (
        <div
          style={{
            margin: '0 10px 8px',
            padding: '12px 10px',
            border: '1px dashed var(--color-border)',
            borderRadius: 8,
            textAlign: 'center',
            fontSize: '0.78rem',
            color: dragOver ? 'var(--color-accent)' : 'var(--color-text-light)',
          }}
        >
          {dragOver ? 'שחרר כאן להוספת יחידה' : 'גרור יחידה לכאן או לחץ "+ יחידות"'}
        </div>
      )}

      {units.length > 0 && (
        <div style={{ padding: '0 10px 8px' }}>
          {units.map((u) => (
            <div
              key={u.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 8px',
                borderTop: '1px solid var(--color-border)',
              }}
            >
              <span className="tact-badge tact-badge-on" style={{ minWidth: 56, textAlign: 'center' }}>
                {UNIT_TYPE_LABEL[u.unit_type || ''] || 'יחידה'}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-light)' }}>מס׳</span>
              <EditableText value={u.short_code || u.number || ''} onSave={(n) => setUnitNumber(u, n)} width={70} />
              <EditableText
                value={u.customer_name || ''}
                onSave={(n) => setUnitCustomer(u, n)}
                placeholder="שם לקוח…"
                width={170}
              />
              <span style={{ flex: 1 }} />
              <MiniBtn onClick={() => removeUnit(u)} danger title="מחק יחידה">
                ✕
              </MiniBtn>
            </div>
          ))}
        </div>
      )}

      <AddUnitsModal
        open={addOpen}
        floorName={floor.name}
        onClose={() => setAddOpen(false)}
        onAdd={addUnits}
      />
    </div>
  )
}
