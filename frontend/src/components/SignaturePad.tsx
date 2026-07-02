import { useEffect, useRef } from 'react'

type Props = {
  /** Existing signature as a PNG data-URL, or null. Loaded once on mount. */
  value: string | null
  onChange: (dataUrl: string | null) => void
}

const W = 600
const H = 180

/**
 * A lightweight canvas signature pad — draw with mouse/touch, emits a PNG
 * data-URL on each stroke end. No external dependencies.
 */
export default function SignaturePad({ value, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const dirty = useRef(false)

  // Draw the incoming value once on mount.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.lineWidth = 2.2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1F3A5F'
    if (value) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, W, H)
      img.src = value
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!
    const rect = c.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    }
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    drawing.current = true
    last.current = pos(e)
    canvasRef.current?.setPointerCapture(e.pointerId)
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !last.current) return
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    dirty.current = true
  }

  function up() {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    if (dirty.current && canvasRef.current) {
      onChange(canvasRef.current.toDataURL('image/png'))
    }
  }

  function clear() {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (c && ctx) ctx.clearRect(0, 0, W, H)
    dirty.current = false
    onChange(null)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        style={{
          width: '100%',
          height: 160,
          border: '1px dashed var(--color-border)',
          borderRadius: 8,
          background: 'var(--color-bg-white)',
          touchAction: 'none',
          cursor: 'crosshair',
          display: 'block',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-light)' }}>חתום כאן</span>
        <button
          type="button"
          className="tact-btn tact-btn-ghost"
          style={{ padding: '2px 12px', fontSize: '0.75rem' }}
          onClick={clear}
        >
          נקה
        </button>
      </div>
    </div>
  )
}
