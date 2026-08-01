import { todayIST, fmtDateIST, fmtDateTimeIST } from "../lib/tz";
import { useEffect, useState, useCallback } from 'react'
import { amcAPI, customersAPI } from '@/services/api'
import PageHeader from '@/components/layout/PageHeader'
import StatusBadge from '@/components/ui/StatusBadge'
import Spinner from '@/components/ui/Spinner'
import Modal from '@/components/ui/Modal'

const PLAN_TYPES = ['GOLD', 'SILVER', 'PLATINUM', 'BASIC']

const emptyPlan = { name: '', plan_type: 'BASIC', price: '', duration_months: 12, visit_count: 2, description: '', appliance_types: '' }

function PlanModal({ plan, onClose, onSaved }: { plan: any | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(plan ? {
    name: plan.name, plan_type: plan.plan_type, price: plan.price,
    duration_months: plan.duration_months, visit_count: plan.visit_count,
    description: plan.description || '', appliance_types: plan.appliance_types || ''
  } : emptyPlan)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name || !form.price) { setError('Name and price are required.'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form, price: Number(form.price), duration_months: Number(form.duration_months), visit_count: Number(form.visit_count) }
      if (plan) await amcAPI.updatePlan(plan.id, payload)
      else await amcAPI.createPlan(payload)
      onSaved()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Save failed.')
    } finally { setSaving(false) }
  }

  return (
    <Modal isOpen onClose={onClose} title={plan ? 'Edit AMC Plan' : 'Create AMC Plan'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label className="label">Plan Name *</label>
          <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Gold AC Care Plan" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="label">Plan Type</label>
            <select className="input" value={form.plan_type} onChange={e => set('plan_type', e.target.value)}>
              {PLAN_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Price (₹) *</label>
            <input className="input" type="number" value={form.price} onChange={e => set('price', e.target.value)} placeholder="4999" />
          </div>
          <div>
            <label className="label">Duration (months)</label>
            <input className="input" type="number" value={form.duration_months} onChange={e => set('duration_months', e.target.value)} min={1} max={60} />
          </div>
          <div>
            <label className="label">Service Visits Included</label>
            <input className="input" type="number" value={form.visit_count} onChange={e => set('visit_count', e.target.value)} min={1} />
          </div>
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input" rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief plan description..." style={{ resize: 'none' }} />
        </div>
        <div>
          <label className="label">Appliance Types (optional)</label>
          <input className="input" value={form.appliance_types} onChange={e => set('appliance_types', e.target.value)} placeholder="e.g. Split AC, Window AC" />
        </div>
        {error && <div className="error-msg">{error}</div>}
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? <Spinner size={16} /> : plan ? 'Save Changes' : 'Create Plan'}
        </button>
      </div>
    </Modal>
  )
}

function PurchaseModal({ plans, onClose, onSaved }: { plans: any[]; onClose: () => void; onSaved: () => void }) {
  const [customers, setCustomers] = useState<any[]>([])
  const [custSearch, setCustSearch] = useState('')
  const [form, setForm] = useState({ customer_id: '', plan_id: '', start_date: todayIST() })
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
    if (!form.customer_id || !form.plan_id) { setError('Select customer and plan.'); return }
    setSaving(true); setError('')
    try {
      await amcAPI.purchase({ ...form, start_date: form.start_date || undefined })
      onSaved()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Purchase failed.')
    } finally { setSaving(false) }
  }

  return (
    <Modal isOpen onClose={onClose} title="Purchase AMC for Customer">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label className="label">Search Customer</label>
          <input className="input" value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="Type name or phone..." />
          {customers.length > 0 && (
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, marginTop: 4, maxHeight: 160, overflowY: 'auto', background: '#fff' }}>
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
        <div>
          <label className="label">AMC Plan *</label>
          <select className="input" value={form.plan_id} onChange={e => set('plan_id', e.target.value)}>
            <option value="">— Select a plan —</option>
            {plans.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name} — ₹{p.price?.toLocaleString('en-IN')} / {p.duration_months}mo</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Start Date</label>
          <input className="input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
        </div>
        {error && <div className="error-msg">{error}</div>}
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? <Spinner size={16} /> : 'Purchase AMC'}
        </button>
      </div>
    </Modal>
  )
}

