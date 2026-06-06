import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { inputStyle } from './Modal'

type DialogKind = 'confirm' | 'alert' | 'prompt'
type Variant = 'default' | 'danger' | 'success'

type CommonOpts = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: Variant
}
type ConfirmOpts = CommonOpts
type AlertOpts = Omit<CommonOpts, 'cancelLabel'>
type PromptOpts = CommonOpts & { initialValue?: string; placeholder?: string }

type State = {
  open: boolean
  kind: DialogKind
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  variant: Variant
  placeholder: string
  resolve?: (result: any) => void
}

const closed: State = {
  open: false,
  kind: 'alert',
  title: '',
  message: '',
  confirmLabel: 'אישור',
  cancelLabel: 'ביטול',
  variant: 'default',
  placeholder: '',
}

type Ctx = {
  confirm: (opts: ConfirmOpts | string) => Promise<boolean>
  alert: (opts: AlertOpts | string) => Promise<void>
  prompt: (opts: PromptOpts | string) => Promise<string | null>
}

const DialogContext = createContext<Ctx | null>(null)

function normalize<T extends CommonOpts>(opts: T | string): T {
  return (typeof opts === 'string' ? ({ message: opts } as T) : opts)
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(closed)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (state.open && state.kind === 'prompt') {
      // Focus the input shortly after the dialog renders.
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [state.open, state.kind])

  const confirm = useCallback<Ctx['confirm']>((opts) => {
    const o = normalize<ConfirmOpts>(opts)
    return new Promise<boolean>((resolve) => {
      setState({
        open: true,
        kind: 'confirm',
        title: o.title || 'אישור פעולה',
        message: o.message,
        confirmLabel: o.confirmLabel || 'אישור',
        cancelLabel: o.cancelLabel || 'ביטול',
        variant: o.variant || 'default',
        placeholder: '',
        resolve,
      })
    })
  }, [])

  const alert = useCallback<Ctx['alert']>((opts) => {
    const o = normalize<AlertOpts>(opts)
    return new Promise<void>((resolve) => {
      setState({
        open: true,
        kind: 'alert',
        title: o.title || 'הודעה',
        message: o.message,
        confirmLabel: o.confirmLabel || 'אישור',
        cancelLabel: '',
        variant: o.variant || 'default',
        placeholder: '',
        resolve: () => resolve(),
      })
    })
  }, [])

  const prompt = useCallback<Ctx['prompt']>((opts) => {
    const o = normalize<PromptOpts>(opts)
    setValue(o.initialValue || '')
    return new Promise<string | null>((resolve) => {
      setState({
        open: true,
        kind: 'prompt',
        title: o.title || 'הזן ערך',
        message: o.message,
        confirmLabel: o.confirmLabel || 'אישור',
        cancelLabel: o.cancelLabel || 'ביטול',
        variant: o.variant || 'default',
        placeholder: o.placeholder || '',
        resolve,
      })
    })
  }, [])

  function handleConfirm() {
    if (!state.resolve) return setState(closed)
    if (state.kind === 'prompt') state.resolve(value)
    else if (state.kind === 'confirm') state.resolve(true)
    else state.resolve(undefined)
    setState(closed)
  }
  function handleCancel() {
    if (!state.resolve) return setState(closed)
    if (state.kind === 'prompt') state.resolve(null)
    else if (state.kind === 'confirm') state.resolve(false)
    else state.resolve(undefined)
    setState(closed)
  }

  const ctx = useMemo(() => ({ confirm, alert, prompt }), [confirm, alert, prompt])

  return (
    <DialogContext.Provider value={ctx}>
      {children}
      <DialogView
        state={state}
        value={value}
        onValueChange={setValue}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        inputRef={inputRef}
      />
    </DialogContext.Provider>
  )
}

function useDialog(): Ctx {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be inside DialogProvider')
  return ctx
}
export function useConfirm() {
  return useDialog().confirm
}
export function useAlert() {
  return useDialog().alert
}
export function usePrompt() {
  return useDialog().prompt
}

// ----- Visual dialog -----

const variantAccent: Record<Variant, string> = {
  default: 'var(--color-primary)',
  danger: 'var(--color-accent)',
  success: 'var(--color-pos)',
}

function DialogView({
  state,
  value,
  onValueChange,
  onConfirm,
  onCancel,
  inputRef,
}: {
  state: State
  value: string
  onValueChange: (v: string) => void
  onConfirm: () => void
  onCancel: () => void
  inputRef: React.RefObject<HTMLInputElement>
}) {
  if (!state.open) return null
  const accent = variantAccent[state.variant]

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      onConfirm()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div
      onClick={state.kind === 'alert' ? onConfirm : onCancel}
      onKeyDown={onKeyDown}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(28,27,25,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 300,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-bg-white)',
          border: '1px solid var(--color-border)',
          borderRadius: 16,
          boxShadow: 'var(--shadow-lg)',
          width: '100%',
          maxWidth: 460,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 22px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span
            style={{
              width: 8,
              height: 24,
              borderRadius: 2,
              background: accent,
              flexShrink: 0,
            }}
          />
          <h2
            style={{
              fontSize: '1.02rem',
              fontWeight: 700,
              color: 'var(--color-primary)',
            }}
          >
            {state.title}
          </h2>
        </div>

        <div style={{ padding: '20px 22px', fontSize: '0.95rem', lineHeight: 1.6 }}>
          <div style={{ color: 'var(--color-text)', whiteSpace: 'pre-wrap' }}>
            {state.message}
          </div>

          {state.kind === 'prompt' && (
            <input
              ref={inputRef}
              type="text"
              value={value}
              placeholder={state.placeholder}
              onChange={(e) => onValueChange(e.target.value)}
              onKeyDown={onKeyDown}
              style={{ ...inputStyle, marginTop: 14 }}
            />
          )}
        </div>

        <div
          style={{
            padding: '12px 22px',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            background: 'var(--color-bg)',
          }}
        >
          {state.kind !== 'alert' && (
            <button
              onClick={onCancel}
              className="tact-btn tact-btn-ghost"
              style={{ padding: '8px 18px', fontSize: '0.88rem' }}
            >
              {state.cancelLabel}
            </button>
          )}
          <button
            onClick={onConfirm}
            className="tact-btn tact-btn-primary"
            style={{
              padding: '8px 22px',
              fontSize: '0.88rem',
              background: accent,
              boxShadow: `0 4px 16px ${accent}33`,
            }}
            autoFocus={state.kind !== 'prompt'}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
