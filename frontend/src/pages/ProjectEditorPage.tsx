import { useEffect, useRef, useState } from 'react'
import { Buyers, Projects, ProjectTree, type Buyer, type Project, type ProjectItemNode } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useAlert, useConfirm } from '../components/Dialog'
import LoginPage from './LoginPage'
import TactLogo from '../components/TactLogo'
import BuildingNode from '../components/builder/BuildingNode'
import UnitPalette from '../components/builder/UnitPalette'
import { PUBLIC_OWNER, floorNumberLabel, type CollapseCmd } from '../components/builder/shared'

type Props = { projectId: number }

export default function ProjectEditorPage({ projectId }: Props) {
  const { user, loading: authLoading } = useAuth()
  const alert = useAlert()
  const confirm = useConfirm()
  const [project, setProject] = useState<Project | null>(null)
  const [tree, setTree] = useState<ProjectItemNode[]>([])
  const [buyers, setBuyers] = useState<Buyer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [collapseCmd, setCollapseCmd] = useState<CollapseCmd>({ all: false, n: 0 })

  function load(silent = false) {
    if (!silent) setLoading(true)
    Promise.all([Projects.get(projectId), ProjectTree.list(projectId)])
      .then(([p, t]) => {
        setProject(p)
        setTree(t)
        // Project buyers power the per-unit customer picker.
        Buyers.list({
          companyId: user?.role === 'super_admin' ? p.company_id : undefined,
          projectId,
        })
          .then(setBuyers)
          .catch(() => setBuyers([]))
      })
      .catch((e) => setError(String(e)))
      .finally(() => {
        if (!silent) setLoading(false)
      })
  }
  const refresh = () => load(true)

  useEffect(() => {
    if (user) load()
  }, [user, projectId])

  // Auto-correct public-area units whenever the tree loads: owner = הועד and
  // number = floor number. Fixes projects built before this rule existed.
  const fixingPublic = useRef(false)
  useEffect(() => {
    if (loading || tree.length === 0 || fixingPublic.current) return
    const pending: { id: number; number: string; name: string }[] = []
    for (const b of tree)
      for (const e of b.children)
        for (const f of e.children) {
          const numLabel = floorNumberLabel(f.name)
          const wantName = `ציבורי ${numLabel}`.trim()
          for (const u of f.children) {
            if (u.unit_type !== 'public_area') continue
            if (u.short_code !== numLabel || u.customer_name !== PUBLIC_OWNER || u.name !== wantName)
              pending.push({ id: u.id, number: numLabel, name: wantName })
          }
        }
    if (pending.length === 0) return
    fixingPublic.current = true
    ;(async () => {
      for (const p of pending)
        await ProjectTree.update(projectId, p.id, {
          number: p.number,
          name: p.name,
          customer_name: PUBLIC_OWNER,
        })
      fixingPublic.current = false
      refresh()
    })()
  }, [tree, loading])

  async function confirmDelete(label: string): Promise<boolean> {
    return confirm({
      title: 'מחיקה',
      message: `למחוק את ${label}? פעולה זו לא ניתנת לביטול.`,
      variant: 'danger',
      confirmLabel: 'מחק',
    })
  }

  async function addBuilding() {
    setBusy(true)
    try {
      const building = await ProjectTree.create(projectId, {
        kind: 'building',
        name: `בניין ${tree.length + 1}`,
        parent_id: null,
      })
      // Every building starts with one entrance by default.
      await ProjectTree.create(projectId, {
        kind: 'entrance',
        name: 'כניסה א',
        parent_id: building.id,
      })
      refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  async function renumber() {
    setBusy(true)
    try {
      const res = await ProjectTree.renumber(projectId)
      await alert({
        title: 'מספור מחדש',
        message: `מוספרו מחדש ${res.renumbered} דירות (רצוף בכל כניסה).`,
        variant: 'success',
      })
      refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  // Re-sequence the regular floors (קומה 1, 2, 3…) in each entrance, in order.
  // Basements (מרתף) and the ground floor (קרקע) are left untouched. Also
  // normalizes public-area units: owner = הועד, number = floor number.
  async function renumberFloors() {
    setBusy(true)
    try {
      let renamed = 0
      for (const building of tree) {
        for (const entrance of building.children) {
          let n = 0
          for (const floor of entrance.children) {
            const isSpecial = floor.name.includes('מרתף') || floor.name.includes('קרקע')
            let floorName = floor.name
            if (!isSpecial) {
              n += 1
              const desired = `קומה ${n}`
              if (floor.name !== desired) {
                await ProjectTree.update(projectId, floor.id, { name: desired })
                renamed += 1
              }
              floorName = desired
            }
            // Fix public-area units on this floor.
            const numLabel = floorNumberLabel(floorName)
            for (const u of floor.children) {
              if (u.unit_type !== 'public_area') continue
              const wantName = `ציבורי ${numLabel}`.trim()
              if (u.short_code !== numLabel || u.customer_name !== PUBLIC_OWNER || u.name !== wantName) {
                await ProjectTree.update(projectId, u.id, {
                  number: numLabel,
                  name: wantName,
                  customer_name: PUBLIC_OWNER,
                })
              }
            }
          }
        }
      }
      await alert({
        title: 'מספור קומות מחדש',
        message: `מוספרו מחדש ${renamed} קומות (ללא מרתף וקרקע) ויחידות הציבורי עודכנו (בעלים: הועד, מספר = מספר הקומה).`,
        variant: 'success',
      })
      refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <span style={{ color: 'var(--color-text-light)' }}>טוען…</span>
      </div>
    )
  }
  if (!user) return <LoginPage />

  return (
    <div className="tact-aurora" style={{ minHeight: '100vh' }}>
      <div
        style={{
          background: 'var(--color-bg-white)',
          borderBottom: '1px solid var(--color-border)',
          padding: '14px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <TactLogo word="cmm" size={0.9} />
          <div>
            <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
              {project?.name || 'פרויקט'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-light)' }}>
              בניית מבנה הפרויקט — בניין · כניסה · קומה · יחידת ממכר
            </div>
          </div>
        </div>
        <a href="/" className="tact-btn tact-btn-ghost" style={{ fontSize: '0.85rem' }}>
          ← חזרה למערכת
        </a>
      </div>

      <div
        style={{
          maxWidth: 1140,
          margin: '0 auto',
          padding: '22px 20px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 18,
        }}
      >
        {/* Side palette — always visible, sticky while scrolling the tree. */}
        <aside
          style={{
            width: 210,
            flexShrink: 0,
            position: 'sticky',
            top: 16,
          }}
        >
          <UnitPalette vertical />
        </aside>

        {/* Main column — actions + structure tree. */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="tact-btn tact-btn-primary" onClick={addBuilding} disabled={busy}>
              + בניין
            </button>
            <button className="tact-btn tact-btn-ghost" onClick={renumber} disabled={busy || tree.length === 0}>
              מספור דירות מחדש
            </button>
            <button className="tact-btn tact-btn-ghost" onClick={renumberFloors} disabled={busy || tree.length === 0}>
              מספור קומות מחדש
            </button>
            <span style={{ flex: 1 }} />
            <button
              className="tact-btn tact-btn-ghost"
              onClick={() => setCollapseCmd((c) => ({ all: true, n: c.n + 1 }))}
              disabled={tree.length === 0}
            >
              כווץ הכל
            </button>
            <button
              className="tact-btn tact-btn-ghost"
              onClick={() => setCollapseCmd((c) => ({ all: false, n: c.n + 1 }))}
              disabled={tree.length === 0}
            >
              הרחב הכל
            </button>
          </div>

          {error && <div style={{ color: 'var(--color-accent)', marginBottom: 10 }}>{error}</div>}

          {loading ? (
            <div style={{ color: 'var(--color-text-light)' }}>טוען…</div>
          ) : tree.length === 0 ? (
            <div
              style={{
                background: 'var(--color-bg-white)',
                border: '1px dashed var(--color-border)',
                borderRadius: 14,
                padding: '60px 20px',
                textAlign: 'center',
                color: 'var(--color-text-light)',
              }}
            >
              <div style={{ fontSize: '0.95rem', marginBottom: 6 }}>הפרויקט עדיין ריק</div>
              <div style={{ fontSize: '0.82rem' }}>
                לחץ "+ בניין" כדי להתחיל. אחר כך הוסף קומות וגרור יחידות מהפאנל שבצד אל כל קומה.
              </div>
            </div>
          ) : (
            tree.map((b) => (
              <BuildingNode
                key={b.id}
                projectId={projectId}
                building={b}
                onRefresh={refresh}
                onConfirmDelete={confirmDelete}
                collapseCmd={collapseCmd}
                buyers={buyers}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
