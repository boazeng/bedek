import { useEffect, useMemo, useState } from 'react'
import { ProjectTree, EMPTY_WORK_SCOPE, type ProjectItemNode } from '../lib/api'
import { useAuth } from '../lib/AuthContext'

const UNIT_TYPE_LABEL: Record<string, string> = {
  apartment: 'דירה',
  parking: 'חניה',
  storage: 'מחסן',
  shop: 'חנות',
  public_area: 'ציבורי',
}

const selectStyle: React.CSSProperties = {
  font: 'inherit',
  fontSize: '0.78rem',
  padding: '5px 8px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg-white)',
  color: 'var(--color-text)',
  maxWidth: 150,
}

/** Header cascade: choose the building → entrance → unit the user is working
 *  on. Each level appears only after the previous one is chosen. Selection is
 *  stored globally (auth context) so other screens can use it. */
export default function WorkScopePicker() {
  const { activeProject, workScope, setWorkScope } = useAuth()
  const [tree, setTree] = useState<ProjectItemNode[]>([])

  useEffect(() => {
    if (!activeProject) {
      setTree([])
      return
    }
    ProjectTree.list(activeProject.id)
      .then(setTree)
      .catch(() => setTree([]))
  }, [activeProject?.id])

  const buildings = useMemo(() => tree.filter((n) => n.kind === 'building'), [tree])
  const entrances = useMemo(() => {
    const b = buildings.find((x) => x.id === workScope.buildingId)
    return b ? b.children.filter((n) => n.kind === 'entrance') : []
  }, [buildings, workScope.buildingId])
  const units = useMemo(() => {
    const b = buildings.find((x) => x.id === workScope.buildingId)
    const e = b?.children.find((x) => x.id === workScope.entranceId)
    if (!e) return [] as { node: ProjectItemNode; floor: string }[]
    const out: { node: ProjectItemNode; floor: string }[] = []
    for (const floor of e.children)
      for (const u of floor.children) if (u.kind === 'unit') out.push({ node: u, floor: floor.name })
    return out
  }, [buildings, workScope.buildingId, workScope.entranceId])

  if (!activeProject || buildings.length === 0) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <select
        style={selectStyle}
        value={workScope.buildingId ?? ''}
        onChange={(e) => {
          const id = e.target.value ? Number(e.target.value) : null
          const b = buildings.find((x) => x.id === id)
          setWorkScope({
            ...EMPTY_WORK_SCOPE,
            buildingId: id,
            buildingName: b?.name ?? null,
          })
        }}
      >
        <option value="">בחר בניין</option>
        {buildings.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>

      {workScope.buildingId && (
        <select
          style={selectStyle}
          value={workScope.entranceId ?? ''}
          onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : null
            const en = entrances.find((x) => x.id === id)
            setWorkScope({
              ...workScope,
              entranceId: id,
              entranceName: en?.name ?? null,
              unitId: null,
              unitName: null,
            })
          }}
        >
          <option value="">בחר כניסה</option>
          {entrances.map((en) => (
            <option key={en.id} value={en.id}>
              {en.name}
            </option>
          ))}
        </select>
      )}

      {workScope.entranceId && (
        <select
          style={selectStyle}
          value={workScope.unitId ?? ''}
          onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : null
            const found = units.find((x) => x.node.id === id)
            const label = found
              ? `${UNIT_TYPE_LABEL[found.node.unit_type || ''] || 'יחידה'} ${found.node.short_code || found.node.number || ''}`.trim()
              : null
            setWorkScope({ ...workScope, unitId: id, unitName: label })
          }}
        >
          <option value="">בחר יחידה</option>
          {units.map(({ node, floor }) => (
            <option key={node.id} value={node.id}>
              {UNIT_TYPE_LABEL[node.unit_type || ''] || 'יחידה'} {node.short_code || node.number || ''} · {floor}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
