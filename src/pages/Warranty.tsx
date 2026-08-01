import { fmtDateIST, fmtDateTimeIST } from "../lib/tz";
import { useEffect, useState, useCallback } from 'react'
import { warrantyAPI, customersAPI } from '@/services/api'
import PageHeader from '@/components/layout/PageHeader'
import StatusBadge from '@/components/ui/StatusBadge'
import Pagination from '@/components/ui/Pagination'
import Spinner from '@/components/ui/Spinner'
import Modal from '@/components/ui/Modal'

const WARRANTY_TYPES = ['SERVICE', 'PARTS', 'LABOUR', 'COMPREHENSIVE']

// ── Create Warranty Modal ──────────────────────────────────────
function CreateWarrantyModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [customers, setCustomers] = useState<any[]>([])
  const [custSearch, setCustSearch] = useState('')
  const [form, setForm] = useState({
    customer_id: '', warranty_type: 'SERVICE',
    description: '', expiry_date: '', parts_covered: '', booking_id: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (custSearch.length < 2) { setCustomers([]); return }
    const t = setTimeout(async () => {
      try {
        const r = await customersAPI.list({ search: custSearch, per_page: 10 })
        setCustomers(r.data.data?.items || [])
      } catch { setCustomers([]) }
    }, 350)
    return () => clearTimeout(t)
  }, [custSearch])

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.customer_id || !form.description || !form.expiry_date) {
      setError('Customer, description, and expiry date are required.'); return
    }
    setSaving(true); setError('')
    try {
      await warrantyAPI.create({
        customer_id: form.customer_id,
        warranty_type: form.warranty_type,
        description: form.description,
        expiry_date: form.expiry_date,
        parts_covered: form.parts_covered || undefined,
        booking_id: form.booking_id || undefined,
      })
      onSaved()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to create warranty.')
    } finally { setSaving(false) }
  }

  return (
    <Modal onClose={onClose} title="Create Warranty">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label className="label">Search Customer *</label>
          <input className="input" value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="Type name or phone..." />
          {customers.length > 0 && (
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, marginTop: 4, maxHeight: 150, overflowY: 'auto', background: '#fff' }}>
              {customers.map((c: any) => (
                <div key={c.id}
                  onClick={() => { set('customer_id', c.id); setCustSearch(c.name + (c.phone ? ` — ${c.phone}` : '')); setCustomers([]) }}
                  style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #F1F5F9' }}
                  className="hover-row">
                  <span style={{ fontWeight: 600 }}>{c.name}</span>
                  {c.phone && <span style={{ color: '#64748B', marginLeft: 8 }}>{c.phone}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="label">Warranty Type</label>
            <select className="input" value={form.warranty_type} onChange={e => set('warranty_type', e.target.value)}>
              {WARRANTY_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Expiry Date *</label>
            <input className="input" type="date" value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Description *</label>
          <textarea className="input" rows={2} value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="e.g. 30-day service warranty for AC repair" style={{ resize: 'none' }} />
        </div>
        <div>
          <label className="label">Parts Covered (optional)</label>
          <input className="input" value={form.parts_covered} onChange={e => set('parts_covered', e.target.value)} placeholder="e.g. Compressor, PCB" />
        </div>
        <div>
          <label className="label">Booking ID (optional)</label>
          <input className="input" value={form.booking_id} onChange={e => set('booking_id', e.target.value)} placeholder="Link to a booking..." />
        </div>
        {error && <div className="error-msg">{error}</div>}
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? <Spinner size='sm' /> : 'Create Warranty'}
        </button>
      </div>
    </Modal>
  )
}

// ── Claim Action Modal ─────────────────────────────────────────
function ClaimActionModal({ claim, action, onClose, onSaved }: {
  claim: any; action: 'approve' | 'reject'; onClose: () => void; onSaved: () => void
}) {
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setSaving(true); setError('')
    try {
      const payload = { claim_id: claim.id, notes: notes || undefined }
      if (action === 'approve') await warrantyAPI.approveClaim(payload)
      else await warrantyAPI.rejectClaim(payload)
      onSaved()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Action failed.')
    } finally { setSaving(false) }
  }

  return (
    <Modal onClose={onClose} title={action === 'approve' ? '✅ Approve Claim' : '❌ Reject Claim'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#334155' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{claim.description}</div>
          <div style={{ color: '#64748B', fontSize: 12 }}>Submitted: {fmtDateTimeIST(claim.created_at)}</div>
        </div>
        <div>
          <label className="label">Notes {action === 'reject' ? '(required)' : '(optional)'}</label>
          <textarea className="input" rows={3} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder={action === 'approve' ? 'Any notes for the team...' : 'Reason for rejection...'}
            style={{ resize: 'none' }} />
        </div>
        {error && <div className="error-msg">{error}</div>}
        <button
          onClick={save} disabled={saving || (action === 'reject' && !notes.trim())}
          style={{
            padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontWeight: 600, fontSize: 13,
            background: action === 'approve' ? '#059669' : '#DC2626', color: '#fff',
            opacity: (saving || (action === 'reject' && !notes.trim())) ? 0.5 : 1,
          }}>
          {saving ? <Spinner size='sm' /> : action === 'approve' ? 'Approve Claim' : 'Reject Claim'}
        </button>
      </div>
    </Modal>
  )
}

// ── Main Page ──────────────────────────────────────────────────
export default function Warranty() {
  const [tab, setTab]         = useState<'warranties' | 'claims'>('warranties')

  // Warranties tab
  const [items, setItems]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)
  const [pages, setPages]     = useState(1)
  const [total, setTotal]     = useState(0)
  const [search, setSearch]   = useState('')

  // Claims tab
  const [claims, setClaims]           = useState<any[]>([])
  const [claimsLoading, setClaimsLoading] = useState(false)
  const [claimPage, setClaimPage]     = useState(1)
  const [claimPages, setClaimPages]   = useState(1)
  const [pendingOnly, setPendingOnly] = useState(false)

  // Modals
  const [createModal, setCreateModal]       = useState(false)
  const [claimModal, setClaimModal]         = useState<{ claim: any; action: 'approve' | 'reject' } | null>(null)

  const fetchWarranties = useCallback(async () => {
    setLoading(true)
    try {
      const r = await warrantyAPI.list({ page, per_page: 20 })
      const d = r.data.data
      // backend returns array (no pagination) — handle both
      const arr = Array.isArray(d) ? d : (d?.items || [])
      setItems(arr)
      setPages(d?.pages || 1)
      setTotal(d?.total || arr.length)
    } catch { setItems([]) } finally { setLoading(false) }
  }, [page])

  const fetchClaims = useCallback(async () => {
    setClaimsLoading(true)
    try {
      const r = await warrantyAPI.claims({ page: claimPage, per_page: 20, status: pendingOnly ? 'PENDING' : undefined })
      const d = r.data.data
      const arr = Array.isArray(d) ? d : (d?.items || [])
      setClaims(arr)
      setClaimPages(d?.pages || 1)
    } catch { setClaims([]) } finally { setClaimsLoading(false) }
  }, [claimPage, pendingOnly])

  useEffect(() => { fetchWarranties() }, [fetchWarranties])
  useEffect(() => { fetchClaims() }, [fetchClaims])

  const tabStyle = (t: string) => ({
    padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
    background: tab === t ? '#1B4FD8' : '#F1F5F9', color: tab === t ? '#fff' : '#334155'
  })

  const onSaved = () => {
    setCreateModal(false); setClaimModal(null)
    fetchWarranties(); fetchClaims()
  }

  const pendingClaims = claims.filter(c => c.status === 'PENDING').length

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <PageHeader title="Warranty" subtitle={`${total} warranties · ${claims.length} claims`} />
        <button className="btn-primary" onClick={() => setCreateModal(true)}>+ Create Warranty</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button style={tabStyle('warranties')} onClick={() => setTab('warranties')}>Warranties ({total})</button>
        <button style={tabStyle('claims')} onClick={() => setTab('claims')}>
          Claims {pendingClaims > 0 ? <span style={{ background: '#DC2626', color: '#fff', borderRadius: 10, fontSize: 11, padding: '1px 6px', marginLeft: 4 }}>{pendingClaims}</span> : ''}
        </button>
      </div>

      {tab === 'warranties' ? (
        <div className="card">
          {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div> : (
            <>
              <table className="data-table">
                <thead>
                  <tr><th>Type</th><th>Description</th><th>Parts Covered</th><th>Expiry Date</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {items.length === 0
                    ? <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94A3B8', padding: 32 }}>No warranty records found</td></tr>
                    : items.map((w: any) => {
                      const expired = w.expiry_date && new Date(w.expiry_date) < new Date()
                      return (
                        <tr key={w.id}>
                          <td>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#DBEAFE', color: '#1D4ED8' }}>
                              {w.warranty_type}
                            </span>
                          </td>
                          <td style={{ maxWidth: 280 }}>{w.description}</td>
                          <td style={{ color: '#64748B', fontSize: 12 }}>{w.parts_covered || '—'}</td>
                          <td style={{ color: expired ? '#DC2626' : '#059669', fontWeight: 500 }}>
                            {fmtDateIST(w.expiry_date)}
                          </td>
                          <td><StatusBadge status={w.status || (expired ? 'EXPIRED' : 'ACTIVE')} /></td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
              {pages > 1 && <Pagination page={page} pages={pages} onPage={setPage} />}
            </>
          )}
        </div>
      ) : (
        <div className="card">
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: '#334155' }}>
              <input type="checkbox" checked={pendingOnly} onChange={e => { setPendingOnly(e.target.checked); setClaimPage(1) }} />
              Show pending only
            </label>
          </div>
          {claimsLoading ? <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div> : (
            <>
              <table className="data-table">
                <thead>
                  <tr><th>Warranty ID</th><th>Description</th><th>Submitted</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {claims.length === 0
                    ? <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94A3B8', padding: 32 }}>No claims found</td></tr>
                    : claims.map((c: any) => (
                      <tr key={c.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>{c.warranty_id?.slice(0, 8)}…</td>
                        <td style={{ maxWidth: 280 }}>{c.description}</td>
                        <td style={{ color: '#64748B', fontSize: 12 }}>{fmtDateTimeIST(c.created_at)}</td>
                        <td><StatusBadge status={c.status || 'PENDING'} /></td>
                        <td>
                          {c.status === 'PENDING' && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn-ghost"
                                style={{ padding: '3px 10px', fontSize: 12, background: '#DCFCE7', color: '#15803D', border: 'none' }}
                                onClick={() => setClaimModal({ claim: c, action: 'approve' })}>
                                Approve
                              </button>
                              <button className="btn-ghost"
                                style={{ padding: '3px 10px', fontSize: 12, background: '#FEE2E2', color: '#DC2626', border: 'none' }}
                                onClick={() => setClaimModal({ claim: c, action: 'reject' })}>
                                Reject
                              </button>
                            </div>
                          )}
                          {c.status !== 'PENDING' && <span style={{ color: '#94A3B8', fontSize: 12 }}>—</span>}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {claimPages > 1 && <Pagination page={claimPage} pages={claimPages} onPage={setClaimPage} />}
            </>
          )}
        </div>
      )}

      {createModal && <CreateWarrantyModal onClose={() => setCreateModal(false)} onSaved={onSaved} />}
      {claimModal && (
        <ClaimActionModal claim={claimModal.claim} action={claimModal.action}
          onClose={() => setClaimModal(null)} onSaved={onSaved} />
      )}
    </div>
  )
}
