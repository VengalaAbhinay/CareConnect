import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/authStore.js'
import { useSupportStore } from '../../store/supportStore.js'
import { Modal, StatusBadge, Spinner, Badge, Money, FileUpload } from './UI.jsx'

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function SupportCaseThread({ caseId, open, onClose, showStaffControls = false }) {
  const user = useAuthStore((s) => s.user)
  const { activeCase, activeCaseInvoice, fetchCase, sendMessage, assignCase, escalateCase, updateCase } = useSupportStore()
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [internal, setInternal] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [sending, setSending] = useState(false)
  const [escalateNote, setEscalateNote] = useState('')
  const [showEscalate, setShowEscalate] = useState(false)
  const [resolveForm, setResolveForm] = useState({ status: 'investigating', resolutionNotes: '', refundAmount: 0 })

  useEffect(() => {
    if (!open || !caseId) return
    setLoading(true)
    fetchCase(caseId).finally(() => setLoading(false))
    setText(''); setAttachments([]); setShowEscalate(false); setEscalateNote('')
  }, [open, caseId, fetchCase])

  useEffect(() => {
    if (activeCase) {
      setResolveForm({
        status: activeCase.status === 'open' ? 'investigating' : activeCase.status,
        resolutionNotes: activeCase.resolutionNotes || '',
        refundAmount: activeCase.refundAmount || 0,
      })
    }
  }, [activeCase])

  if (!open) return null
  const c = activeCase
  const isStaff = ['admin', 'operationsManager', 'supportAgent'].includes(user?.role)

  const handleSend = async (e) => {
    e.preventDefault()
    if (!text.trim()) return toast.error('Write a message first')
    setSending(true)
    try {
      await sendMessage(caseId, { text, internal, attachments: attachments.map((f) => f.url) })
      setText(''); setAttachments([]); setInternal(false)
    } catch { /* handled */ } finally {
      setSending(false)
    }
  }

  const handleClaim = async () => {
    try { await assignCase(caseId, 'me'); toast.success('Case assigned to you') } catch { /* handled */ }
  }
  const handleUnassign = async () => {
    try { await assignCase(caseId, null); toast.success('Case unassigned') } catch { /* handled */ }
  }
  const handleEscalate = async (e) => {
    e.preventDefault()
    if (escalateNote.trim().length < 10) return toast.error('Explain why this needs operations (10+ characters)')
    try {
      await escalateCase(caseId, escalateNote)
      toast.success('Escalated to operations')
      setShowEscalate(false)
    } catch { /* handled */ }
  }
  const handleResolve = async (e) => {
    e.preventDefault()
    try {
      await updateCase(caseId, { ...resolveForm, refundAmount: Number(resolveForm.refundAmount) || 0 })
      toast.success('Case updated')
    } catch { /* handled */ }
  }

  return (
    <Modal open={open} onClose={onClose} title="Support case" wide>
      {loading || !c ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-slate-50 p-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge>{c.type}</Badge>
                <p className="font-semibold text-slate-900">{c.subject}</p>
              </div>
              <p className="mt-1 text-sm text-slate-600">{c.reason}</p>
              {c.booking && (
                <p className="mt-1 text-xs text-slate-400">
                  Booking {c.booking.serviceRequest?.category?.name || ''} · {c.booking.customer?.name} ↔ {c.booking.provider?.user?.name}
                </p>
              )}
              {isStaff && c.assignedTo && <p className="mt-1 text-xs text-slate-400">Assigned to {c.assignedTo.name}</p>}
              {isStaff && c.escalationNote && <p className="mt-1 text-xs text-amber-700">Escalation note: {c.escalationNote}</p>}
            </div>
            <div className="text-right">
              <StatusBadge status={c.status} />
              <p className="mt-1 text-xs text-slate-400">{c.priority} priority</p>
              {c.refundAmount > 0 && <p className="mt-1 text-xs font-semibold text-slate-600">Refund: <Money value={c.refundAmount} /></p>}
            </div>
          </div>

          {activeCaseInvoice && (
            <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-500">
              Related invoice {activeCaseInvoice.number}: <Money value={activeCaseInvoice.total} /> ·{' '}
              <StatusBadge status={activeCaseInvoice.status} />
              {activeCaseInvoice.refundedAmount > 0 && <> · Refunded so far: <Money value={activeCaseInvoice.refundedAmount} /></>}
            </div>
          )}

          {/* Staff controls */}
          {isStaff && showStaffControls && ['open', 'investigating', 'escalated'].includes(c.status) && (
            <div className="flex flex-wrap items-center gap-2 border-y border-slate-100 py-3">
              <button onClick={handleClaim} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Claim / assign to me</button>
              {c.assignedTo && <button onClick={handleUnassign} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Unassign</button>}
              {c.status !== 'escalated' && (
                <button onClick={() => setShowEscalate((v) => !v)} className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50">
                  Escalate to operations
                </button>
              )}
            </div>
          )}
          {showEscalate && (
            <form onSubmit={handleEscalate} className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <textarea className="input-field" rows={2} placeholder="Why does operations need to take this?" value={escalateNote} onChange={(e) => setEscalateNote(e.target.value)} />
              <button type="submit" className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">Confirm escalation</button>
            </form>
          )}

          {isStaff && showStaffControls && ['open', 'investigating', 'escalated'].includes(c.status) && (
            <form onSubmit={handleResolve} className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h4 className="text-sm font-semibold text-slate-800">Resolve this case</h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <select className="input-field" value={resolveForm.status} onChange={(e) => setResolveForm({ ...resolveForm, status: e.target.value })}>
                  {['investigating', 'resolved', 'rejected'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input type="number" min="0" className="input-field" placeholder="Refund amount (₹)" value={resolveForm.refundAmount} onChange={(e) => setResolveForm({ ...resolveForm, refundAmount: e.target.value })} />
              </div>
              <textarea className="input-field" rows={2} placeholder="Resolution notes" value={resolveForm.resolutionNotes} onChange={(e) => setResolveForm({ ...resolveForm, resolutionNotes: e.target.value })} />
              <button type="submit" className="btn-primary w-auto px-5">Save</button>
            </form>
          )}

          {/* Thread */}
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">Conversation</h4>
            <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl border border-slate-100 p-3">
              {(c.messages || []).length === 0 && <p className="text-sm text-slate-400">No messages yet.</p>}
              {(c.messages || []).map((m, i) => (
                <div key={i} className={`rounded-lg p-3 text-sm ${m.internal ? 'bg-amber-50' : 'bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-800">{m.senderName} <span className="font-normal text-slate-400">({m.senderRole}){m.internal ? ' · internal note' : ''}</span></p>
                    <p className="text-[11px] text-slate-400">{timeAgo(m.createdAt)}</p>
                  </div>
                  <p className="mt-1 text-slate-700">{m.text}</p>
                </div>
              ))}
            </div>
          </div>

          {['open', 'investigating', 'escalated'].includes(c.status) || isStaff ? (
            <form onSubmit={handleSend} className="space-y-2">
              <textarea className="input-field" rows={2} placeholder="Write a reply…" value={text} onChange={(e) => setText(e.target.value)} />
              <div className="flex items-center justify-between gap-3">
                <FileUpload files={attachments} onUploaded={(f) => setAttachments((prev) => [...prev, ...f])} onRemove={(i) => setAttachments((prev) => prev.filter((_, idx) => idx !== i))} label="Attach" />
                <div className="flex items-center gap-3">
                  {isStaff && (
                    <label className="flex items-center gap-1.5 text-xs text-slate-500">
                      <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note
                    </label>
                  )}
                  <button type="submit" disabled={sending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <p className="text-sm text-slate-400">This case is closed.</p>
          )}
        </div>
      )}
    </Modal>
  )
}
