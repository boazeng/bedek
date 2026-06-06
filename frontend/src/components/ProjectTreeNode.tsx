import { useEffect, useRef, useState } from 'react'
import TactIcon from './TactIcon'
import { useConfirm } from './Dialog'
import { ProjectTree, type ProjectItemNode } from '../lib/api'

type Props = {
  node: ProjectItemNode
  /** All siblings of `node` in tree order — used for move-up/down. */
  siblings: ProjectItemNode[]
  projectId: number
  depth: number
  expandedIds: Set<number>
  onToggleExpanded: (id: number) => void
  onChanged: () => void   // notify parent (re-fetch tree)
  onAddChild: (parent: ProjectItemNode) => void
  /** Parent handles the API call + post-duplicate expansion of the new subtree. */
  onDuplicate: (node: ProjectItemNode) => void
  /** Parent opens a modal to capture the template name, then calls the API. */
  onSaveAsTemplate: (node: ProjectItemNode) => void
}

const KIND_LABEL: Record<string, string> = {
  building: 'בניין',
  floor: 'קומה',
  unit: 'יחידה',
  location: 'מיקום',
}

// Compass options for the direction column. Order matches the user's spec
// (counter-clockwise starting from north).
const DIRECTIONS = [
  'צפון',
  'צפון מערב',
  'מערב',
  'דרום מערב',
  'דרום',
  'דרום מזרח',
  'מזרח',
  'צפון מזרח',
] as const

const KIND_BADGE_CLASS: Record<string, string> = {
  building: 'tact-badge-on',
  floor: 'tact-badge-new',
  unit: 'tact-badge-pos',
  location: 'tact-badge-soon',
}

const KIND_ICON: Record<string, string> = {
  building: 'building',
  floor: 'layout',
  unit: 'document',
  location: 'layout',
}

const cellInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 8px',
  border: '1px solid transparent',
  borderRadius: 6,
  background: 'transparent',
  fontFamily: 'inherit',
  fontSize: '0.88rem',
  color: 'var(--color-text)',
}

const cellInputFocused: React.CSSProperties = {
  border: '1px solid var(--color-primary-soft)',
  background: 'var(--color-bg-white)',
}

const miniBtn: React.CSSProperties = {
  width: 24,
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--color-border)',
  borderRadius: 5,
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '0.7rem',
  color: 'var(--color-primary)',
  padding: 0,
  lineHeight: 1,
}