export default function AMC() {
  const [plans, setPlans]       = useState<any[]>([])
  const [renewals, setRenewals] = useState<any[]>([])
  const [tab, setTab]           = useState<'plans' | 'renewals'>('plans')
  const [loading, setLoading]   = useState(true)

  const [planModal, setPlanModal]         = useState(false)
  const [editPlan, setEditPlan]           = useState<any | null>(null)
  const [purchaseModal, setPurchaseModal] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [pRes, rRes] = await Promise.all([amcAPI.plans(), amcAPI.renewals()])
      setPlans(pRes.data.data || [])
      setRenewals(rRes.data.data || [])
    } catch { setPlans([]); setRenewals([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const tabStyle = (t: string) => ({
    padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
    background: tab === t ? '#1B4FD8' : '#F1F5F9', color: tab === t ? '#fff' : '#334155'
  })

  const saved = () => { setPlanModal(false); setEditPlan(null); setPurchaseModal(false); fetchAll() }

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <PageHeader title="AMC Plans" subtitle="Annual Maintenance Contract management" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={() => setPurchaseModal(true)}>📋 Purchase AMC</button>
          <button className="btn-primary" onClick={() => { setEditPlan(null); setPlanModal(true) }}>+ Create Plan</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button style={tabStyle('plans')} onClick={() => setTab('plans')}>Plans ({plans.length})</button>
        <button style={tabStyle('renewals')} onClick={() => setTab('renewals')}>Upcoming Renewals ({renewals.length})</button>
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div> : (
        <div className="card">
          {tab === 'plans' ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Plan Name</th><th>Type</th><th>Duration</th><th>Price ₹</th>
                  <th>Visits</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.length === 0
                  ? <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94A3B8', padding: 32 }}>No AMC plans found. Create one above.</td></tr>
                  : plans.map((p: any) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#EDE9FE', color: '#7C3AED' }}>{p.plan_type}</span></td>
                      <td>{p.duration_months} months</td>
                      <td style={{ fontWeight: 700, color: '#059669' }}>₹{p.price?.toLocaleString('en-IN')}</td>
                      <td>{p.visit_count} visits</td>
                      <td><StatusBadge status={p.is_active !== false ? 'ACTIVE' : 'INACTIVE'} /></td>
                      <td>
                        <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}
                          onClick={() => { setEditPlan(p); setPlanModal(true) }}>Edit</button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Customer</th><th>Plan</th><th>Expiry Date</th><th>Days Left</th><th>Visits Left</th><th>Status</th></tr>
              </thead>
              <tbody>
                {renewals.length === 0
                  ? <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94A3B8', padding: 32 }}>No upcoming renewals</td></tr>
                  : renewals.map((r: any) => {
                    const days = Math.ceil((new Date(r.end_date || r.expiry_date).getTime() - Date.now()) / 86400000)
                    return (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 500 }}>{r.customer_name || r.customer_id}</td>
                        <td>{r.plan_name || '—'}</td>
                        <td>{fmtDateIST(r.end_date || r.expiry_date)}</td>
                        <td><span style={{ fontWeight: 700, color: days <= 7 ? '#DC2626' : days <= 30 ? '#D97706' : '#059669' }}>{days}d</span></td>
                        <td>{r.visits_remaining ?? '—'}</td>
                        <td><StatusBadge status={r.status || 'ACTIVE'} /></td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {(planModal || editPlan) && (
        <PlanModal plan={editPlan} onClose={() => { setPlanModal(false); setEditPlan(null) }} onSaved={saved} />
      )}
      {purchaseModal && (
        <PurchaseModal plans={plans} onClose={() => setPurchaseModal(false)} onSaved={saved} />
      )}
    </div>
  )
}
