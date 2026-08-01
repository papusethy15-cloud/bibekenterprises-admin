/**
 * Customers.tsx — Advanced Customer Management
 *
 * Features:
 *  ✅ Mobile-first customer lookup (check-mobile before create)
 *  ✅ Duplicate prevention by mobile
 *  ✅ Customer detail panel with tabs: Info | Addresses | Appliances | GST | Bookings
 *  ✅ Add / edit addresses (multiple per customer)
 *  ✅ Add / view appliances (from existing appliances API)
 *  ✅ GST detail editing inline
 *  ✅ Last booking summary shown when customer is found
 *  ✅ "Book for Customer" shortcut → opens BookingModal
 *  ✅ BookingModal: domain selector, service selector (filtered by domain),
 *      address selector, duplicate-booking guard, multi-booking support
 */
import { useEffect, useState, useCallback } from 'react'
import {
  api, customersAPI, bookingsAPI, domainsAPI, appliancesAPI,
} from '@/services/api'
import PageHeader from '@/components/layout/PageHeader'
import StatusBadge from '@/components/ui/StatusBadge'
import Pagination from '@/components/ui/Pagination'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import BookingModal from '@/components/bookings/BookingModal'
import { useAuthStore } from '@/store/authStore'

// ─── tiny helpers ────────────────────────────────────────────────────────────
const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
const money = (n: number) => `₹${(n || 0).toLocaleString('en-IN')}`
const InfoBox = ({ label, value }: { label: string; value: any }) => (
  <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '10px 14px' }}>
    <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
    <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 14 }}>{value ?? '—'}</div>
  </div>
)
const toErrString = (detail: any): string => {
  if (!detail) return ''
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ')
  return JSON.stringify(detail)
}
const Err = ({ msg }: { msg: any }) =>
  msg ? <div style={{ background: '#FEE2E2', color: '#DC2626', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>{toErrString(msg)}</div> : null

// ─── tab type ────────────────────────────────────────────────────────────────
type Tab = 'info' | 'addresses' | 'appliances' | 'gst' | 'bookings'


const lbl: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }

// ─── AddressForm ──────────────────────────────────────────────────────────────
// Parse lat/lng from WhatsApp / Google Maps share URLs
function extractLatLngFromUrl(url: string): { lat: string; lng: string } | null {
  const patterns = [
    /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /loc:(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  ]
  for (const pat of patterns) {
    const m = url.match(pat)
    if (m) {
      const lat = parseFloat(m[1]), lng = parseFloat(m[2])
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)
        return { lat: m[1], lng: m[2] }
    }
  }
  return null
}

const EMPTY_ADDR = { label: 'Home', address_line1: '', address_line2: '', city: '', state: '', pincode: '', latitude: '', longitude: '', is_default: false }

function AddressModal({ customerId, address, onClose, onSaved }: any) {
  const [form, setForm] = useState(address ? { ...address, latitude: address.latitude || '', longitude: address.longitude || '' } : EMPTY_ADDR)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [waUrl, setWaUrl] = useState('')
  const [waErr, setWaErr] = useState('')
  const [cities, setCities] = useState<any[]>([])

  useEffect(() => {
    api.get('/cities?limit=100').then((r: any) => {
      const items = r.data?.data?.items ?? r.data?.data ?? []
      setCities(Array.isArray(items) ? items : [])
    }).catch(() => {})
  }, [])

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const handleWaUrlChange = (val: string) => {
    setWaUrl(val); setWaErr('')
    const result = extractLatLngFromUrl(val.trim())
    if (result) {
      setForm((f: any) => ({ ...f, latitude: result.lat, longitude: result.lng }))
    } else if (val.trim() && (val.includes('maps') || val.includes('google'))) {
      setWaErr('Could not parse coordinates from this link.')
    }
  }
  const handle = async () => {
    setSaving(true); setErr('')
    try {
      const payload = { ...form, latitude: form.latitude ? parseFloat(form.latitude) : null, longitude: form.longitude ? parseFloat(form.longitude) : null }
      if (address?.id) await customersAPI.updateAddress(customerId, address.id, payload)
      else await customersAPI.addAddress(customerId, payload)
      onSaved()
    } catch (ex: any) { setErr(ex.response?.data?.detail || 'Failed') } finally { setSaving(false) }
  }

  const labels = ['Home', 'Work', 'Other']
  return (
    <Modal title={address?.id ? 'Edit Address' : 'Add Address'} onClose={onClose} size="md">
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Label</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {labels.map(l => (
            <button key={l} onClick={() => set('label', l)}
              style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid', cursor: 'pointer',
                borderColor: form.label === l ? '#1B4FD8' : '#E2E8F0',
                background: form.label === l ? '#EFF6FF' : 'white', color: form.label === l ? '#1B4FD8' : '#64748B', fontSize: 13, fontWeight: 600 }}>
              {l}
            </button>
          ))}
          <input className="input" style={{ flex: 1 }} placeholder="Custom label" value={!labels.includes(form.label) ? form.label : ''}
            onChange={e => set('label', e.target.value)} />
        </div>
      </div>
      {[['Address Line 1 *', 'address_line1', 'Flat/House no, Street'], ['Address Line 2', 'address_line2', 'Landmark, Area']].map(([l, k, ph]) => (
        <div key={k} style={{ marginBottom: 12 }}>
          <label style={lbl}>{l}</label>
          <input className="input" placeholder={ph} value={(form as any)[k] || ''}
            onChange={e => set(k, e.target.value)} />
        </div>
      ))}
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>City *</label>
        {cities.length > 0 ? (
          <select className="input" value={form.city || ''} onChange={e => {
            const city = cities.find((c: any) => c.name === e.target.value)
            set('city', e.target.value)
            if (city?.state) set('state', city.state)
          }}>
            <option value="">Select serviceable city</option>
            {cities.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        ) : (
          <input className="input" placeholder="City" value={form.city || ''} onChange={e => set('city', e.target.value)} />
        )}
      </div>
      {[['State *', 'state', 'State'], ['Pincode *', 'pincode', '6-digit pincode']].map(([l, k, ph]) => (
        <div key={k} style={{ marginBottom: 12 }}>
          <label style={lbl}>{l}</label>
          <input className="input" placeholder={ph} value={(form as any)[k] || ''}
            onChange={e => set(k, e.target.value)} />
        </div>
      ))}
      {/* WhatsApp / Google Maps location paste */}
      <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
        <label style={{ ...lbl, color: '#166534', marginBottom: 6 }}>💬 Paste WhatsApp / Google Maps Location Link</label>
        <input
          className="input"
          placeholder="https://maps.google.com/?q=20.2961,85.8245"
          value={waUrl}
          onChange={e => handleWaUrlChange(e.target.value)}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
        {waErr && <p style={{ color: '#B45309', fontSize: 11, marginTop: 4 }}>⚠️ {waErr}</p>}
        {form.latitude && form.longitude && !waErr && waUrl && (
          <p style={{ color: '#166534', fontSize: 11, marginTop: 4 }}>
            ✓ Parsed: {form.latitude}, {form.longitude} —{' '}
            <a href={`https://www.google.com/maps?q=${form.latitude},${form.longitude}`} target="_blank" rel="noreferrer" style={{ color: '#1B4FD8' }}>Verify</a>
          </p>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={lbl}>Latitude</label>
          <input className="input" placeholder="Auto-filled from link" value={form.latitude} onChange={e => set('latitude', e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Longitude</label>
          <input className="input" placeholder="Auto-filled from link" value={form.longitude} onChange={e => set('longitude', e.target.value)} />
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 16, fontSize: 13 }}>
        <input type="checkbox" checked={form.is_default} onChange={e => set('is_default', e.target.checked)} />
        Set as default address
      </label>
      <Err msg={err} />
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={handle} disabled={saving}>{saving ? <Spinner size="sm" /> : 'Save Address'}</button>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

// ─── AddApplianceModal ────────────────────────────────────────────────────────
function AddApplianceModal({ customerId, onClose, onSaved }: any) {
  const [categories, setCategories] = useState<any[]>([])
  const [brands, setBrands]         = useState<any[]>([])
  const [types, setTypes]           = useState<any[]>([])
  const [form, setForm] = useState({
    appliance_category_id: '', brand_id: '', type_id: '', category: '',
    model: '', serial_number: '', purchase_date: '', warranty_expiry: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  useEffect(() => {
    appliancesAPI.categories().then(r => setCategories(r.data.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!form.appliance_category_id) { setBrands([]); setTypes([]); return }
    appliancesAPI.brands({ appliance_category_id: form.appliance_category_id })
      .then(r => setBrands(r.data.data || [])).catch(() => {})
    const cat = categories.find((c: any) => c.id === form.appliance_category_id)
    if (cat) setForm(f => ({ ...f, category: cat.name }))
  }, [form.appliance_category_id])

  useEffect(() => {
    if (!form.brand_id || !form.appliance_category_id) { setTypes([]); return }
    appliancesAPI.types({ brand_id: form.brand_id, appliance_category_id: form.appliance_category_id })
      .then(r => setTypes(r.data.data || [])).catch(() => {})
  }, [form.brand_id])

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handle = async () => {
    setSaving(true); setErr('')
    try {
      await appliancesAPI.add({
        customer_id: customerId,
        appliance_category_id: form.appliance_category_id || undefined,
        brand_id: form.brand_id || undefined,
        type_id: form.type_id || undefined,
        category: form.category || undefined,
        model: form.model || undefined,
        serial_number: form.serial_number || undefined,
        purchase_date: form.purchase_date ? new Date(form.purchase_date).toISOString() : undefined,
        warranty_expiry: form.warranty_expiry ? new Date(form.warranty_expiry).toISOString() : undefined,
        notes: form.notes || undefined,
      })
      onSaved()
    } catch (ex: any) { setErr(ex.response?.data?.detail || 'Failed') } finally { setSaving(false) }
  }

  return (
    <Modal title="Add Appliance" onClose={onClose} size="md">
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Category</label>
        <select className="input" value={form.appliance_category_id} onChange={e => set('appliance_category_id', e.target.value)}>
          <option value="">— Select category —</option>
          {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={lbl}>Brand</label>
          <select className="input" value={form.brand_id} onChange={e => set('brand_id', e.target.value)} disabled={!form.appliance_category_id}>
            <option value="">— Select brand —</option>
            {brands.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Type / Variant</label>
          <select className="input" value={form.type_id} onChange={e => set('type_id', e.target.value)} disabled={!form.brand_id}>
            <option value="">— Select type —</option>
            {types.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Model</label>
        <input className="input" placeholder="Model number" value={form.model} onChange={e => set('model', e.target.value)} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Serial Number</label>
        <input className="input" placeholder="Serial / IMEI number" value={form.serial_number} onChange={e => set('serial_number', e.target.value)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div><label style={lbl}>Purchase Date</label><input className="input" type="date" value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)} /></div>
        <div><label style={lbl}>Warranty Expiry</label><input className="input" type="date" value={form.warranty_expiry} onChange={e => set('warranty_expiry', e.target.value)} /></div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={lbl}>Notes</label>
        <input className="input" placeholder="Optional notes" value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>
      <Err msg={err} />
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={handle} disabled={saving}>{saving ? <Spinner size="sm" /> : 'Add Appliance'}</button>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

// ─── CustomerDetailModal ──────────────────────────────────────────────────────
function CustomerDetailModal({ customer: initial, onClose, onBooking, isAdmin, onPermanentDelete }: {
  customer: any; onClose: () => void; onBooking: (c: any, a: any[], appl: any[]) => void
  isAdmin?: boolean; onPermanentDelete?: (c: any) => void
}) {
  const [customer, setCustomer]   = useState(initial)
  const [tab, setTab]             = useState<Tab>('info')
  const [addresses, setAddresses] = useState<any[]>([])
  const [appliances, setAppliances] = useState<any[]>([])
  const [bookings, setBookings]   = useState<any[]>([])
  const [loading, setLoading]     = useState(false)

  // Edit states
  const [editInfo, setEditInfo]   = useState(false)
  const [editGst, setEditGst]     = useState(false)
  const [infoForm, setInfoForm]   = useState({ name: customer.name, email: customer.email || '', alternate_mobile: customer.alternate_mobile || '', notes: customer.notes || '' })
  const [gstForm, setGstForm]     = useState({ gst_number: customer.gst_number || '', gst_name: customer.gst_name || '', gst_address: customer.gst_address || '' })
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')

  // Address / Appliance modal
  const [addrModal, setAddrModal]     = useState<any>(null)   // null | 'new' | address-obj
  const [showAddAppl, setShowAddAppl] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [addrRes, applRes, bkRes, custRes] = await Promise.all([
        customersAPI.addresses(customer.id),
        customersAPI.appliances(customer.id),
        customersAPI.bookings(customer.id),
        customersAPI.get(customer.id),
      ])
      setAddresses(addrRes.data.data || [])
      setAppliances(applRes.data.data || [])
      setBookings(bkRes.data.data?.items || [])
      setCustomer(custRes.data.data)
    } catch { } finally { setLoading(false) }
  }, [customer.id])

  useEffect(() => { reload() }, [reload])

  const saveInfo = async () => {
    setSaving(true); setErr('')
    try { await customersAPI.update(customer.id, infoForm); setEditInfo(false); reload() }
    catch (ex: any) { setErr(ex.response?.data?.detail || 'Failed') } finally { setSaving(false) }
  }
  const saveGst = async () => {
    setSaving(true); setErr('')
    try { await customersAPI.update(customer.id, gstForm); setEditGst(false); reload() }
    catch (ex: any) { setErr(ex.response?.data?.detail || 'Failed') } finally { setSaving(false) }
  }
  const deleteAddress = async (aId: string) => {
    if (!confirm('Remove this address?')) return
    await customersAPI.deleteAddress(customer.id, aId); reload()
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'info', label: '👤 Info' },
    { key: 'addresses', label: `📍 Addresses (${addresses.length})` },
    { key: 'appliances', label: `🔧 Appliances (${appliances.length})` },
    { key: 'gst', label: '🧾 GST' },
    { key: 'bookings', label: `📋 Bookings (${bookings.length})` },
  ]

  return (
    <Modal title={`${customer.name} — ${customer.customer_code || ''}`} onClose={onClose} size="lg">
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #E2E8F0', marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 14px', fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
            borderTop: 'none', borderLeft: 'none', borderRight: 'none',
            borderBottom: tab === t.key ? '2px solid #1B4FD8' : '2px solid transparent',
            marginBottom: -2, background: 'none', cursor: 'pointer',
            color: tab === t.key ? '#1B4FD8' : '#64748B',
          }}>{t.label}</button>
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-primary btn-sm" onClick={() => onBooking(customer, addresses, appliances)}>
            + Book Service
          </button>
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 24 }}><Spinner /></div>}

      {/* ── INFO TAB ── */}
      {!loading && tab === 'info' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <InfoBox label="Customer Code" value={<span style={{ fontFamily: 'monospace' }}>{customer.customer_code}</span>} />
            <InfoBox label="Mobile" value={customer.mobile} />
            <InfoBox label="Alternate Mobile" value={customer.alternate_mobile} />
            <InfoBox label="Email" value={customer.email} />
            <InfoBox label="Total Bookings" value={customer.total_bookings || 0} />
            <InfoBox label="Joined" value={fmt(customer.created_at)} />
          </div>
          {customer.notes && <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
            📝 {customer.notes}
          </div>}
          {!editInfo ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => { setEditInfo(true); setErr('') }}>Edit Info</button>
              {isAdmin && onPermanentDelete && (
                <button
                  className="btn btn-danger"
                  title="Permanently delete -- also deletes ALL related bookings, quotations, invoices, payments, etc. Irreversible."
                  onClick={() => onPermanentDelete(customer)}
                >
                  Permanently Delete (Admin)
                </button>
              )}
            </div>
          ) : (
            <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 16, border: '1px solid #E2E8F0' }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Edit Customer Info</h4>
              {[['Name', 'name'], ['Email', 'email'], ['Alternate Mobile', 'alternate_mobile']].map(([l, k]) => (
                <div key={k} style={{ marginBottom: 10 }}>
                  <label style={lbl}>{l}</label>
                  <input className="input" value={(infoForm as any)[k]} onChange={e => setInfoForm(f => ({ ...f, [k]: e.target.value }))} />
                </div>
              ))}
              <div style={{ marginBottom: 10 }}>
                <label style={lbl}>Notes</label>
                <textarea className="input" rows={2} value={infoForm.notes} onChange={e => setInfoForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <Err msg={err} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={saveInfo} disabled={saving}>{saving ? <Spinner size="sm" /> : 'Save'}</button>
                <button className="btn btn-secondary" onClick={() => setEditInfo(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ADDRESSES TAB ── */}
      {!loading && tab === 'addresses' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={() => setAddrModal('new')}>+ Add Address</button>
          </div>
          {addresses.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94A3B8', padding: 32, fontSize: 14 }}>No addresses saved yet.</div>
          ) : addresses.map((a: any) => (
            <div key={a.id} style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 16px', marginBottom: 10, background: a.is_default ? '#EFF6FF' : 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1B4FD8', background: '#EFF6FF', padding: '2px 8px', borderRadius: 4, marginRight: 8 }}>{a.label}</span>
                  {a.is_default && <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>★ Default</span>}
                  <div style={{ marginTop: 6, fontSize: 14, color: '#0F172A' }}>{a.address_line1}</div>
                  {a.address_line2 && <div style={{ fontSize: 13, color: '#64748B' }}>{a.address_line2}</div>}
                  <div style={{ fontSize: 13, color: '#64748B' }}>{a.city}, {a.state} — {a.pincode}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setAddrModal(a)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteAddress(a.id)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── APPLIANCES TAB ── */}
      {!loading && tab === 'appliances' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={() => setShowAddAppl(true)}>+ Add Appliance</button>
          </div>
          {appliances.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94A3B8', padding: 32, fontSize: 14 }}>No appliances registered yet.</div>
          ) : appliances.map((a: any) => (
            <div key={a.id} style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {a.category_name || a.category || 'Appliance'}
                    {a.brand_name && ` — ${a.brand_name}`}
                    {a.type_name && ` (${a.type_name})`}
                  </div>
                  {a.model && <div style={{ fontSize: 13, color: '#64748B' }}>Model: {a.model}</div>}
                  {a.serial_number && <div style={{ fontSize: 13, color: '#64748B' }}>S/N: {a.serial_number}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                      background: a.is_under_warranty ? '#D1FAE5' : '#FEE2E2',
                      color: a.is_under_warranty ? '#065F46' : '#991B1B',
                    }}>
                      {a.is_under_warranty ? '✓ Under Warranty' : '✗ Warranty Expired'}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#F1F5F9', color: '#475569' }}>
                      {a.status}
                    </span>
                  </div>
                </div>
              </div>
              {a.notes && <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 6 }}>📝 {a.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── GST TAB ── */}
      {!loading && tab === 'gst' && (
        <div>
          {!editGst ? (
            <>
              {customer.gst_number ? (
                <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
                  <InfoBox label="GSTIN" value={<span style={{ fontFamily: 'monospace', letterSpacing: 1 }}>{customer.gst_number}</span>} />
                  <InfoBox label="Business Name" value={customer.gst_name} />
                  <InfoBox label="GST Address" value={customer.gst_address} />
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: '#94A3B8', padding: 24, fontSize: 14 }}>
                  No GST details saved. Click Edit to add.
                </div>
              )}
              <button className="btn btn-secondary" onClick={() => { setEditGst(true); setErr('') }}>
                {customer.gst_number ? 'Edit GST Details' : '+ Add GST Details'}
              </button>
            </>
          ) : (
            <div>
              {[['GSTIN', 'gst_number', 'e.g. 27AAPFU0939F1ZV'], ['Business Name', 'gst_name', 'Registered name'], ['GST Address', 'gst_address', 'Registered address']].map(([l, k, ph]) => (
                <div key={k} style={{ marginBottom: 12 }}>
                  <label style={lbl}>{l}</label>
                  <input className="input" placeholder={ph} value={(gstForm as any)[k]} onChange={e => setGstForm(f => ({ ...f, [k]: e.target.value }))} />
                </div>
              ))}
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>Leave GSTIN blank to remove GST details.</div>
              <Err msg={err} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={saveGst} disabled={saving}>{saving ? <Spinner size="sm" /> : 'Save GST'}</button>
                <button className="btn btn-secondary" onClick={() => setEditGst(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BOOKINGS TAB ── */}
      {!loading && tab === 'bookings' && (
        <div>
          {bookings.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94A3B8', padding: 32, fontSize: 14 }}>No bookings yet.</div>
          ) : bookings.map((b: any) => (
            <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F1F5F9' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{b.booking_number}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>{new Date(b.scheduled_date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <StatusBadge status={b.status} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{money(b.total_amount)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Address modal */}
      {addrModal && (
        <AddressModal
          customerId={customer.id}
          address={addrModal === 'new' ? null : addrModal}
          onClose={() => setAddrModal(null)}
          onSaved={() => { setAddrModal(null); reload() }}
        />
      )}

      {/* Add appliance modal */}
      {showAddAppl && (
        <AddApplianceModal
          customerId={customer.id}
          onClose={() => setShowAddAppl(false)}
          onSaved={() => { setShowAddAppl(false); reload() }}
        />
      )}
    </Modal>
  )
}

// ─── CreateCustomerModal (mobile-first) ───────────────────────────────────────
function CreateCustomerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: any) => void }) {
  const [step, setStep]       = useState<'mobile' | 'form'>('mobile')
  const [mobile, setMobile]   = useState('')
  const [checking, setChecking] = useState(false)
  const [found, setFound]     = useState<any>(null)   // existing customer
  const [form, setForm]       = useState({ name: '', mobile: '', email: '', alternate_mobile: '', notes: '' })
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState('')

  const checkMobile = async () => {
    if (!mobile || mobile.length < 10) { setErr('Enter a valid 10-digit mobile number'); return }
    if (!/^[6-9]\d{9}$/.test(mobile)) { setErr('Mobile must start with 6, 7, 8, or 9 (Indian number)'); return }
    setChecking(true); setErr('')
    try {
      const res = await customersAPI.checkMobile(mobile)
      const data = res.data.data
      if (data) {
        setFound(data)
      } else {
        setFound(null)
        setForm(f => ({ ...f, mobile }))
        setStep('form')
      }
    } catch { setErr('Error checking mobile') } finally { setChecking(false) }
  }

  const handleCreate = async () => {
    setSaving(true); setErr('')
    try {
      // Strip empty strings → Pydantic receives null for optional EmailStr/fields
      const payload: any = { name: form.name.trim(), mobile: form.mobile.trim() }
      if (form.email.trim())            payload.email = form.email.trim()
      if (form.alternate_mobile.trim()) payload.alternate_mobile = form.alternate_mobile.trim()
      if (form.notes.trim())            payload.notes = form.notes.trim()
      const res = await customersAPI.create(payload)
      onCreated(res.data.data)
    } catch (ex: any) {
      const detail = ex.response?.data?.detail
      setErr(Array.isArray(detail) ? detail.map((d: any) => d.msg || '').join('; ') : (detail || 'Failed to create customer'))
    } finally { setSaving(false) }
  }

  return (
    <Modal title="Add / Find Customer" onClose={onClose} size="md">
      {/* Step 1: mobile check */}
      <div style={{ marginBottom: step === 'form' && !found ? 0 : 20 }}>
        <label style={lbl}>Mobile Number *</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" type="tel" placeholder="9XXXXXXXXX" maxLength={10}
            value={mobile} onChange={e => { setMobile(e.target.value.replace(/\D/g, '').slice(0,10)); setFound(null) }}
            onKeyDown={e => e.key === 'Enter' && checkMobile()} />
          <button className="btn btn-primary" onClick={checkMobile} disabled={checking} style={{ whiteSpace: 'nowrap' }}>
            {checking ? <Spinner size="sm" /> : 'Check'}
          </button>
        </div>
        <Err msg={err} />
      </div>

      {/* Customer found */}
      {found && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginBottom: 10 }}>
            ⚠ Customer already exists with this mobile
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <InfoBox label="Name" value={found.name} />
            <InfoBox label="Code" value={found.customer_code} />
            <InfoBox label="Total Bookings" value={found.total_bookings || 0} />
            <InfoBox label="Email" value={found.email} />
          </div>
          <button className="btn btn-primary" onClick={() => onCreated(found)}>Open Customer Profile</button>
        </div>
      )}

      {/* New customer form */}
      {step === 'form' && !found && (
        <div>
          <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#166534', marginBottom: 14 }}>
            ✓ No customer found for {mobile}. Fill in details to create.
          </div>
          {[['Name *', 'name', 'text', 'Full name'], ['Email', 'email', 'email', 'Optional'], ['Alternate Mobile', 'alternate_mobile', 'tel', 'Optional'], ['Notes', 'notes', 'text', 'Internal notes']].map(([l, k, type, ph]) => (
            <div key={k} style={{ marginBottom: 12 }}>
              <label style={lbl}>{l}</label>
              <input className="input" type={type} placeholder={ph}
                value={(form as any)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
            </div>
          ))}
          <Err msg={err} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>{saving ? <Spinner size="sm" /> : 'Create Customer'}</button>
            <button className="btn btn-secondary" onClick={() => setStep('mobile')}>Back</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Customers() {
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [page, setPage]           = useState(1)
  const [pages, setPages]         = useState(1)
  const [total, setTotal]         = useState(0)
  const [search, setSearch]       = useState('')
  const [selected, setSelected]   = useState<any>(null)   // customer for detail modal
  const [showCreate, setShowCreate] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)   // customer pending permanent delete

  // Permanent delete (with Firebase Auth cleanup) is restricted to Admin/Super Admin --
  // this only hides the button; the backend enforces the same restriction independently.
  const role = useAuthStore(s => s.user?.role)
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN'

  // Booking modal state
  const [bookingCustomer, setBookingCustomer]   = useState<any>(null)
  const [bookingAddresses, setBookingAddresses] = useState<any[]>([])
  const [bookingAppliances, setBookingAppliances] = useState<any[]>([])

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await customersAPI.list({ page, per_page: 20, search: search || undefined })
      const d = res.data.data
      setCustomers(d.items || []); setPages(d.pages || 1); setTotal(d.total || 0)
    } catch { setCustomers([]) } finally { setLoading(false) }
  }, [page, search])

  useEffect(() => { fetchCustomers() }, [fetchCustomers])
  useEffect(() => { setPage(1) }, [search])

  const openBooking = (customer: any, addresses: any[], appliances: any[] = []) => {
    setSelected(null)
    setBookingCustomer(customer)
    setBookingAddresses(addresses)
    setBookingAppliances(appliances)
  }

  const permanentlyDeleteCustomer = (customer: any) => {
    // Open the history-preview delete modal instead of browser confirm()
    setDeleteTarget(customer)
  }

  const confirmPermanentDelete = async (customer: any) => {
    setDeleteTarget(null)
    setDeletingId(customer.id)
    try {
      const res = await customersAPI.deletePermanent(customer.id)
      alert(res.data?.message || 'Customer permanently deleted')
      if (selected?.id === customer.id) setSelected(null)
      fetchCustomers()
    } catch (ex: any) {
      alert(ex.response?.data?.detail || 'Failed to permanently delete customer')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      <PageHeader title="Customers" subtitle={`${total} total customers`}
        actions={<button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Add / Find Customer</button>} />
      <div style={{ height: 20 }} />

      {/* Search */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <input className="input" style={{ width: 340 }} placeholder="Search by name, mobile or code..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <div className="card">
        {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div> : (
          <>
            <table className="data-table">
              <thead><tr>
                <th>Code</th><th>Name</th><th>Mobile</th><th>Email</th>
                <th>Bookings</th><th>GST</th><th>Joined</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {customers.length === 0
                  ? <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94A3B8', padding: 32 }}>No customers found</td></tr>
                  : customers.map((c: any) => (
                    <tr key={c.id}>
                      <td><span style={{ fontFamily: 'monospace', fontSize: 12, background: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>{c.customer_code}</span></td>
                      <td><span style={{ fontWeight: 600, color: '#1B4FD8', cursor: 'pointer' }} onClick={() => setSelected(c)}>{c.name}</span></td>
                      <td>{c.mobile}</td>
                      <td style={{ color: '#64748B', fontSize: 13 }}>{c.email || '—'}</td>
                      <td><span style={{ fontWeight: 600 }}>{c.total_bookings || 0}</span></td>
                      <td>
                        {c.gst_number
                          ? <span style={{ fontSize: 11, background: '#D1FAE5', color: '#065F46', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>GST</span>
                          : <span style={{ color: '#CBD5E1', fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: '#94A3B8' }}>{new Date(c.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => setSelected(c)}>View</button>
                          {isAdmin && (
                            <button
                              className="btn btn-danger btn-sm"
                              title="Permanently delete -- also deletes ALL related bookings, quotations, invoices, payments, etc. Irreversible."
                              disabled={deletingId === c.id}
                              onClick={() => permanentlyDeleteCustomer(c)}
                            >
                              {deletingId === c.id ? <Spinner size="sm" /> : 'Delete'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <Pagination page={page} pages={pages} onPage={setPage} />
          </>
        )}
      </div>

      {/* Customer detail modal */}
      {selected && (
        <CustomerDetailModal
          customer={selected}
          onClose={() => setSelected(null)}
          onBooking={openBooking}
          isAdmin={isAdmin}
          onPermanentDelete={permanentlyDeleteCustomer}
        />
      )}

      {/* Create / find customer modal */}
      {showCreate && (
        <CreateCustomerModal
          onClose={() => setShowCreate(false)}
          onCreated={(c) => { setShowCreate(false); setSelected(c); fetchCustomers() }}
        />
      )}

      {/* Booking modal */}
      {bookingCustomer && (
        <BookingModal
          customer={bookingCustomer}
          addresses={bookingAddresses}
          appliances={bookingAppliances}
          onClose={() => setBookingCustomer(null)}
          onDone={fetchCustomers}
        />
      )}

      {/* Permanent delete confirmation modal with history preview */}
      {deleteTarget && (
        <DeleteConfirmModal
          customer={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => confirmPermanentDelete(deleteTarget)}
        />
      )}
    </div>
  )
}

// ─── Delete Confirmation Modal with Customer History ──────────────────────────
function DeleteConfirmModal({
  customer,
  onClose,
  onConfirm,
}: {
  customer: any
  onClose: () => void
  onConfirm: () => void
}) {
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    customersAPI.history(customer.id)
      .then(r => setHistory(r.data?.data?.items || []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false))
  }, [customer.id])

  const handleConfirm = async () => {
    setConfirming(true)
    onConfirm()
  }

  const totalAmount = history.reduce((sum, b) => sum + (b.total_amount || 0), 0)

  return (
    <Modal onClose={onClose} title="Permanently Delete Customer" size="lg">
      {/* Warning banner */}
      <div style={{
        background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8,
        padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: 20 }}>⚠️</span>
        <div>
          <strong>This action is irreversible.</strong>
          <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>
            All data for <strong>{customer.name}</strong> will be permanently deleted including
            bookings, invoices, payments, quotations, addresses, appliances, and warranty records.
          </div>
        </div>
      </div>

      {/* Customer summary */}
      <div style={{
        background: '#f8f9fa', borderRadius: 8, padding: '12px 16px', marginBottom: 20,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 14,
      }}>
        <div><span style={{ color: '#888' }}>Name: </span><strong>{customer.name}</strong></div>
        <div><span style={{ color: '#888' }}>Mobile: </span><strong>{customer.mobile}</strong></div>
        {customer.code && <div><span style={{ color: '#888' }}>Code: </span><strong>{customer.code}</strong></div>}
        {customer.email && <div><span style={{ color: '#888' }}>Email: </span><strong>{customer.email}</strong></div>}
      </div>

      {/* Booking history */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: '#333' }}>
          Booking History
          {!loading && (
            <span style={{
              marginLeft: 8, background: history.length > 0 ? '#dc3545' : '#28a745',
              color: '#fff', borderRadius: 12, padding: '2px 8px', fontSize: 12, fontWeight: 500,
            }}>
              {history.length} booking{history.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spinner /></div>
        ) : history.length === 0 ? (
          <div style={{
            background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8,
            padding: '12px 16px', fontSize: 13, color: '#166534',
          }}>
            ✅ No bookings found — safe to delete.
          </div>
        ) : (
          <>
            <div style={{
              maxHeight: 220, overflowY: 'auto', border: '1px solid #e0e0e0',
              borderRadius: 8, fontSize: 13,
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e0e0e0' }}>Booking #</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e0e0e0' }}>Date</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e0e0e0' }}>Appliance</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e0e0e0' }}>Status</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #e0e0e0' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((b, i) => (
                    <tr key={b.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
                        <strong>{b.booking_number || b.id?.slice(0, 8)}</strong>
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', color: '#666' }}>
                        {b.scheduled_date ? new Date(b.scheduled_date).toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
                        {[b.appliance_brand, b.appliance_model].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                          background: b.status === 'COMPLETED' ? '#d1fae5' : b.status === 'CANCELLED' ? '#fee2e2' : '#fef3c7',
                          color: b.status === 'COMPLETED' ? '#065f46' : b.status === 'CANCELLED' ? '#991b1b' : '#92400e',
                        }}>
                          {b.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontWeight: 500 }}>
                        {b.total_amount ? `₹${Number(b.total_amount).toLocaleString('en-IN')}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{
              marginTop: 8, padding: '8px 12px', background: '#fff3cd',
              borderRadius: 6, fontSize: 13, textAlign: 'right', fontWeight: 600,
            }}>
              Total booking value: ₹{totalAmount.toLocaleString('en-IN')}
            </div>
          </>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 8, borderTop: '1px solid #eee' }}>
        <button
          className="btn btn-secondary"
          onClick={onClose}
          disabled={confirming}
          style={{ minWidth: 100 }}
        >
          Cancel
        </button>
        <button
          className="btn"
          onClick={handleConfirm}
          disabled={confirming || loading}
          style={{
            minWidth: 160, background: '#dc3545', color: '#fff',
            border: 'none', cursor: confirming ? 'not-allowed' : 'pointer', opacity: confirming ? 0.7 : 1,
          }}
        >
          {confirming ? 'Deleting…' : '🗑️ Permanently Delete'}
        </button>
      </div>
    </Modal>
  )
}
