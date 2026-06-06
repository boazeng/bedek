import { useEffect, useState } from 'react'
import {
  Projects,
  ProjectTree,
  SystemLocations,
  Templates,
  type Project,
  type ProjectItemKind,
  type ProjectItemNode,
  type TemplateListRow,
} from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useAlert } from '../components/Dialog'
import LoginPage from './LoginPage'
import TactLogo from '../components/TactLogo'
import TactIcon from '../components/TactIcon'
import Modal, { Field, inputStyle } from '../components/Modal'
import ProjectTreeNode from '../components/ProjectTreeNode'

type Props = { projectId: number }

const KIND_OPTIONS: { value: ProjectItemKind; label: string }[] = [
  { value: 'building', label: 'בניין' },
  { value: 'floor', label: 'קומה' },
  { value: 'unit', label: 'יחידה' },
  { value: 'location', label: 'מיקום' },
]

function collectAllIds(nodes: ProjectItemNode[]): Set<number> {
  const ids = new Set<number>()
  const stack = [...nodes]
  while (stack.length) {
    const n = stack.pop()!
    ids.add(n.id)
    for (const c of n.children) stack.push(c)
  }
  return ids
}

function collectIdsUpToDepth(nodes: ProjectItemNode[], maxDepth: number): Set<number> {
  const ids = new Set<number>()
  function walk(items: ProjectItemNode[], depth: number) {
    if (depth > maxDepth) return
    for (const n of items) {
      ids.add(n.id)
      walk(n.children, depth + 1)
    }
  }
  walk(nodes, 0)
  return ids
}

