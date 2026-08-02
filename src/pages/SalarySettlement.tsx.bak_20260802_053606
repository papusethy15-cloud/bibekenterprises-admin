import { useState, useEffect, useCallback } from 'react'
import { api } from '@/services/api'
import Toast, { useToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'

// ── helpers ───────────────────────────────────────────────────────────────────
const INR = (n: number | null | undefined) =>
  `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function statusBadge(status: string | null) {
  if (!status) return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
      background: '#F1F5F9', color: '#94A3B8', border: '1px solid #E2E8F0' }}>
      Not Generated
    </span>
  )
  const cfg: Record<string, { bg: string; color: string; border: string }> = {
    GENERATED:    { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
    PAID:         { bg: '#ECFDF5', color: '#065F46', border: '#6EE7B7' },
    SENT_TO_BANK: { bg: '#F0FDF4', color: '#14532D', border: '#86EFAC' },
  }
  const c = cfg[status] || { bg: '#F1F5F9', color: '#475569', border: '#E2E8F0' }
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
      background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function bookingStatusColor(status: string) {
  const m: Record<string, string> = {
    COMPLETED: '#059669', CANCELLED: '#EF4444', IN_PROGRESS: '#F59E0B',
    CONFIRMED: '#1D4ED8', PENDING: '#64748B', CALLED: '#7C3AED',
  }
  return m[status] || '#64748B'
}

type TabKey = 'bookings' | 'attendance' | 'cash' | 'revenue' | 'salary'

function TabBar({ tabs, active, onSelect }: { tabs: { key: TabKey; label: string; icon: string }[]; active: TabKey; onSelect: (k: TabKey) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2, background: '#F1F5F9', borderRadius: 12, padding: 4, marginBottom: 20 }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onSelect(t.key)}
          style={{
            flex: 1, padding: '8px 6px', border: 'none', cursor: 'pointer', borderRadius: 9,
            fontSize: 12, fontWeight: active === t.key ? 700 : 500,
            background: active === t.key ? 'white' : 'transparent',
            color: active === t.key ? '#1B4FD8' : '#64748B',
            boxShadow: active === t.key ? '0 2px 8px rgba(0,0,0,0.10)' : 'none',
            transition: 'all 0.18s',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          }}>
          <span style={{ fontSize: 15 }}>{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  )
}

function StatPill({ icon, label, value, color = '#1B4FD8', bg = '#EFF6FF' }: { icon: string; label: string; value: string | number; color?: string; bg?: string }) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: color + '20',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 11, color: '#64748B', fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 1 }}>{value}</div>
      </div>
    </div>
  )
}

export default function SalarySettlement() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year,  setYear]  = useState(now.getFullYear())
  const [list,  setList]  = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const [genModal,    setGenModal]    = useState<any | null>(null)
  const [genForm,     setGenForm]     = useState<any>({})
  const [genLoading,  setGenLoading]  = useState(false)
  const [genTab,      setGenTab]      = useState<TabKey>('bookings')
  const [preview,     setPreview]     = useState<any | null>(null)
  const [prevLoading, setPrevLoading] = useState(false)

  const [viewData,    setViewData]    = useState<any | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [viewTab,     setViewTab]     = useState<TabKey>('bookings')

  const [payModal,   setPayModal]   = useState<any | null>(null)
  const [payLoading, setPayLoading] = useState(false)
  const [walletInfo, setWalletInfo] = useState<any | null>(null)
  const [payForm,    setPayForm]    = useState({ payout_method: 'UPI', payment_reference: '' })

  const { toasts, removeToast, toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/salary-settlements/groups/salary-technicians?month=${month}&year=${year}`)
      setList(res.data?.data?.technicians || [])
    } catch {
      toast.error('Failed to load salary technicians')
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { load() }, [load])

  const loadPreview = async (row: any) => {
    setPrevLoading(true)
    setPreview(null)
    try {
      const res = await api.get(`/salary-settlements/preview?technician_id=${row.technician_id}&month=${month}&year=${year}`)
      setPreview(res.data?.data || null)
    } catch {
      setPreview(null)
    } finally {
      setPrevLoading(false)
    }
  }

  const openGenerate = (row: any) => {
    setGenModal(row)
    setGenTab('bookings')
    setGenForm({
      monthly_salary:   row.monthly_salary || 0,
      petrol_amount:    0,
      mobile_recharge:  0,
      bonus_amount:     0,
      hra_amount:       0,
      other_allowances: 0,
      deductions:       0,
      deduction_notes:  '',
      admin_notes:      '',
    })
    loadPreview(row)
  }

  const openEdit = async (row: any) => {
    if (!row.settlement_id) { openGenerate(row); return }
    setViewLoading(true)
    try {
      const res = await api.get(`/salary-settlements/${row.settlement_id}`)
      const d = res.data?.data || {}
      setGenModal(row)
      setGenTab('bookings')
      setGenForm({
        monthly_salary:   d.monthly_salary   || 0,
        petrol_amount:    d.petrol_amount    || 0,
        mobile_recharge:  d.mobile_recharge  || 0,
        bonus_amount:     d.bonus_amount     || 0,
        hra_amount:       d.hra_amount       || 0,
        other_allowances: d.other_allowances || 0,
        deductions:       d.deductions       || 0,
        deduction_notes:  d.deduction_notes  || '',
        admin_notes:      d.admin_notes      || '',
        _settlement_id:   d.id,
        _status:          d.status,
      })
      setPreview({
        summary: {
          total_bookings:     d.total_bookings    || 0,
          attendance_days:    d.attendance_days   || 0,
          total_hours_worked: d.total_hours_worked || 0,
          cash_in_hand_total: d.cash_collections?.reduce((s: number, c: any) => s + (c.amount || 0), 0) || 0,
          cash_in_hand_count: d.cash_collections?.length || 0,
          revenue_cash:       d.revenue_summary?.cash_total     || 0,
          revenue_online:     d.revenue_summary?.online_total   || 0,
          revenue_pay_later:  d.revenue_summary?.pay_later_total || 0,
          revenue_total:      d.revenue_summary?.total_revenue  || 0,
        },
        bookings:             d.bookings            || [],
        attendance:           d.attendance          || [],
        cash_collections:     d.cash_collections    || [],
        revenue_transactions: d.revenue_transactions || [],
      })
    } catch {
      toast.error('Failed to load settlement')
    } finally {
      setViewLoading(false)
    }
  }

  const saveGenerate = async () => {
    if (!genModal) return
    setGenLoading(true)
    try {
      if (genForm._settlement_id && genForm._status === 'GENERATED') {
        await api.patch(`/salary-settlements/${genForm._settlement_id}`, genForm)
        toast.success('Settlement updated')
      } else {
        await api.post('/salary-settlements/generate', {
          technician_id: genModal.technician_id,
          month, year,
          ...genForm,
        })
        toast.success('Salary settlement generated')
      }
      setGenModal(null)
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to save settlement')
    } finally {
      setGenLoading(false)
    }
  }

  const openView = async (row: any) => {
    if (!row.settlement_id) return
    setViewLoading(true)
    setViewTab('bookings')
    try {
      const res = await api.get(`/salary-settlements/${row.settlement_id}`)
      setViewData(res.data?.data || null)
    } catch {
      toast.error('Failed to load details')
    } finally {
      setViewLoading(false)
    }
  }

  const openPay = async (row: any) => {
    if (!row.settlement_id) return
    setPayModal(row)
    setPayForm({ payout_method: 'UPI', payment_reference: '' })
    try {
      const res = await api.get(`/salary-settlements/technician/${row.technician_id}/wallet-info`)
      setWalletInfo(res.data?.data || null)
    } catch {
      setWalletInfo(null)
    }
  }

  const paySalary = async () => {
    if (!payModal) return
    setPayLoading(true)
    try {
      await api.post(`/salary-settlements/${payModal.settlement_id}/pay`, payForm)
      toast.success(`Salary credited to ${payModal.technician_name}'s wallet`)
      setPayModal(null)
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to pay salary')
    } finally {
      setPayLoading(false)
    }
  }

  const sendToBank = async () => {
    if (!payModal) return
    setPayLoading(true)
    try {
      await api.post(`/salary-settlements/${payModal.settlement_id}/send-to-bank`, payForm)
      toast.success(`Transfer initiated for ${payModal.technician_name}`)
      setPayModal(null)
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to initiate transfer')
    } finally {
      setPayLoading(false)
    }
  }

  const gross = (f: any) =>
    (Number(f.monthly_salary)||0) + (Number(f.petrol_amount)||0) +
    (Number(f.mobile_recharge)||0) + (Number(f.bonus_amount)||0) +
    (Number(f.hra_amount)||0) + (Number(f.other_allowances)||0)
  const net = (f: any) => gross(f) - (Number(f.deductions)||0)

  const SummaryBar = ({ s }: { s: any }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
      <StatPill icon="📋" label="Total Bookings"  value={s.total_bookings || 0}            color="#1B4FD8" bg="#EFF6FF" />
      <StatPill icon="📅" label="Days Present"    value={`${s.attendance_days || 0} days`} color="#059669" bg="#ECFDF5" />
      <StatPill icon="💵" label="Cash in Hand"    value={INR(s.cash_in_hand_total || 0)}   color="#D97706" bg="#FFFBEB" />
      <StatPill icon="💰" label="Total Revenue"   value={INR(s.revenue_total || 0)}         color="#7C3AED" bg="#F5F3FF" />
    </div>
  )

  const renderPreviewTab = (tab: TabKey, data: any) => {
    if (!data) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>No data available</div>

    if (tab === 'bookings') {
      const bk = data.bookings || []
      if (!bk.length) return <div style={{ padding: 30, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No bookings this month</div>
      const counts: Record<string, number> = {}
      bk.forEach((b: any) => { counts[b.status] = (counts[b.status] || 0) + 1 })
      return (
        <div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {Object.entries(counts).map(([st, cnt]) => (
              <span key={st} style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                background: bookingStatusColor(st) + '18', color: bookingStatusColor(st),
                border: `1px solid ${bookingStatusColor(st)}40` }}>
                {st}: {cnt}
              </span>
            ))}
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', borderRadius: 10, border: '1px solid #E2E8F0' }}>
            <table className="data-table">
              <thead><tr><th>#</th><th>Booking No</th><th>Service</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {bk.map((b: any, i: number) => (
                  <tr key={b.id}>
                    <td style={{ fontSize: 11, color: '#94A3B8' }}>{i+1}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600 }}>{b.booking_number || b.id.slice(0,8)}</td>
                    <td style={{ fontSize: 12 }}>{b.service_name || '—'}</td>
                    <td style={{ fontSize: 11, color: '#64748B' }}>{b.scheduled_date || b.created_at?.slice(0,10)}</td>
                    <td style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>{b.total_amount ? INR(b.total_amount) : '—'}</td>
                    <td>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                        background: bookingStatusColor(b.status) + '18', color: bookingStatusColor(b.status),
                        border: `1px solid ${bookingStatusColor(b.status)}30` }}>
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
    }

    if (tab === 'attendance') {
      const att = data.attendance || []
      if (!att.length) return <div style={{ padding: 30, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No attendance records</div>
      const statusColor = (s: string) => s === 'PRESENT' ? '#059669' : s === 'ABSENT' ? '#EF4444' : s === 'HALF_DAY' ? '#F59E0B' : '#64748B'
      const presentDays = att.filter((a: any) => a.status === 'PRESENT').length
      const halfDays    = att.filter((a: any) => a.status === 'HALF_DAY').length
      const absentDays  = att.filter((a: any) => a.status === 'ABSENT').length
      return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
            {([['Present', presentDays, '#059669', '#ECFDF5'], ['Half Day', halfDays, '#F59E0B', '#FFFBEB'], ['Absent', absentDays, '#EF4444', '#FEF2F2']] as const).map(([l, v, c, bg]) => (
              <div key={l} style={{ background: bg, borderRadius: 10, padding: '12px 16px', textAlign: 'center', border: `1px solid ${c}25` }}>
                <div style={{ fontWeight: 800, fontSize: 22, color: c }}>{v}</div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(145px,1fr))', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
            {att.map((a: any) => (
              <div key={a.date} style={{ background: statusColor(a.status) + '0D',
                border: `1px solid ${statusColor(a.status)}30`, borderLeft: `3px solid ${statusColor(a.status)}`,
                borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: '#0F172A' }}>{a.date}</div>
                <div style={{ fontSize: 11, color: statusColor(a.status), fontWeight: 600, marginTop: 2 }}>{a.status}</div>
                <div style={{ fontSize: 11, color: '#64748B' }}>{a.hours_worked}h worked</div>
                {a.check_in  && <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>In: {String(a.check_in).slice(11,16)}</div>}
                {a.check_out && <div style={{ fontSize: 10, color: '#94A3B8' }}>Out: {String(a.check_out).slice(11,16)}</div>}
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (tab === 'cash') {
      const cc = data.cash_collections || []
      if (!cc.length) return <div style={{ padding: 30, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No cash collection records</div>
      const total = cc.reduce((s: number, c: any) => s + (c.amount || 0), 0)
      return (
        <div>
          <div style={{ background: 'linear-gradient(135deg,#059669,#047857)', borderRadius: 12, padding: '14px 20px',
            marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>Total Cash Collected</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>{INR(total)}</div>
            </div>
            <div style={{ fontSize: 32, opacity: 0.7 }}>💵</div>
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto', borderRadius: 10, border: '1px solid #E2E8F0' }}>
            <table className="data-table">
              <thead><tr><th>#</th><th>Amount</th><th>Status</th><th>Collected At</th><th>Notes</th></tr></thead>
              <tbody>
                {cc.map((c: any, i: number) => (
                  <tr key={c.id}>
                    <td style={{ fontSize: 11, color: '#94A3B8' }}>{i+1}</td>
                    <td style={{ fontWeight: 700, color: '#059669', fontSize: 13 }}>{INR(c.amount)}</td>
                    <td>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                        background: c.status === 'SUBMITTED' ? '#ECFDF5' : '#FFFBEB',
                        color:      c.status === 'SUBMITTED' ? '#059669' : '#92400E' }}>
                        {c.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: '#64748B' }}>{c.collected_at ? c.collected_at.slice(0,10) : '—'}</td>
                    <td style={{ fontSize: 11, color: '#94A3B8' }}>{c.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
    }

    if (tab === 'revenue') {
      const txns = data.revenue_transactions || []
      const s    = data.summary || {}
      return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Cash',      val: INR(s.revenue_cash      || 0), color: '#059669', bg: '#ECFDF5', icon: '💵' },
              { label: 'Online',    val: INR(s.revenue_online    || 0), color: '#1D4ED8', bg: '#EFF6FF', icon: '💳' },
              { label: 'Pay Later', val: INR(s.revenue_pay_later || 0), color: '#D97706', bg: '#FFFBEB', icon: '🕐' },
            ].map(({ label, val, color, bg, icon }) => (
              <div key={label} style={{ background: bg, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 20 }}>{icon}</div>
                <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 4 }}>{label}</div>
                <div style={{ fontWeight: 800, fontSize: 16, color, marginTop: 4 }}>{val}</div>
              </div>
            ))}
          </div>
          {txns.length ? (
            <div style={{ maxHeight: 230, overflowY: 'auto', borderRadius: 10, border: '1px solid #E2E8F0' }}>
              <table className="data-table">
                <thead><tr><th>#</th><th>Method</th><th>Amount</th><th>Txn No</th><th>Date</th></tr></thead>
                <tbody>
                  {txns.map((p: any, i: number) => (
                    <tr key={p.id}>
                      <td style={{ fontSize: 11, color: '#94A3B8' }}>{i+1}</td>
                      <td>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                          background: p.method === 'CASH' ? '#ECFDF5' : p.method === 'PAY_LATER' ? '#FFFBEB' : '#EFF6FF',
                          color:      p.method === 'CASH' ? '#059669' : p.method === 'PAY_LATER' ? '#92400E' : '#1D4ED8' }}>
                          {p.method}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: '#059669', fontSize: 13 }}>{INR(p.amount)}</td>
                      <td style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748B' }}>{p.transaction_number || '—'}</td>
                      <td style={{ fontSize: 11, color: '#94A3B8' }}>{p.created_at?.slice(0,10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: 30, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No payment transactions</div>
          )}
        </div>
      )
    }

    return null
  }

  const totalPaid      = list.filter(r => r.settlement_status === 'PAID' || r.settlement_status === 'SENT_TO_BANK').length
  const totalGenerated = list.filter(r => r.settlement_status === 'GENERATED').length
  const totalPending   = list.filter(r => !r.settlement_id).length
  const totalNetSalary = list.reduce((s, r) => s + (r.net_salary || 0), 0)

  return (
    <div className="page-container">
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <Toast toasts={toasts} onRemove={removeToast} />

      <div className="page-header">
        <div>
          <h1 className="page-title">Salary Settlement</h1>
          <p className="page-subtitle">Manage monthly salary for salary-group technicians</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="input" style={{ width: 140 }} value={month} onChange={e => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
          <select className="input" style={{ width: 94 }} value={year} onChange={e => setYear(Number(e.target.value))}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {!loading && list.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
          <div className="stat-card" style={{ borderLeft: '4px solid #1B4FD8' }}>
            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Technicians</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', marginTop: 6 }}>{list.length}</div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>Salary group members</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid #F59E0B' }}>
            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#D97706', marginTop: 6 }}>{totalPending}</div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>Not yet generated</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid #059669' }}>
            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Generated / Paid</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#059669', marginTop: 6 }}>{totalGenerated + totalPaid}</div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{totalPaid} paid · {totalGenerated} generated</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid #7C3AED' }}>
            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Payable</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#7C3AED', marginTop: 6 }}>{INR(totalNetSalary)}</div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>Net salary this month</div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #E2E8F0', borderTopColor: '#1B4FD8',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
          <div style={{ color: '#94A3B8', fontSize: 14 }}>Loading salary technicians...</div>
        </div>
      ) : list.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>💼</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#334155', marginBottom: 6 }}>No Salary Technicians Found</div>
          <div style={{ fontSize: 13, color: '#94A3B8' }}>Create a salary commission group and assign technicians to get started.</div>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Technician</th>
                  <th>Group</th>
                  <th>Monthly Salary</th>
                  <th style={{ textAlign: 'center' }}>Bookings</th>
                  <th style={{ textAlign: 'center' }}>Attendance</th>
                  <th style={{ textAlign: 'center' }}>Hours</th>
                  <th>Net Salary</th>
                  <th>Status</th>
                  <th style={{ width: 200 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row, i) => (
                  <tr key={row.technician_id}>
                    <td style={{ color: '#94A3B8', fontSize: 12 }}>{i+1}</td>
                    <td>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0F172A' }}>{row.technician_name}</div>
                      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{row.technician_mobile}</div>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#475569', background: '#F1F5F9',
                        padding: '3px 10px', borderRadius: 6 }}>{row.group_name}</span>
                    </td>
                    <td style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>{INR(row.monthly_salary)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#1B4FD8',
                        background: '#EFF6FF', padding: '2px 10px', borderRadius: 20, display: 'inline-block' }}>
                        {row.total_bookings}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#059669' }}>{row.attendance_days}d</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#64748B' }}>{row.total_hours_worked}h</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 800, fontSize: 14, color: row.net_salary != null ? '#059669' : '#94A3B8' }}>
                        {row.net_salary != null ? INR(row.net_salary) : '—'}
                      </div>
                    </td>
                    <td>{statusBadge(row.settlement_status)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {!row.settlement_id ? (
                          <button onClick={() => openGenerate(row)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                              background: '#1B4FD8', color: 'white', border: 'none', borderRadius: 8,
                              fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            ⚡ Generate
                          </button>
                        ) : (
                          <>
                            <button onClick={() => openView(row)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px',
                                background: 'white', color: '#334155', border: '1px solid #E2E8F0',
                                borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                              👁 View
                            </button>
                            {row.settlement_status === 'GENERATED' && (
                              <button onClick={() => openEdit(row)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px',
                                  background: '#FFFBEB', color: '#D97706', border: '1px solid #FCD34D',
                                  borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                ✏️ Edit
                              </button>
                            )}
                            {row.settlement_status === 'GENERATED' && (
                              <button onClick={() => openPay(row)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px',
                                  background: '#059669', color: 'white', border: 'none',
                                  borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                💳 Pay
                              </button>
                            )}
                            {row.settlement_status === 'PAID' && (
                              <button onClick={() => openPay(row)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px',
                                  background: '#7C3AED', color: 'white', border: 'none',
                                  borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                🏦 Bank
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Generate / Edit Modal */}
      {genModal && (
        <Modal
          title={`${genForm._settlement_id ? 'Edit' : 'Generate'} Salary — ${genModal.technician_name}`}
          onClose={() => setGenModal(null)}
          size="xl"
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 20 }}>
            {[
              { icon: '📅', label: 'Period',     val: `${MONTHS[month-1]} ${year}` },
              { icon: '👥', label: 'Group',      val: genModal.group_name || '—' },
              { icon: '📋', label: 'Bookings',   val: genModal.total_bookings || 0 },
              { icon: '🗓', label: 'Attendance', val: `${genModal.attendance_days || 0} days` },
            ].map(({ icon, label, val }) => (
              <div key={label} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10,
                padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>{icon}</span>
                <div>
                  <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginTop: 1 }}>{val}</div>
                </div>
              </div>
            ))}
          </div>

          {prevLoading && (
            <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 12, color: '#94A3B8' }}>
              <div style={{ width: 24, height: 24, border: '2px solid #E2E8F0', borderTopColor: '#1B4FD8',
                borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }} />
              Loading technician data...
            </div>
          )}
          {preview && !prevLoading && <SummaryBar s={preview.summary} />}

          <TabBar
            tabs={[
              { key: 'bookings',   label: 'Bookings',    icon: '📋' },
              { key: 'attendance', label: 'Attendance',  icon: '📅' },
              { key: 'cash',       label: 'Cash',        icon: '💵' },
              { key: 'revenue',    label: 'Revenue',     icon: '💰' },
              { key: 'salary',     label: 'Salary Form', icon: '🧾' },
            ]}
            active={genTab}
            onSelect={setGenTab}
          />

          {genTab !== 'salary' ? (
            prevLoading
              ? <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Loading data...</div>
              : renderPreviewTab(genTab, preview)
          ) : (
            <div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 24, height: 24, background: '#ECFDF5', borderRadius: 6,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>+</span>
                  Allowances & Earnings
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                  {[
                    { key: 'monthly_salary',   label: 'Basic Salary', required: true },
                    { key: 'petrol_amount',    label: 'Petrol Allowance' },
                    { key: 'mobile_recharge',  label: 'Mobile Recharge' },
                    { key: 'bonus_amount',     label: 'Bonus' },
                    { key: 'hra_amount',       label: 'HRA' },
                    { key: 'other_allowances', label: 'Other Allowances' },
                  ].map(({ key, label, required }) => (
                    <div key={key}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>
                        {label} {required && <span style={{ color: '#EF4444' }}>*</span>}
                      </label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                          color: '#94A3B8', fontSize: 13, fontWeight: 600, pointerEvents: 'none' }}>₹</span>
                        <input className="input" type="number" min="0" style={{ paddingLeft: 24 }}
                          value={genForm[key] ?? ''}
                          onChange={e => setGenForm((f: any) => ({ ...f, [key]: Number(e.target.value) }))} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ height: 1, background: '#E2E8F0', margin: '4px 0 16px' }} />

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 24, height: 24, background: '#FEF2F2', borderRadius: 6,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>−</span>
                  Deductions
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>Amount (₹)</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                        color: '#94A3B8', fontSize: 13, fontWeight: 600, pointerEvents: 'none' }}>₹</span>
                      <input className="input" type="number" min="0" style={{ paddingLeft: 24 }}
                        value={genForm.deductions ?? ''}
                        onChange={e => setGenForm((f: any) => ({ ...f, deductions: Number(e.target.value) }))} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>Deduction Reason</label>
                    <input className="input" placeholder="e.g. Late arrivals, advance recovery..."
                      value={genForm.deduction_notes || ''}
                      onChange={e => setGenForm((f: any) => ({ ...f, deduction_notes: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>Admin Notes (optional)</label>
                <input className="input" placeholder="Internal notes about this settlement..."
                  value={genForm.admin_notes || ''}
                  onChange={e => setGenForm((f: any) => ({ ...f, admin_notes: e.target.value }))} />
              </div>

              <div style={{ background: 'linear-gradient(135deg,#1B4FD8,#1D40AF)', borderRadius: 14, padding: '18px 20px', color: 'white' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7, marginBottom: 14 }}>
                  Salary Summary
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
                  {[
                    ['Basic', genForm.monthly_salary || 0],
                    ['Allowances', (Number(genForm.petrol_amount)||0)+(Number(genForm.mobile_recharge)||0)+(Number(genForm.bonus_amount)||0)+(Number(genForm.hra_amount)||0)+(Number(genForm.other_allowances)||0)],
                    ['Deductions', genForm.deductions || 0],
                  ].map(([l, v]) => (
                    <div key={l as string} style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4 }}>{l}</div>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>{INR(v as number)}</div>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>Gross: {INR(gross(genForm))}</div>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>* Market reimbursement auto-calculated</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>Net Payable</div>
                    <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.5px' }}>{INR(net(genForm))}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button onClick={() => setGenModal(null)}
                  style={{ padding: '10px 22px', background: 'white', color: '#475569', border: '1px solid #E2E8F0',
                    borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={saveGenerate} disabled={genLoading}
                  style={{ padding: '10px 24px', background: genLoading ? '#93C5FD' : '#1B4FD8', color: 'white',
                    border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
                    cursor: genLoading ? 'not-allowed' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {genLoading ? (
                    <>
                      <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)',
                        borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      Saving...
                    </>
                  ) : (
                    <>✅ {genForm._settlement_id ? 'Update Settlement' : 'Generate Settlement'}</>
                  )}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* View Details Modal */}
      {viewLoading && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 16, padding: '32px 40px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ width: 40, height: 40, border: '3px solid #E2E8F0', borderTopColor: '#1B4FD8',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
            <div style={{ fontSize: 14, color: '#64748B' }}>Loading settlement details...</div>
          </div>
        </div>
      )}
      {viewData && !viewLoading && (
        <Modal
          title={`Salary Report — ${viewData.technician_name}`}
          onClose={() => setViewData(null)}
          size="xl"
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569', background: '#F1F5F9',
              padding: '4px 12px', borderRadius: 20 }}>
              📅 {MONTHS[(viewData.month||1)-1]} {viewData.year}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569', background: '#F1F5F9',
              padding: '4px 12px', borderRadius: 20 }}>
              👥 {viewData.commission_group_name || '—'}
            </span>
            {statusBadge(viewData.status)}
          </div>

          <SummaryBar s={{
            total_bookings:     viewData.total_bookings || 0,
            attendance_days:    viewData.attendance_days || 0,
            total_hours_worked: viewData.total_hours_worked || 0,
            cash_in_hand_total: viewData.cash_collections?.reduce((s: number, c: any) => s + (c.amount || 0), 0) || 0,
            revenue_total:      viewData.revenue_summary?.total_revenue || 0,
          }} />

          <div style={{ background: 'linear-gradient(135deg,#1B4FD8,#1D40AF)', borderRadius: 14, padding: '18px 20px', color: 'white', marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7, marginBottom: 14 }}>
              Salary Breakdown
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 32px' }}>
              {[
                ['Basic Salary',     viewData.monthly_salary],
                ['Petrol',           viewData.petrol_amount],
                ['Mobile Recharge',  viewData.mobile_recharge],
                ['Bonus',            viewData.bonus_amount],
                ['HRA',              viewData.hra_amount],
                ['Other Allowances', viewData.other_allowances],
              ].filter(([, v]) => (v as number) > 0).map(([label, val]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ opacity: 0.75, fontSize: 13 }}>{label}</span>
                  <span style={{ fontWeight: 700 }}>{INR(val as number)}</span>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', marginTop: 12, paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, opacity: 0.8, fontSize: 13 }}>
                <span>Gross Salary</span><span style={{ fontWeight: 700 }}>{INR(viewData.gross_salary)}</span>
              </div>
              {viewData.deductions > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                  <span style={{ opacity: 0.7 }}>Deductions {viewData.deduction_notes ? `(${viewData.deduction_notes})` : ''}</span>
                  <span style={{ color: '#FCA5A5', fontWeight: 700 }}>−{INR(viewData.deductions)}</span>
                </div>
              )}
              {viewData.market_reimbursement > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                  <span style={{ opacity: 0.7 }}>Market Reimbursement</span>
                  <span style={{ color: '#86EFAC', fontWeight: 700 }}>+{INR(viewData.market_reimbursement)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.2)',
                paddingTop: 10, marginTop: 8, alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Net Payable</span>
                <span style={{ fontWeight: 900, fontSize: 26 }}>{INR(viewData.net_salary)}</span>
              </div>
            </div>
          </div>

          <TabBar
            tabs={[
              { key: 'bookings',   label: 'Bookings',   icon: '📋' },
              { key: 'attendance', label: 'Attendance', icon: '📅' },
              { key: 'cash',       label: 'Cash',       icon: '💵' },
              { key: 'revenue',    label: 'Revenue',    icon: '💰' },
            ]}
            active={viewTab}
            onSelect={setViewTab}
          />
          {renderPreviewTab(viewTab, {
            bookings:            viewData.bookings            || [],
            attendance:          viewData.attendance          || [],
            cash_collections:    viewData.cash_collections    || [],
            revenue_transactions: viewData.revenue_transactions || [],
            summary: {
              revenue_cash:       viewData.revenue_summary?.cash_total      || 0,
              revenue_online:     viewData.revenue_summary?.online_total    || 0,
              revenue_pay_later:  viewData.revenue_summary?.pay_later_total || 0,
              revenue_total:      viewData.revenue_summary?.total_revenue   || 0,
              cash_in_hand_total: viewData.cash_collections?.reduce((s: number, c: any) => s + (c.amount || 0), 0) || 0,
            },
          })}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <button onClick={() => setViewData(null)}
              style={{ padding: '10px 24px', background: '#F1F5F9', color: '#334155',
                border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* Pay Salary Modal */}
      {payModal && (
        <Modal
          title={payModal.settlement_status === 'PAID' ? '🏦 Send to Bank / UPI' : '💳 Pay Salary'}
          onClose={() => setPayModal(null)}
          size="sm"
        >
          <div style={{ background: 'linear-gradient(135deg,#059669,#047857)', borderRadius: 14,
            padding: '16px 20px', marginBottom: 20, color: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Technician</div>
                <div style={{ fontSize: 17, fontWeight: 800, marginTop: 4 }}>{payModal.technician_name}</div>
                <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{payModal.technician_mobile}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, opacity: 0.75 }}>Net Salary</div>
                <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{INR(payModal.net_salary)}</div>
              </div>
            </div>
          </div>

          {walletInfo && (
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12,
              padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                👛 Current Wallet
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: '#64748B' }}>Balance</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>{INR(walletInfo.wallet?.balance)}</span>
              </div>
              {walletInfo.upi_id && (
                <div style={{ fontSize: 12, color: '#64748B', padding: '6px 10px', background: '#EFF6FF', borderRadius: 8, marginTop: 4 }}>
                  💳 UPI: <strong style={{ color: '#1D4ED8' }}>{walletInfo.upi_id}</strong>
                </div>
              )}
              {walletInfo.bank_account && (
                <div style={{ fontSize: 12, color: '#64748B', padding: '6px 10px', background: '#F5F3FF', borderRadius: 8, marginTop: 6 }}>
                  🏦 A/C: <strong>{walletInfo.bank_account}</strong> · IFSC: <strong>{walletInfo.bank_ifsc}</strong>
                </div>
              )}
            </div>
          )}

          {payModal.settlement_status === 'GENERATED' ? (
            <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 12,
              padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: '#92400E', fontWeight: 600, marginBottom: 4 }}>⚠️ Wallet Credit</div>
              <div style={{ fontSize: 12, color: '#92400E' }}>
                This will credit <strong>{INR(payModal.net_salary)}</strong> to the technician's in-app wallet as a SALARY transaction.
              </div>
            </div>
          ) : (
            <>
              <div style={{ background: '#F5F3FF', border: '1px solid #C4B5FD', borderRadius: 12,
                padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#5B21B6', fontWeight: 600, marginBottom: 4 }}>🏦 Bank / UPI Transfer</div>
                <div style={{ fontSize: 12, color: '#5B21B6' }}>
                  Wallet balance of <strong>{INR(walletInfo?.wallet?.balance)}</strong> will be transferred to the technician's bank or UPI.
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Payout Method *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {['UPI', 'BANK'].map(m => (
                    <button key={m} onClick={() => setPayForm(f => ({ ...f, payout_method: m }))}
                      style={{ padding: '10px 0', border: `2px solid ${payForm.payout_method === m ? '#1B4FD8' : '#E2E8F0'}`,
                        borderRadius: 10, background: payForm.payout_method === m ? '#EFF6FF' : 'white',
                        color: payForm.payout_method === m ? '#1B4FD8' : '#64748B',
                        fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}>
                      {m === 'UPI' ? '💳 UPI' : '🏦 Bank'}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                  {payForm.payout_method === 'UPI' ? 'UPI ID / Transaction Reference' : 'Bank A/C / UTR Reference'}
                </label>
                <input className="input" placeholder={payForm.payout_method === 'UPI' ? 'e.g. name@upi or UTR number' : 'UTR / transaction ref number'}
                  value={payForm.payment_reference}
                  onChange={e => setPayForm(f => ({ ...f, payment_reference: e.target.value }))} />
              </div>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <button onClick={() => setPayModal(null)}
              style={{ padding: '12px 0', background: 'white', color: '#475569', border: '1px solid #E2E8F0',
                borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
            {payModal.settlement_status === 'GENERATED' ? (
              <button onClick={paySalary} disabled={payLoading}
                style={{ padding: '12px 0', background: payLoading ? '#6EE7B7' : '#059669', color: 'white',
                  border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
                  cursor: payLoading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {payLoading ? (
                  <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Processing...</>
                ) : (
                  <>💳 Credit {INR(payModal.net_salary)} to Wallet</>
                )}
              </button>
            ) : (
              <button onClick={sendToBank} disabled={payLoading}
                style={{ padding: '12px 0', background: payLoading ? '#A78BFA' : '#7C3AED', color: 'white',
                  border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
                  cursor: payLoading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {payLoading ? (
                  <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Processing...</>
                ) : (
                  <>🏦 Send to {payForm.payout_method === 'UPI' ? 'UPI' : 'Bank'}</>
                )}
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