export default function ProjectTreeNode({
  node,
  siblings,
  projectId,
  depth,
  expandedIds,
  onToggleExpanded,
  onChanged,
  onAddChild,
  onDuplicate,
  onSaveAsTemplate,
}: Props) {
  const confirm = useConfirm()
  const expanded = expandedIds.has(node.id)
  const [name, setName] = useState(node.name)
  const [direction, setDirection] = useState(node.direction || '')
  const [tempApt, setTempApt] = useState(node.temp_apt_number || '')
  const [permApt, setPermApt] = useState(node.permanent_apt_number || '')
  const [floor, setFloor] = useState(node.floor_name || '')
  const [customer, setCustomer] = useState(node.customer_name || '')
  const floorInputRef = useRef<HTMLInputElement | null>(null)
  const hasChildren = node.children.length > 0
  const isUnit = node.kind === 'unit'
  const isBuilding = node.kind === 'building'
  const isFloor = node.kind === 'floor'

  // Sync the local floor state when the prop changes (e.g. ancestor floor's
  // value cascades down to this row after a refetch). Skip if the user is
  // currently typing — we don't want to clobber an in-progress edit.
  useEffect(() => {
    if (floorInputRef.current && document.activeElement === floorInputRef.current) return
    setFloor(node.floor_name || '')
  }, [node.floor_name])

  // Persist a field change. Called on blur to avoid per-keystroke writes.
  async function persist(patch: {
    name?: string
    direction?: string
    floor?: string | null
    temp_apt_number?: string | null
    permanent_apt_number?: string | null
    customer_name?: string | null
  }) {
    try {
      await ProjectTree.update(projectId, node.id, patch)
      onChanged()
    } catch (e) {
      // Revert local state if save failed
      setName(node.name)
      setDirection(node.direction || '')
      setTempApt(node.temp_apt_number || '')
      setPermApt(node.permanent_apt_number || '')
      setFloor(node.floor_name || '')
      setCustomer(node.customer_name || '')
      throw e
    }
  }

  /** Combined onKeyDown for editable cells: handles arrow-row navigation and
   *  F10 copy-from-prev. Saves repeating the same boilerplate on every input. */
  function cellKeyHandler(
    field: 'name' | 'floor' | 'direction' | 'temp_apt' | 'perm_apt',
  ) {
    return (
      e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
    ) => {
      if (navigateRows(e)) return
      copyFromPrev(e as unknown as React.KeyboardEvent, field)
    }
  }

  /** ArrowUp/Down moves focus to the same column in the visually adjacent row.
   *  Spreadsheet-style navigation. For text inputs we respect caret position
   *  (jump only when at the field edge); for selects we always jump (the
   *  select's native arrow-cycling is overridden — user opens with Space). */
  function navigateRows(
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return false
    const el = e.currentTarget
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const start = el.selectionStart ?? 0
      const end = el.selectionEnd ?? 0
      const len = el.value.length
      // Up + caret not at start → let native arrow caret move
      if (e.key === 'ArrowUp' && (start !== 0 || end !== 0)) return false
      // Down + caret not at end → let native arrow caret move
      if (e.key === 'ArrowDown' && (start !== len || end !== len)) return false
    }
    const col = el.getAttribute('data-col')
    const row = el.closest<HTMLElement>('[data-tree-row]')
    if (!col || !row) return false
    const target = e.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling
    if (!(target instanceof HTMLElement)) return false
    const next = target.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      `[data-col="${col}"]`,
    )
    if (!next) return false
    e.preventDefault()
    next.focus()
    if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) {
      next.select?.()
    }
    return true
  }

  // F10 copies the same column's value from the previous sibling. Useful for
  // entering repetitive data down a column of apartments / locations.
  function copyFromPrev(
    e: React.KeyboardEvent,
    field: 'name' | 'floor' | 'direction' | 'temp_apt' | 'perm_apt',
  ): boolean {
    if (e.key !== 'F10') return false
    e.preventDefault()
    const idx = siblings.findIndex((s) => s.id === node.id)
    if (idx <= 0) return true
    const prev = siblings[idx - 1]
    switch (field) {
      case 'name': {
        const v = prev.name || ''
        setName(v)
        if (v && v !== node.name) persist({ name: v }).catch(() => {})
        break
      }
      case 'floor': {
        const v = prev.floor_name || ''
        setFloor(v)
        if ((node.floor_name || '') !== v) persist({ floor: v || null }).catch(() => {})
        break
      }
      case 'direction': {
        const v = prev.direction || ''
        setDirection(v)
        if ((node.direction || '') !== v) persist({ direction: v || '' }).catch(() => {})
        break
      }
      case 'temp_apt': {
        const v = prev.temp_apt_number || ''
        setTempApt(v)
        if ((node.temp_apt_number || '') !== v) persist({ temp_apt_number: v || null }).catch(() => {})
        break
      }
      case 'perm_apt': {
        const v = prev.permanent_apt_number || ''
        setPermApt(v)
        if ((node.permanent_apt_number || '') !== v) persist({ permanent_apt_number: v || null }).catch(() => {})
        break
      }
    }
    return true
  }

  async function remove() {
    const ok = await confirm({
      title: 'מחיקת רכיב',
      message: `למחוק את "${node.name}"? כל הרכיבים מתחתיו יימחקו גם.`,
      variant: 'danger',
      confirmLabel: 'מחק',
    })
    if (!ok) return
    await ProjectTree.remove(projectId, node.id)
    onChanged()
  }

  function duplicate() {
    onDuplicate(node)
  }

  const myIdx = siblings.findIndex((s) => s.id === node.id)
  const canMoveUp = myIdx > 0
  const canMoveDown = myIdx >= 0 && myIdx < siblings.length - 1

  async function move(dir: 'up' | 'down') {
    if (dir === 'up' && !canMoveUp) return
    if (dir === 'down' && !canMoveDown) return
    const swap = dir === 'up' ? myIdx - 1 : myIdx + 1
    const reordered = [...siblings]
    ;[reordered[myIdx], reordered[swap]] = [reordered[swap], reordered[myIdx]]
    await ProjectTree.reorder(
      projectId,
      node.parent_id,
      reordered.map((s) => s.id),
    )
    onChanged()
  }

  // Cap indent so the chevron+kind cell doesn't grow unbounded for deep trees.
  const indent = Math.min(depth, 5) * 12
  // Prefer the specific entity type name on the badge (e.g. "דירה") over the
  // generic kind label ("יחידה").
  const badgeLabel = node.entity_type_name || KIND_LABEL[node.kind] || node.kind

  return (
    <>
      <div
        data-tree-row={node.id}
        style={{
          display: 'grid',
          gridTemplateColumns: '110px 75px 190px 110px 230px 90px 90px 120px 40px',
          gap: 6,
          alignItems: 'center',
          padding: '6px 10px',
          borderBottom: '1px solid var(--color-border)',
          background: depth === 0 ? 'var(--color-primary-soft)' : 'var(--color-bg-white)',
        }}
      >
        {/* Actions — placed first so they appear at the RTL start (rightmost).
            Up/down arrows are stacked vertically to save horizontal space. */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-start' }}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 1 }}>
            <button
              onClick={() => move('up')}
              disabled={!canMoveUp}
              tabIndex={-1}
              title="הזז למעלה"
              style={{
                width: 22,
                height: 13,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: '1px solid var(--color-border)',
                borderRadius: 3,
                cursor: canMoveUp ? 'pointer' : 'not-allowed',
                color: canMoveUp ? 'var(--color-primary)' : 'var(--color-text-light)',
                opacity: canMoveUp ? 1 : 0.35,
                fontFamily: 'inherit',
                fontSize: '0.55rem',
                padding: 0,
                lineHeight: 1,
              }}
            >
              ▲
            </button>
            <button
              onClick={() => move('down')}
              disabled={!canMoveDown}
              tabIndex={-1}
              title="הזז למטה"
              style={{
                width: 22,
                height: 13,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: '1px solid var(--color-border)',
                borderRadius: 3,
                cursor: canMoveDown ? 'pointer' : 'not-allowed',
                color: canMoveDown ? 'var(--color-primary)' : 'var(--color-text-light)',
                opacity: canMoveDown ? 1 : 0.35,
                fontFamily: 'inherit',
                fontSize: '0.55rem',
                padding: 0,
                lineHeight: 1,
              }}
            >
              ▼
            </button>
          </div>
          <button
            onClick={() => onAddChild(node)}
            tabIndex={-1}
            style={{ ...miniBtn, color: 'var(--color-pos)' }}
            title="הוסף רכיב פנימי"
          >
            +
          </button>
          <button
            onClick={duplicate}
            tabIndex={-1}
            style={{ ...miniBtn, color: 'var(--color-primary)' }}
            title='שכפל (יוסיף "עותק" של הענף ישירות מתחת)'
          >
            ⧉
          </button>
          <button
            onClick={remove}
            tabIndex={-1}
            style={{ ...miniBtn, color: 'var(--color-accent)' }}
            title="מחק"
          >
            ×
          </button>
        </div>

        {/* קוד זיהוי — short_code segment for this level (e.g. F02, U01, 01).
            The full hierarchical number is shown as a tooltip. */}
        <span
          style={{
            fontFamily: 'var(--font-family-en)',
            fontSize: '0.85rem',
            fontWeight: 700,
            color: 'var(--color-primary)',
            background: 'var(--color-primary-soft)',
            borderRadius: 6,
            padding: '3px 8px',
            display: 'inline-block',
            whiteSpace: 'nowrap',
            textAlign: 'center',
            alignSelf: 'center',
          }}
          title={node.number ? `מס׳ מלא: ${node.number}` : ''}
        >
          {node.short_code || '—'}
        </span>

        {/* Chevron + kind kept in a SINGLE cell so the kind badge is always
            right next to the toggle — depth indent shifts both together via
            paddingInlineStart, without opening a gap. */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            paddingInlineStart: indent,
            whiteSpace: 'nowrap',
          }}
        >
          <button
            onClick={() => hasChildren && onToggleExpanded(node.id)}
            disabled={!hasChildren}
            tabIndex={-1}
            style={{
              ...miniBtn,
              visibility: hasChildren ? 'visible' : 'hidden',
              border: 'none',
              background: 'transparent',
            }}
            title={expanded ? 'כווץ' : 'הרחב'}
          >
            {expanded ? '▼' : '◀'}
          </button>
          <TactIcon name={KIND_ICON[node.kind] || 'layout'} size={14} />
          <span
            className={`tact-badge ${KIND_BADGE_CLASS[node.kind] || ''}`}
            title={`סוג בעץ: ${KIND_LABEL[node.kind] || node.kind}`}
          >
            {badgeLabel}
          </span>
        </div>

        {/* קומה — editable on every non-building row. On floor rows the value
            labels the floor (and cascades to descendants without their own
            override). On units/locations: own value wins, else inherits from
            ancestor. Clearing the cell restores inheritance. */}
        {isBuilding ? (
          <span style={{ color: 'var(--color-text-light)', textAlign: 'center' }}>—</span>
        ) : (
          <input
            ref={floorInputRef}
            data-col="floor"
            style={cellInputStyle}
            value={floor}
            placeholder={isFloor ? 'מס׳ קומה' : 'בירושה מהקומה'}
            onChange={(e) => setFloor(e.target.value)}
            onFocus={(e) => Object.assign(e.currentTarget.style, cellInputFocused)}
            onBlur={(e) => {
              Object.assign(e.currentTarget.style, { border: '1px solid transparent', background: 'transparent' })
              if ((node.floor_name || '') !== floor) persist({ floor: floor || null }).catch(() => {})
            }}
            onKeyDown={cellKeyHandler('floor')}
            title={
              isFloor
                ? "F10 = העתק מהקומה הקודמת. ↑/↓ = מעבר בין שורות"
                : "בירושה מהקומה. F10 = העתק מהשורה הקודמת. ↑/↓ = מעבר בין שורות"
            }
          />
        )}

        {/* Name (auto-grow textarea so long text wraps to additional lines) */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0, padding: '2px 0' }}>
          <textarea
            data-col="name"
            rows={1}
            ref={(el) => {
              if (el) {
                el.style.height = 'auto'
                el.style.height = `${el.scrollHeight}px`
              }
            }}
            style={{
              ...cellInputStyle,
              fontWeight: 500,
              resize: 'none',
              overflow: 'hidden',
              lineHeight: 1.35,
              paddingTop: 4,
              paddingBottom: 4,
              flex: 1,
              minWidth: 0,
            }}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              e.currentTarget.style.height = 'auto'
              e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`
            }}
            onFocus={(e) => Object.assign(e.currentTarget.style, cellInputFocused)}
            onBlur={(e) => {
              Object.assign(e.currentTarget.style, { border: '1px solid transparent', background: 'transparent' })
              if (node.name !== name && name.trim()) persist({ name: name.trim() }).catch(() => {})
            }}
            onKeyDown={cellKeyHandler('name')}
            title="F10 = העתק שם מהשורה הקודמת. ↑/↓ = מעבר בין שורות"
          />
          {/* Customer label — small muted editable input shown after the
              row name (replaces the legacy template-source label). */}
          <input
            data-col="customer"
            value={customer}
            placeholder="· שם לקוח"
            style={{
              ...cellInputStyle,
              fontSize: '0.78rem',
              color: 'var(--color-text-light)',
              flexShrink: 0,
              width: 130,
              paddingTop: 4,
              paddingBottom: 4,
            }}
            onChange={(e) => setCustomer(e.target.value)}
            onFocus={(e) => Object.assign(e.currentTarget.style, cellInputFocused)}
            onBlur={(e) => {
              Object.assign(e.currentTarget.style, { border: '1px solid transparent', background: 'transparent' })
              if ((node.customer_name || '') !== customer) {
                persist({ customer_name: customer || null }).catch(() => {})
              }
            }}
            onKeyDown={(e) => {
              if (navigateRows(e)) return
              // Custom F10: copy customer_name from prev sibling.
              if (e.key === 'F10') {
                e.preventDefault()
                const idx = siblings.findIndex((s) => s.id === node.id)
                if (idx <= 0) return
                const v = siblings[idx - 1].customer_name || ''
                setCustomer(v)
                if ((node.customer_name || '') !== v) {
                  persist({ customer_name: v || null }).catch(() => {})
                }
              }
            }}
            title="F10 = העתק מהשורה הקודמת. ↑/↓ = מעבר בין שורות"
          />
        </div>

        {/* מס' דירה זמני — editable on every row. Leave blank when not relevant. */}
        <input
          data-col="temp_apt"
          style={{ ...cellInputStyle, textAlign: 'center', fontFamily: 'var(--font-family-en)' }}
          value={tempApt}
          placeholder="זמני"
          onChange={(e) => setTempApt(e.target.value)}
          onFocus={(e) => Object.assign(e.currentTarget.style, cellInputFocused)}
          onBlur={(e) => {
            Object.assign(e.currentTarget.style, { border: '1px solid transparent', background: 'transparent' })
            if ((node.temp_apt_number || '') !== tempApt) {
              persist({ temp_apt_number: tempApt || null }).catch(() => {})
            }
          }}
          onKeyDown={cellKeyHandler('temp_apt')}
          title="F10 = העתק מהשורה הקודמת. ↑/↓ = מעבר בין שורות"
        />

        {/* מס' דירה קבוע — editable on every row. */}
        <input
          data-col="perm_apt"
          style={{ ...cellInputStyle, textAlign: 'center', fontFamily: 'var(--font-family-en)' }}
          value={permApt}
          placeholder="קבוע"
          onChange={(e) => setPermApt(e.target.value)}
          onFocus={(e) => Object.assign(e.currentTarget.style, cellInputFocused)}
          onBlur={(e) => {
            Object.assign(e.currentTarget.style, { border: '1px solid transparent', background: 'transparent' })
            if ((node.permanent_apt_number || '') !== permApt) {
              persist({ permanent_apt_number: permApt || null }).catch(() => {})
            }
          }}
          onKeyDown={cellKeyHandler('perm_apt')}
          title="F10 = העתק מהשורה הקודמת. ↑/↓ = מעבר בין שורות"
        />

        {/* Direction — compass dropdown. Legacy free-text values (not in the
            preset list) are preserved by showing them as an extra option. */}
        <select
          data-col="direction"
          style={cellInputStyle}
          value={direction}
          onChange={(e) => {
            const v = e.target.value
            setDirection(v)
            if ((node.direction || '') !== v) persist({ direction: v || '' }).catch(() => {})
          }}
          onFocus={(e) => Object.assign(e.currentTarget.style, cellInputFocused)}
          onBlur={(e) =>
            Object.assign(e.currentTarget.style, { border: '1px solid transparent', background: 'transparent' })
          }
          onKeyDown={cellKeyHandler('direction')}
          title="F10 = העתק מהשורה הקודמת. ↑/↓ = מעבר בין שורות"
        >
          <option value="">—</option>
          {direction && !(DIRECTIONS as readonly string[]).includes(direction) && (
            <option value={direction}>{direction}</option>
          )}
          {DIRECTIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        {/* Save-as-company-template — last column, only for top-level
            "saveable" kinds (building or unit). Building or apartment trees
            are what makes sense to template; floors and locations are usually
            just composed from those. */}
        {(node.kind === 'building' || node.kind === 'unit') ? (
          <button
            onClick={() => onSaveAsTemplate(node)}
            tabIndex={-1}
            style={{ ...miniBtn, color: 'var(--color-primary)', fontSize: '0.9rem' }}
            title="שמור כתבנית בחברה"
          >
            ★
          </button>
        ) : (
          <span />
        )}
      </div>

      {expanded &&
        node.children.map((child) => (
          <ProjectTreeNode
            key={child.id}
            node={child}
            siblings={node.children}
            projectId={projectId}
            depth={depth + 1}
            expandedIds={expandedIds}
            onToggleExpanded={onToggleExpanded}
            onChanged={onChanged}
            onAddChild={onAddChild}
            onDuplicate={onDuplicate}
            onSaveAsTemplate={onSaveAsTemplate}
          />
        ))}
    </>
  )
}