export default function ProjectEditorPage({ projectId }: Props) {
  const { user, loading: authLoading } = useAuth()
  const alert = useAlert()
  const [project, setProject] = useState<Project | null>(null)
  const [tree, setTree] = useState<ProjectItemNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [applyOpen, setApplyOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addParent, setAddParent] = useState<ProjectItemNode | null>(null)
  const [saveTemplateSource, setSaveTemplateSource] = useState<ProjectItemNode | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [initialized, setInitialized] = useState(false)
  // When true the tree shows only apartment units (and their locations) — non-
  // apartment units like שטחי ציבור/חניון are hidden. Floors/buildings without
  // any apartments under them are pruned too, so the view stays clean.
  const [apartmentsOnly, setApartmentsOnly] = useState(false)

  function load(silent: boolean = false) {
    // Only flip the loading flag on the *first* load (or explicit non-silent
    // refresh). Silent refreshes happen after inline edits — toggling loading
    // would unmount the tree and steal focus mid-TAB.
    if (!silent) setLoading(true)
    Promise.all([Projects.get(projectId), ProjectTree.list(projectId)])
      .then(([p, t]) => {
        setProject(p)
        setTree(t)
      })
      .catch((e) => setError(String(e)))
      .finally(() => {
        if (!silent) setLoading(false)
      })
  }
  // Stable wrapper for child components that want a soft refresh.
  function refresh() {
    load(true)
  }
  useEffect(() => {
    if (user) load()
  }, [user, projectId])

  // Default expansion on first tree load: top two levels open.
  useEffect(() => {
    if (initialized || tree.length === 0) return
    setExpandedIds(collectIdsUpToDepth(tree, 1))
    setInitialized(true)
  }, [tree, initialized])

  function toggleExpanded(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function expandAll() {
    setExpandedIds(collectAllIds(tree))
  }
  function collapseAll() {
    setExpandedIds(new Set())
  }

  /** Deepest depth (0-based) at which any expanded id sits in the tree.
   *  Returns -1 if nothing is expanded. */
  function maxExpandedDepth(): number {
    let max = -1
    function walk(items: ProjectItemNode[], depth: number) {
      for (const n of items) {
        if (expandedIds.has(n.id) && depth > max) max = depth
        walk(n.children, depth + 1)
      }
    }
    walk(tree, 0)
    return max
  }

  function expandOneLayer() {
    setExpandedIds(collectIdsUpToDepth(tree, maxExpandedDepth() + 1))
  }
  function collapseOneLayer() {
    const cur = maxExpandedDepth()
    if (cur < 0) return  // already fully collapsed
    setExpandedIds(collectIdsUpToDepth(tree, cur - 1))
  }

  /** Filter the tree to apartment units + their descendants. Floors and
   *  buildings stay only if they have apartments under them. */
  function filterApartmentsOnly(nodes: ProjectItemNode[]): ProjectItemNode[] {
    const out: ProjectItemNode[] = []
    for (const n of nodes) {
      // Non-apartment units (and everything under them) drop out entirely.
      if (n.kind === 'unit' && n.entity_type_name !== 'דירה') continue
      const filteredChildren = filterApartmentsOnly(n.children)
      // Prune empty floors/buildings — no apartments to show.
      if (
        (n.kind === 'floor' || n.kind === 'building') &&
        filteredChildren.length === 0
      ) {
        continue
      }
      out.push({ ...n, children: filteredChildren })
    }
    return out
  }

  function toggleApartmentsOnly() {
    setApartmentsOnly((prev) => {
      const next = !prev
      // When turning the filter on, also expand everything so the user sees
      // every apartment + its locations without having to expand each row.
      if (next) setExpandedIds(collectAllIds(tree))
      return next
    })
  }

  const visibleTree = apartmentsOnly ? filterApartmentsOnly(tree) : tree

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <span style={{ color: 'var(--color-text-light)' }}>טוען…</span>
      </div>
    )
  }
  if (!user) return <LoginPage />

  function openApplyTemplate() {
    setApplyOpen(true)
  }
  function openAddRoot() {
    setAddParent(null)
    setAddOpen(true)
  }
  function openAddChild(parent: ProjectItemNode) {
    setAddParent(parent)
    setAddOpen(true)
  }

  /** Collect a node's id + all descendants by walking a tree response. */
  function collectSubtreeIds(nodes: ProjectItemNode[], rootId: number): Set<number> {
    const out = new Set<number>()
    function addAll(n: ProjectItemNode) {
      out.add(n.id)
      for (const c of n.children) addAll(c)
    }
    function locate(items: ProjectItemNode[]): boolean {
      for (const n of items) {
        if (n.id === rootId) {
          addAll(n)
          return true
        }
        if (locate(n.children)) return true
      }
      return false
    }
    locate(nodes)
    return out
  }

  function handleSaveAsTemplate(node: ProjectItemNode) {
    setSaveTemplateSource(node)
  }

  async function handleDuplicate(node: ProjectItemNode) {
    try {
      const { new_id, tree: newTree } = await ProjectTree.duplicate(projectId, node.id)
      setTree(newTree)
      const newIds = collectSubtreeIds(newTree, new_id)
      setExpandedIds((prev) => {
        const next = new Set(prev)
        for (const id of newIds) next.add(id)
        return next
      })
    } catch (e) {
      alert({ title: 'שגיאה בשכפול', message: String(e), variant: 'danger' })
    }
  }

  return (
    <div className="tact-aurora" style={{ minHeight: '100vh' }}>
      {/* Top bar */}
      <div
        style={{
          background: 'var(--color-bg-white)',
          borderBottom: '1px solid var(--color-border)',
          padding: '14px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <TactLogo word="cmm" size={0.95} />
          <span style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>
            עריכת פרויקט
          </span>
        </div>
        <button
          onClick={() => window.close()}
          className="tact-btn tact-btn-ghost"
          style={{ padding: '8px 16px', fontSize: '0.85rem' }}
        >
          סגור חלון ×
        </button>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px 60px' }}>
        {project && (
          <div style={{ marginBottom: 22 }}>
            <h1 style={{ fontSize: '1.5rem', color: 'var(--color-primary)', fontWeight: 700 }}>
              {project.name}
            </h1>
            {project.address && (
              <div style={{ fontSize: '0.88rem', color: 'var(--color-text-light)' }}>
                {project.address}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ color: 'var(--color-text-light)' }}>טוען…</div>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 14,
                justifyContent: 'flex-start',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <button onClick={openAddRoot} className="tact-btn tact-btn-primary">
                + רכיב ראשי חדש
              </button>
              <button onClick={openApplyTemplate} className="tact-btn tact-btn-ghost">
                <TactIcon name="copy" size={14} /> &nbsp;החל תבנית
              </button>
              <span style={{ flex: 1 }} />
              <button
                onClick={toggleApartmentsOnly}
                className={apartmentsOnly ? 'tact-btn tact-btn-primary' : 'tact-btn tact-btn-ghost'}
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                disabled={tree.length === 0}
                title="הצג רק דירות והמיקומים שתחתן"
              >
                🏠 דירות
              </button>
              <button
                onClick={expandAll}
                className="tact-btn tact-btn-ghost"
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                disabled={tree.length === 0}
                title="הרחב את כל הקיבוצים בעץ"
              >
                ▼ הרחב הכל
              </button>
              <button
                onClick={expandOneLayer}
                className="tact-btn tact-btn-ghost"
                style={{ padding: '8px 12px', fontSize: '1rem', fontWeight: 700 }}
                disabled={tree.length === 0}
                title="הרחב שכבה אחת"
              >
                +
              </button>
              <button
                onClick={collapseOneLayer}
                className="tact-btn tact-btn-ghost"
                style={{ padding: '8px 12px', fontSize: '1rem', fontWeight: 700 }}
                disabled={tree.length === 0}
                title="כווץ שכבה אחת"
              >
                −
              </button>
              <button
                onClick={collapseAll}
                className="tact-btn tact-btn-ghost"
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                disabled={tree.length === 0}
                title="קבץ את כל הקיבוצים"
              >
                ◀ קבץ הכל
              </button>
            </div>

            {error && (
              <div style={{ color: 'var(--color-accent)', marginBottom: 10 }}>{error}</div>
            )}

            {/* Tree table */}
            <div
              style={{
                background: 'var(--color-bg-white)',
                border: '1px solid var(--color-border)',
                borderRadius: 14,
                overflow: 'hidden',
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '110px 75px 190px 110px 230px 90px 90px 120px 40px',
                  gap: 6,
                  padding: '10px 14px',
                  background: 'var(--color-primary-soft)',
                  borderBottom: '1px solid var(--color-border)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: 'var(--color-primary)',
                  letterSpacing: '0.02em',
                }}
              >
                <span>פעולות</span>
                <span>קוד זיהוי</span>
                <span>סוג</span>
                <span>קומה</span>
                <span>שם</span>
                <span style={{ textAlign: 'center' }}>מס׳ דירה זמני</span>
                <span style={{ textAlign: 'center' }}>מס׳ דירה קבוע</span>
                <span>כיוון</span>
                <span style={{ textAlign: 'center' }} title="שמור כתבנית בחברה">תבנית</span>
              </div>

              {visibleTree.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-light)' }}>
                  {tree.length === 0
                    ? 'הפרויקט ריק. החל תבנית או הוסף רכיב ראשי כדי להתחיל.'
                    : apartmentsOnly
                      ? 'אין דירות בפרויקט. כבי את מסנן "דירות" כדי לראות את העץ המלא.'
                      : 'אין רכיבים להצגה.'}
                </div>
              ) : (
                visibleTree.map((node) => (
                  <ProjectTreeNode
                    key={node.id}
                    node={node}
                    siblings={visibleTree}
                    projectId={projectId}
                    depth={0}
                    expandedIds={expandedIds}
                    onToggleExpanded={toggleExpanded}
                    onChanged={refresh}
                    onAddChild={openAddChild}
                    onDuplicate={handleDuplicate}
                    onSaveAsTemplate={handleSaveAsTemplate}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>

      <ApplyTemplateDialog
        open={applyOpen}
        projectId={projectId}
        companyId={project?.company_id}
        parentId={null}
        onClose={() => setApplyOpen(false)}
        onApplied={() => {
          setApplyOpen(false)
          load()
        }}
        onError={(msg) => alert({ title: 'שגיאה', message: msg, variant: 'danger' })}
      />

      <AddItemDialog
        open={addOpen}
        projectId={projectId}
        companyId={project?.company_id}
        parent={addParent}
        onClose={() => setAddOpen(false)}
        onAdded={() => {
          setAddOpen(false)
          load()
        }}
        onError={(msg) => alert({ title: 'שגיאה', message: msg, variant: 'danger' })}
      />

      <SaveAsTemplateDialog
        open={saveTemplateSource !== null}
        projectId={projectId}
        source={saveTemplateSource}
        onClose={() => setSaveTemplateSource(null)}
        onSaved={(tplName) => {
          setSaveTemplateSource(null)
          alert({
            title: 'התבנית נשמרה',
            message: `התבנית "${tplName}" נשמרה בתבניות החברה. תוכלי להחיל אותה על פרויקטים אחרים מאותה חברה.`,
            variant: 'success',
          })
        }}
        onError={(msg) => alert({ title: 'שגיאה', message: msg, variant: 'danger' })}
      />
    </div>
  )
}

// ---------- Save-as-Template Dialog ----------

function SaveAsTemplateDialog({
  open,
  projectId,
  source,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean
  projectId: number
  source: ProjectItemNode | null
  onClose: () => void
  onSaved: (name: string) => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !source) return
    // Default the template name to the source node's name as a starting point.
    setName(source.name)
    setCode('')
    setDescription('')
  }, [open, source?.id])

  async function save() {
    if (!source) return
    if (!name.trim()) {
      onError('יש להזין שם לתבנית')
      return
    }
    setSaving(true)
    try {
      await ProjectTree.saveAsTemplate(projectId, source.id, {
        name: name.trim(),
        code: code.trim() || null,
        description: description.trim() || null,
      })
      onSaved(name.trim())
    } catch (e) {
      onError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={source ? `שמור "${source.name}" כתבנית חברה` : 'שמור כתבנית'}
      onClose={onClose}
      width={520}
      footer={
        <>
          <button className="tact-btn tact-btn-ghost" onClick={onClose}>
            ביטול
          </button>
          <button className="tact-btn tact-btn-primary" onClick={save} disabled={saving}>
            {saving ? 'שומר…' : 'שמור תבנית'}
          </button>
        </>
      }
    >
      <Field
        label="שם התבנית"
        hint="ככה היא תופיע ברשימת התבניות של החברה. כל הרכיבים והמיקומים מתחת ייכנסו לתבנית."
      >
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field label="קוד יחודי (אופציונלי)">
        <input
          style={{ ...inputStyle, fontFamily: 'var(--font-family-en)' }}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </Field>
      <Field label="תיאור (אופציונלי)">
        <textarea
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
    </Modal>
  )
}

// ---------- Apply Template Dialog ----------

function ApplyTemplateDialog({
  open,
  projectId,
  companyId,
  parentId,
  onClose,
  onApplied,
  onError,
}: {
  open: boolean
  projectId: number
  companyId: number | undefined
  parentId: number | null
  onClose: () => void
  onApplied: () => void
  onError: (msg: string) => void
}) {
  const [templates, setTemplates] = useState<TemplateListRow[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (!open) return
    Templates.list({ companyId })
      .then((tpls) => {
        const active = tpls.filter((t) => t.is_active)
        setTemplates(active)
        setSelectedId(active[0]?.id ?? null)
      })
      .catch((e) => onError(String(e)))
  }, [open])

  async function apply() {
    if (!selectedId) return
    setApplying(true)
    try {
      await ProjectTree.applyTemplate(projectId, selectedId, parentId)
      onApplied()
    } catch (e) {
      onError(String(e))
    } finally {
      setApplying(false)
    }
  }

  return (
    <Modal
      open={open}
      title="החל תבנית על הפרויקט"
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="tact-btn tact-btn-ghost" onClick={onClose}>
            ביטול
          </button>
          <button className="tact-btn tact-btn-primary" onClick={apply} disabled={!selectedId || applying}>
            {applying ? 'מחיל…' : 'החל'}
          </button>
        </>
      }
    >
      <Field label="בחר תבנית">
        <select
          style={inputStyle}
          value={selectedId ?? ''}
          onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.entity_type_name ? ` · ${t.entity_type_name}` : ''}
            </option>
          ))}
        </select>
      </Field>
      <div style={{ fontSize: '0.82rem', color: 'var(--color-text-light)' }}>
        התבנית תורחב לעץ של רכיבים (בניין → קומות → יחידות → מיקומים). פריטים קיימים בפרויקט יישארו ללא שינוי.
      </div>
    </Modal>
  )
}

