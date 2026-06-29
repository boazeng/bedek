import { useEffect, useRef, useState } from 'react'
import { Attachments, type Attachment, type AttachmentTarget } from '../lib/api'
import { useConfirm } from './Dialog'

type Props = {
  target: AttachmentTarget
  canWrite?: boolean
  title?: string
}

function fmtSize(n: number | null): string {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** Upload / list / delete documents attached to a malfunction or a project item. */
export default function AttachmentsPanel({ target, canWrite = true, title = 'מסמכים וקבצים' }: Props) {
  const confirm = useConfirm()
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const key = target.malfunctionId ?? `i${target.projectItemId}`

  function load() {
    setLoading(true)
    Attachments.list(target)
      .then(setRows)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }
  useEffect(load, [key])

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        await Attachments.upload(file, target)
      }
      load()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function remove(a: Attachment) {
    const ok = await confirm({
      title: 'מחיקת קובץ',
      message: `למחוק את "${a.original_filename || 'הקובץ'}"?`,
      variant: 'danger',
      confirmLabel: 'מחק',
    })
    if (!ok) return
    await Attachments.remove(a.id)
    load()
  }

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-primary)' }}>
          {title} ({rows.length})
        </div>
        {canWrite && (
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => onFiles(e.target.files)}
            />
            <button
              type="button"
              className="tact-btn tact-btn-ghost"
              style={{ padding: '5px 12px', fontSize: '0.8rem' }}
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? 'מעלה…' : '+ העלה קובץ'}
            </button>
          </>
        )}
      </div>

      {error && <div style={{ color: 'var(--color-accent)', fontSize: '0.8rem', marginBottom: 6 }}>{error}</div>}

      {loading ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>טוען…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>אין קבצים מצורפים.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rows.map((a) => (
            <div
              key={a.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '6px 10px',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                background: 'var(--color-bg-white)',
                fontSize: '0.82rem',
              }}
            >
              <span aria-hidden>📎</span>
              <a
                href={a.download_url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}
              >
                {a.original_filename || 'קובץ'}
              </a>
              <span style={{ color: 'var(--color-text-light)' }}>{fmtSize(a.size_bytes)}</span>
              <span style={{ flex: 1 }} />
              {canWrite && (
                <button
                  type="button"
                  onClick={() => remove(a)}
                  className="tact-btn tact-btn-ghost"
                  title="מחק קובץ"
                  style={{ padding: '3px 8px', fontSize: '0.8rem', color: 'var(--color-accent)' }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
