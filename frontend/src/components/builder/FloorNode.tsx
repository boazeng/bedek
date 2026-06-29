import { useEffect, useState } from 'react'
import { ProjectTree, type CrmCustomer, type BulkAddUnitsPayload, type ProjectItemNode } from '../../lib/api'
import {
  EditableText,
  MiniBtn,
  UNIT_TYPE_LABEL,
  UNIT_TYPE_OPTIONS,
  UNIT_TYPE_PLURAL,
  PUBLIC_OWNER,
  floorNumberLabel,
  type CollapseCmd,
} from './shared'
import { usePrompt } from '../Dialog'
import AddUnitsModal from './AddUnitsModal'
import UnitCustomersModal from './UnitCustomersModal'
import { UNIT_DRAG_TYPE } from './UnitPalette'

type Props = {
  projectId: number
  floor: ProjectItemNode
  onRefresh: () => void
  onConfirmDelete: (label: string) => Promise<boolean>
  collapseCmd?: CollapseCmd
  customers?: CrmCustomer[]
}

/** Ask the user for a repeat count (≥1) via the prompt dialog. Null = cancelled. */
async function askCount(prompt: ReturnType<typeof usePrompt>, title: string, message: string): Promise<number | null> {
  const v = await prompt({ title, message, initialValue: '1', placeholder: 'מספר פעמים' })
  if (v === null) return null
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n >= 1 ? n : null
}

