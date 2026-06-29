import { ProjectTree, type CrmCustomer, type ProjectItemNode } from '../../lib/api'
import { EditableText, MiniBtn, type CollapseCmd } from './shared'
import EntranceNode from './EntranceNode'

type Props = {
  projectId: number
  building: ProjectItemNode
  onRefresh: () => void
  onConfirmDelete: (label: string) => Promise<boolean>
  collapseCmd?: CollapseCmd
  customers?: CrmCustomer[]
}

const ENTRANCE_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י']

export default function BuildingNode({ projectId, building, onRefresh, onConfirmDelete, collapseCmd, customers }: Props) {
  const entrances = building.children

  async function rename(next: string) {
    await ProjectTree.update(projectId, building.id, { name: next })
    onRefresh()
  }
  async function remove() {
    if (!(await onConfirmDelete(`הבניין "${building.name}" וכל מה שתחתיו`))) return
    await ProjectTree.remove(projectId, building.id)
    onRefresh()
  }
  async function addEntrance() {
    const letter = ENTRANCE_LETTERS[entrances.length] || String(entrances.length + 1)
    await ProjectTree.create(projectId, {
      kind: 'entrance',
      name: `כניסה ${letter}`,
      parent_id: building.id,
    })
    onRefresh()
  }

  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 14,
        background: 'var(--color-primary-soft)',
        marginBottom: 14,
        padding: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: '1.05rem' }}>🏢</span>
        <EditableText value={building.name} onSave={rename} bold width={180} />
        <span
          style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', fontFamily: 'var(--font-family-en)' }}
        >
          {building.short_code}
        </span>
        <span style={{ flex: 1 }} />
        <MiniBtn onClick={addEntrance}>+ כניסה</MiniBtn>
        <MiniBtn onClick={remove} danger title="מחק בניין">
          מחק
        </MiniBtn>
      </div>

      <div style={{ paddingInlineStart: 8 }}>
        {entrances.map((e) => (
          <EntranceNode
            key={e.id}
            projectId={projectId}
            entrance={e}
            onRefresh={onRefresh}
            onConfirmDelete={onConfirmDelete}
            collapseCmd={collapseCmd}
            customers={customers}
          />
        ))}
      </div>
    </div>
  )
}