// ---------- Add Item Dialog ----------

type AddMode = 'template' | 'location' | 'manual'

function AddItemDialog({
  open,
  projectId,
  companyId,
  parent,
  onClose,
  onAdded,
  onError,
}: {
  open: boolean
  projectId: number
  companyId: number | undefined
  parent: ProjectItemNode | null
  onClose: () => void
  onAdded: () => void
  onError: (msg: string) => void
}) {
  // Under a floor, the only sensible children are units (from templates) or
  // free-form locations. Default to the template picker since most apartments
  // have a reusable template.
  const isUnderFloor = parent?.kind === 'floor'
  const defaultMode: AddMode = isUnderFloor ? 'template' : 'manual'

  const defaultKind: ProjectItemKind = parent
    ? parent.kind === 'building'
      ? 'floor'
      : parent.kind === 'floor'
        ? 'unit'
        : 'location'
    : 'building'

  const [mode, setMode] = useState<AddMode>(defaultMode)
  const [kind, setKind] = useState<ProjectItemKind>(defaultKind)
  const [name, setName] = useState('')
  const [direction, setDirection] = useState('')
  const [saving, setSaving] = useState(false)

  // For floor-parent mode: template picker + location picker.
  const [templates, setTemplates] = useState<TemplateListRow[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [locationNames, setLocationNames] = useState<string[]>([])
  const [selectedLocationName, setSelectedLocationName] = useState<string>('')

  useEffect(() => {
    if (!open) return
    setMode(defaultMode)
    setKind(defaultKind)
    setName('')
    setDirection('')
    setSelectedTemplateId(null)
    setSelectedLocationName('')

    // Only fetch options when we need them.
    if (isUnderFloor) {
      Templates.list({ companyId })
        .then((all) => {
          // Exclude templates that produce a 'building' wrapper — those don't
          // belong directly under a floor.
          const usable = all.filter(
            (t) => t.is_active && (t as any).entity_type_name,
          )
          setTemplates(usable)
          if (usable.length) setSelectedTemplateId(usable[0].id)
        })
        .catch((e) => onError(String(e)))
      SystemLocations.list()
        .then((names) => {
          setLocationNames(names)
          if (names.length) setSelectedLocationName(names[0])
        })
        .catch((e) => onError(String(e)))
    }
  }, [open, parent?.id])

  async function save() {
    setSaving(true)
    try {
      if (mode === 'template') {
        if (!selectedTemplateId) {
          onError('יש לבחור תבנית')
          return
        }
        await ProjectTree.applyTemplate(projectId, selectedTemplateId, parent?.id ?? null)
      } else if (mode === 'location') {
        const locName = selectedLocationName.trim()
        if (!locName) {
          onError('יש לבחור מיקום')
          return
        }
        await ProjectTree.create(projectId, {
          kind: 'location',
          name: locName,
          direction: null,
          parent_id: parent?.id ?? null,
        })
      } else {
        if (!name.trim()) {
          onError('יש להזין שם')
          return
        }
        await ProjectTree.create(projectId, {
          kind,
          name: name.trim(),
          direction: direction.trim() || null,
          parent_id: parent?.id ?? null,
        })
      }
      onAdded()
    } catch (e) {
      onError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '8px 12px',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    background: active ? 'var(--color-primary)' : 'transparent',
    color: active ? 'var(--color-text-white)' : 'var(--color-text)',
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '0.88rem',
    transition: 'background .15s, color .15s',
  })

  return (
    <Modal
      open={open}
      title={parent ? `הוספה תחת "${parent.name}"` : 'הוספת רכיב ראשי'}
      onClose={onClose}
      width={520}
      footer={
        <>
          <button className="tact-btn tact-btn-ghost" onClick={onClose}>
            ביטול
          </button>
          <button className="tact-btn tact-btn-primary" onClick={save} disabled={saving}>
            {saving ? 'מוסיף…' : mode === 'template' ? 'החל תבנית' : 'הוסף'}
          </button>
        </>
      }
    >
      {isUnderFloor && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <button onClick={() => setMode('template')} style={tabStyle(mode === 'template')}>
            ישות מתבנית
          </button>
          <button onClick={() => setMode('location')} style={tabStyle(mode === 'location')}>
            מיקום
          </button>
        </div>
      )}

      {isUnderFloor && mode === 'template' && (
        <Field label="בחר תבנית" hint='למשל "דירה 4 חדרים" — הישות תיווצר לפי סוג התבנית'>
          <select
            style={inputStyle}
            value={selectedTemplateId ?? ''}
            onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : null)}
          >
            {templates.length === 0 && <option value="">— אין תבניות פעילות —</option>}
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.entity_type_name ? ` · ${t.entity_type_name}` : ''}
              </option>
            ))}
          </select>
        </Field>
      )}

      {isUnderFloor && mode === 'location' && (
        <Field label="בחר מיקום" hint='למשל "לובי קומתי", "חדר אשפה"'>
          <select
            style={inputStyle}
            value={selectedLocationName}
            onChange={(e) => setSelectedLocationName(e.target.value)}
          >
            {locationNames.length === 0 && <option value="">— אין מיקומים פעילים —</option>}
            {locationNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
      )}

      {!isUnderFloor && (
        <>
          <Field label="סוג">
            <select style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value as ProjectItemKind)}>
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="שם">
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="כיוון (אופציונלי)" hint="מספור היררכי יוקצה אוטומטית">
            <input style={inputStyle} value={direction} onChange={(e) => setDirection(e.target.value)} />
          </Field>
        </>
      )}
    </Modal>
  )
}
