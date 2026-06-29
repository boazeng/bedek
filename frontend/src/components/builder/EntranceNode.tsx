import { ProjectTree, type CrmCustomer, type ProjectItemNode } from '../../lib/api'
import { EditableText, MiniBtn, type CollapseCmd } from './shared'
import FloorNode from './FloorNode'

type Props = {
  projectId: number
  entrance: ProjectItemNode
  onRefresh: () => void
  onConfirmDelete: (label: string) => Promise<boolean>
  collapseCmd?: CollapseCmd
  customers?: CrmCustomer[]
}

export default function EntranceNode({ projectId, entrance, onRefresh, onConfirmDelete, collapseCmd, customers }: Props) {
  const floors = entrance.children

  async function rename(next: string) {
    await ProjectTree.update(projectId, entrance.id, { name: next })
    onRefresh()
  }
  async function remove() {
    if (!(await onConfirmDelete(`הכניסה "${entrance.name}" וכל הקומות שתחתיה`))) return
    await ProjectTree.remove(projectId, entrance.id)
    onRefresh()
  }
  const isBasement = (f: ProjectItemNode) => f.name.includes('מרתף')
  const isGround = (f: ProjectItemNode) => f.name.includes('קרקע')

  // Add a regular numbered floor on top of the stack (highest level).
  async function addFloor() {
    const regular = floors.filter((f) => !isBasement(f) && !isGround(f)).length
    await ProjectTree.create(projectId, {
      kind: 'floor',
      name: `קומה ${regular + 1}`,
      parent_id: entrance.id,
    })
    onRefresh()
  }

  // Add the ground floor just above any basements (below the numbered floors).
  async function addGroundFloor() {
    const created = await ProjectTree.create(projectId, {
      kind: 'floor',
      name: 'קומת קרקע',
      parent_id: entrance.id,
    })
    const basements = floors.filter(isBasement).length
    const existing = floors.map((f) => f.id)
    const ids = [...existing.slice(0, basements), created.id, ...existing.slice(basements)]
    await ProjectTree.reorder(projectId, entrance.id, ids)
    onRefresh()
  }

  // Add a basement at the very bottom of the stack (below the ground floor).
  async function addBasement() {
    const count = floors.filter(isBasement).length
    const created = await ProjectTree.create(projectId, {
      kind: 'floor',
      name: count === 0 ? 'קומת מרתף' : `קומת מרתף ${count + 1}`,
      parent_id: entrance.id,
    })
    await ProjectTree.reorder(projectId, entrance.id, [created.id, ...floors.map((f) => f.id)])
    onRefresh()
  }

  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        background: 'var(--color-bg-white)',
        marginBottom: 10,
        padding: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: '0.95rem' }}>🚪</span>
        <EditableText value={entrance.name} onSave={rename} bold width={150} />
        <span style={{ flex: 1 }} />
        <MiniBtn onClick={addFloor} title="הוסף קומה רגילה למעלה">+ קומה</MiniBtn>
        <MiniBtn onClick={addGroundFloor} title="הוסף קומת קרקע (מתחת לקומה 1)">+ קומת קרקע</MiniBtn>
        <MiniBtn onClick={addBasement} title="הוסף קומת מרתף (מתחת לקומת הקרקע)">+ מרתף</MiniBtn>
        <MiniBtn onClick={remove} danger title="מחק כניסה">
          מחק
        </MiniBtn>
      </div>

      <div style={{ paddingInlineStart: 10 }}>
        {floors.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', padding: '4px 2px' }}>
            אין קומות עדיין — לחץ "+ קומה".
          </div>
        ) : (
          // Display top-down right under the entrance: מרתף → קומת קרקע → קומה 1 → קומה 2 …
          floors.map((f) => (
            <FloorNode
              key={f.id}
              projectId={projectId}
              floor={f}
              onRefresh={onRefresh}
              onConfirmDelete={onConfirmDelete}
              collapseCmd={collapseCmd}
              customers={customers}
            />
          ))
        )}
      </div>
    </div>
  )
}
