import { useRef, useState } from 'react'
import axiosInstance from '../../api/axiosInstance.js'

export function Badge({ children, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    brand: 'bg-brand-50 text-brand-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-sky-50 text-sky-700',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  )
}

const STATUS_TONES = {
  open: 'blue', quoted: 'amber', booked: 'brand', cancelled: 'red', closed: 'slate',
  scheduled: 'blue', inProgress: 'amber', awaitingConfirmation: 'amber', completed: 'green', disputed: 'red',
  pending: 'amber', accepted: 'green', rejected: 'red', withdrawn: 'slate',
  verified: 'green', investigating: 'amber', escalated: 'red', resolved: 'green',
  active: 'green', inactive: 'red',
  draft: 'slate', issued: 'amber', paid: 'green', void: 'slate', partiallyRefunded: 'amber', refunded: 'blue',
}

export function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONES[status] || 'slate'}>{formatStatus(status)}</Badge>
}

export function formatStatus(s = '') {
  return s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-14 text-slate-500">
      <div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7h18M3 12h18M3 17h10" />
        </svg>
      </div>
      <h3 className="font-semibold text-slate-800">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer, wide = false }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8" onClick={onClose}>
      <div
        className={`max-h-full w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ${wide ? 'max-w-2xl' : 'max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div>{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition ${
            active === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function StarRating({ value = 0, size = 'sm' }) {
  const cls = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5'
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 20 20" className={`${cls} ${i <= Math.round(value) ? 'fill-amber-400' : 'fill-slate-200'}`}>
          <path d="M10 1.5l2.6 5.3 5.9.8-4.3 4.1 1 5.8L10 14.7l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" />
        </svg>
      ))}
    </div>
  )
}

export function fileUrl(u) {
  if (!u) return u
  return u.startsWith('http') ? u : `${axiosInstance.defaults.baseURL}${u}`
}

export function Money({ value }) {
  const n = Number(value || 0)
  return <>₹{n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</>
}

// Uploads one or more files to /upload-api and hands the resulting URLs back via onUploaded.
// Kept deliberately simple: a native file input styled as a button, a small progress state,
// and a list of what's attached so far with a remove affordance.
export function FileUpload({ files = [], onUploaded, onRemove, label = 'Attach files', multiple = true, accept = 'image/*,.pdf' }) {
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  const handleChange = async (e) => {
    const chosen = Array.from(e.target.files || [])
    if (chosen.length === 0) return
    setBusy(true)
    try {
      const formData = new FormData()
      chosen.forEach((f) => formData.append('files', f))
      const res = await axiosInstance.post('/upload-api', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      onUploaded?.(res.data.files || [])
    } catch {
      // the axios interceptor already surfaces the error toast
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {files.map((f, i) => (
          <span key={f.url || i} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 py-1 pl-2.5 pr-1.5 text-xs font-medium text-slate-700">
            <a href={fileUrl(f.url)} target="_blank" rel="noreferrer" className="max-w-[9rem] truncate hover:underline">
              {f.name || f.url}
            </a>
            {onRemove && (
              <button type="button" onClick={() => onRemove(i)} className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label="Remove attachment">
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            )}
          </span>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-400 hover:text-brand-700 disabled:opacity-50"
        >
          {busy ? 'Uploading…' : `+ ${label}`}
        </button>
        <input ref={inputRef} type="file" multiple={multiple} accept={accept} onChange={handleChange} className="hidden" />
      </div>
    </div>
  )
}