export default function FloorNode({ projectId, floor, onRefresh, onConfirmDelete, collapseCmd, customers = [] }: Props) {
  const prompt = usePrompt()
  const [addOpen, setAddOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [customersFor, setCustomersFor] = useState<ProjectItemNode | null>(null)
  const units = floor.children

  // Resolve CRM customer membership ids → display names.
  const customerName = (id: number) => {
    const c = customers.find((x) => x.membership_id === id)
    return c ? c.full_name : `לקוח #${id}`
  }

  // Per-type breakdown, only for types that exist on the floor.
  const unitSummary = UNIT_TYPE_OPTIONS.map((o) => ({
    label: UNIT_TYPE_PLURAL[o.value],
    n: units.filter((u) => u.unit_type === o.value).length,
  }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.label} - ${x.n}`)
    .join(' · ')

  // Apply a "collapse all / expand all" broadcast from the toolbar.
  useEffect(() => {
    if (collapseCmd) setCollapsed(collapseCmd.all)
  }, [collapseCmd?.n])

  async function rename(next: string) {
    await ProjectTree.update(projectId, floor.id, { name: next })
    onRefresh()
  }
  async function remove() {
    if (!(await onConfirmDelete(`הקומה "${floor.name}" וכל היחידות שתחתיה`))) return
    await ProjectTree.remove(projectId, floor.id)
    onRefresh()
  }
  // A public-area unit always belongs to the committee and is numbered by floor.
  function publicFields(floorNumLabel: string) {
    return { number: floorNumLabel, name: `ציבורי ${floorNumLabel}`.trim(), customer_name: PUBLIC_OWNER }
  }
  async function addUnits(body: BulkAddUnitsPayload) {
    const created = await ProjectTree.bulkAddUnits(projectId, floor.id, body)
    if (body.unit_type === 'public_area') {
      const fields = publicFields(floorNumberLabel(floor.name))
      for (const u of created) await ProjectTree.update(projectId, u.id, fields)
    }
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
  async function saveUnitCustomers(u: ProjectItemNode, membershipIds: number[]) {
    await ProjectTree.setUnitCustomers(projectId, u.id, membershipIds)
    onRefresh()
  }
  async function removeUnit(u: ProjectItemNode) {
    if (!(await onConfirmDelete(`"${u.name}"`))) return
    await ProjectTree.remove(projectId, u.id)
    onRefresh()
  }

  async function dropUnit(unitType: string) {
    const created = await ProjectTree.bulkAddUnits(projectId, floor.id, { unit_type: unitType, count: 1 })
    if (unitType === 'public_area' && created[0]) {
      await ProjectTree.update(projectId, created[0].id, publicFields(floorNumberLabel(floor.name)))
    }
    onRefresh()
  }
  // "Duplicate" = add the next floor(s): bump the floor number (קומה 3 → קומה 4,
  // 5, …) and recreate the same unit mix, with apartment numbers continuing the
  // entrance sequence (last apartment 12 → next floor starts at 13).
  async function duplicateFloors(times: number) {
    const match = floor.name.match(/(\d+)\s*$/)
    const base = match ? Number(match[1]) : null
    const prefix = match ? floor.name.replace(/\d+\s*$/, '') : floor.name
    const apartments = units.filter((u) => u.unit_type === 'apartment').length
    const others = units.filter((u) => u.unit_type && u.unit_type !== 'apartment')

    for (let i = 1; i <= times; i++) {
      const name = base !== null ? `${prefix}${base + i}` : `${floor.name} (עותק${times > 1 ? ' ' + i : ''})`
      const created = await ProjectTree.create(projectId, { kind: 'floor', name, parent_id: floor.parent_id })
      if (apartments > 0) {
        // start_number omitted → backend continues from the next free number in the entrance.
        await ProjectTree.bulkAddUnits(projectId, created.id, { unit_type: 'apartment', count: apartments })
      }
      for (const u of others) {
        const c = await ProjectTree.bulkAddUnits(projectId, created.id, {
          unit_type: u.unit_type!,
          count: 1,
          number: u.short_code || u.number || null,
        })
        if (u.unit_type === 'public_area' && c[0]) {
          await ProjectTree.update(projectId, c[0].id, publicFields(floorNumberLabel(name)))
        }
      }
    }
    onRefresh()
  }
  async function promptDuplicateFloors() {
    const n = await askCount(prompt, 'שכפול קומה', 'כמה פעמים לשכפל את הקומה?')
    if (n) await duplicateFloors(n)
  }

  // Add `times` storage units to this floor, numbered continuing the highest
  // numeric storage number already on the floor. Apartment association is left
  // blank for the user to fill.
  async function duplicateStorage(times: number) {
    const nums = units
      .filter((u) => u.unit_type === 'storage')
      .map((u) => parseInt(u.short_code || u.number || '', 10))
      .filter((n) => !Number.isNaN(n))
    let next = nums.length ? Math.max(...nums) : 0
    for (let i = 0; i < times; i++) {
      next += 1
      await ProjectTree.bulkAddUnits(projectId, floor.id, { unit_type: 'storage', count: 1, number: String(next) })
    }
    onRefresh()
  }
  async function promptDuplicateStorage() {
    const n = await askCount(prompt, 'שכפול מחסן', 'כמה מחסנים להוסיף לקומה?')
    if (n) await duplicateStorage(n)
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
        <MiniBtn
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'הרחב קומה' : 'כווץ קומה'}
        >
          {collapsed ? '▸' : '▾'}
        </MiniBtn>
        <span style={{ fontSize: '0.9rem' }}>🏬</span>
        <EditableText value={floor.name} onSave={rename} bold width={150} />
        {units.length > 0 && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
            {unitSummary}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <MiniBtn onClick={() => setAddOpen(true)}>+ יחידות</MiniBtn>
        <MiniBtn onClick={() => duplicateFloors(1)} title="שכפל את הקומה פעם אחת">שכפל</MiniBtn>
        <MiniBtn onClick={promptDuplicateFloors} title="שכפל את הקומה כמה פעמים">שכפל ×</MiniBtn>
        <MiniBtn onClick={remove} danger title="מחק קומה">
          מחק
        </MiniBtn>
      </div>

      {!collapsed && units.length === 0 && (
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

      {/* Collapsed view: compact pills with only the unit type + number. */}
      {collapsed && units.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 10px 10px' }}>
          {units.map((u) => (
            <span
              key={u.id}
              title={u.customer_name || undefined}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 12px',
                borderRadius: 999,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-white)',
                fontSize: '0.78rem',
                color: 'var(--color-text)',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontWeight: 600 }}>{UNIT_TYPE_LABEL[u.unit_type || ''] || 'יחידה'}</span>
              <span style={{ color: 'var(--color-text-light)' }}>{u.short_code || u.number || ''}</span>
              {u.unit_type === 'storage' && u.customer_name && (
                <span style={{ color: 'var(--color-text-light)' }}>← דירה {u.customer_name}</span>
              )}
            </span>
          ))}
        </div>
      )}

      {!collapsed && units.length > 0 && (
        <div style={{ padding: '0 10px 8px' }}>
          {units.map((u) => {
            const isStorage = u.unit_type === 'storage'
            const isPublic = u.unit_type === 'public_area'
            return (
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
                {isPublic ? (
                  // Public-area number is the floor number — derived, not editable.
                  <span style={{ fontWeight: 600, minWidth: 40 }}>{u.short_code || u.number || ''}</span>
                ) : (
                  <EditableText value={u.short_code || u.number || ''} onSave={(n) => setUnitNumber(u, n)} width={70} />
                )}
                {isStorage && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-text-light)' }}>שייך לדירה</span>
                )}
                {isPublic ? (
                  // Public-area owner is always the house committee.
                  <span style={{ color: 'var(--color-text)' }}>בעלים: {PUBLIC_OWNER}</span>
                ) : isStorage ? (
                  <EditableText
                    value={u.customer_name || ''}
                    onSave={(n) => setUnitCustomer(u, n)}
                    placeholder="מס׳ דירה…"
                    width={110}
                  />
                ) : (
                  // Apartment / parking / shop: one or more customers from CRM.
                  <button
                    type="button"
                    onClick={() => setCustomersFor(u)}
                    className="tact-btn tact-btn-ghost"
                    title="בחר לקוח/ים מתוך לקוחות החברה ב-CRM"
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.82rem',
                      minWidth: 180,
                      textAlign: 'start',
                      color: u.customer_membership_ids.length ? 'var(--color-text)' : 'var(--color-text-light)',
                    }}
                  >
                    {u.customer_membership_ids.length
                      ? u.customer_membership_ids.map(customerName).join(', ')
                      : '+ שייך לקוח'}
                  </button>
                )}
                <span style={{ flex: 1 }} />
                {isStorage && (
                  <MiniBtn onClick={promptDuplicateStorage} title="שכפל מחסן כמה פעמים">
                    שכפל ×
                  </MiniBtn>
                )}
                <MiniBtn onClick={() => removeUnit(u)} danger title="מחק יחידה">
                  ✕
                </MiniBtn>
              </div>
            )
          })}
        </div>
      )}

      <AddUnitsModal
        open={addOpen}
        floorName={floor.name}
        onClose={() => setAddOpen(false)}
        onAdd={addUnits}
      />

      <UnitCustomersModal
        open={customersFor !== null}
        unitLabel={customersFor ? `${UNIT_TYPE_LABEL[customersFor.unit_type || ''] || 'יחידה'} ${customersFor.short_code || customersFor.number || ''}` : ''}
        customers={customers}
        selectedIds={customersFor?.customer_membership_ids || []}
        onClose={() => setCustomersFor(null)}
        onSave={(ids) => saveUnitCustomers(customersFor!, ids)}
      />
    </div>
  )
}
