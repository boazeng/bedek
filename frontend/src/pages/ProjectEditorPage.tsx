import { useEffect, useState } from 'react'
import { Projects, ProjectTree, type Project, type ProjectItemNode } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useAlert, useConfirm } from '../components/Dialog'
import LoginPage from './LoginPage'
import TactLogo from '../components/TactLogo'
import BuildingNode from '../components/builder/BuildingNode'
import UnitPalette from '../components/builder/UnitPalette'

type Props = { projectId: number }

export default function ProjectEditorPage({ projectId }: Props) {
  const { user, loading: authLoading } = useAuth()
  const alert = useAlert()
  const confirm = useConfirm()
  const [project, setProject] = useState<Project | null>(null)
  const [tree, setTree] = useState<ProjectItemNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function load(silent = false) {
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
  const refresh = () => load(true)

  useEffect(() => {
    if (user) load()
  }, [user, projectId])

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
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <button className="tact-btn tact-btn-primary" onClick={addBuilding} disabled={busy}>
              + בניין
            </button>
            <button className="tact-btn tact-btn-ghost" onClick={renumber} disabled={busy || tree.length === 0}>
              מספור דירות מחדש
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
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
