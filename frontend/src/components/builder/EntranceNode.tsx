import { ProjectTree, type ProjectItemNode } from '../../lib/api'
import { EditableText, MiniBtn } from './shared'
import FloorNode from './FloorNode'

type Props = {
  projectId: number
  entrance: ProjectItemNode
  onRefresh: () => void
  onConfirmDelete: (label: string) => Promise<boolean>
}

export default function EntranceNode({ projectId, entrance, onRefresh, onConfirmDelete }: Props) {
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
  async function addFloor() {
    // Build from the ground up: the first floor is the ground floor.
    await ProjectTree.create(projectId, {
      kind: 'floor',
      name: floors.length === 0 ? 'קומת קרקע' : `קומה ${floors.length}`,
      parent_id: entrance.id,
    })
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
        <MiniBtn onClick={addFloor}>+ קומה</MiniBtn>
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
          // Display bottom-up: ground floor sits at the bottom, upper floors stack above.
          [...floors].reverse().map((f) => (
            <FloorNode
              key={f.id}
              projectId={projectId}
              floor={f}
              onRefresh={onRefresh}
              onConfirmDelete={onConfirmDelete}
            />
          ))
        )}
      </div>
    </div>
  )
}
