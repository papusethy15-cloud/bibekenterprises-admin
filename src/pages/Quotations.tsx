/**
 * Quotations.tsx — Full Quotation Management (Admin Dashboard)
 *
 * Flow:
 *  1. Appliance-first: each appliance card is a machine → add services + parts per machine
 *  2. Office Stock parts: search catalogue → auto-deduct from technician's assigned stock
 *  3. Market Purchase parts: enter purchase price + sale price; if unknown → submit as new
 *     pending-verify part to catalogue
 *  4. Service search: live search from services API, city-priced automatically
 *  5. Inline panels: no nested modals — everything expands in place
 */
import { useEffect, useState, useCallback } from 'react'
import { quotationsAPI, bookingsAPI, servicesAPI, appliancesAPI, inventoryAPI, domainsAPI, customersAPI } from '@/services/api'
import PageHeader from '@/components/layout/PageHeader'
import StatusBadge from '@/components/ui/StatusBadge'
import Pagination from '@/components/ui/Pagination'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import { useBookingWebSocket } from '@/hooks/useAdminWebSocket'
import { useAuthStore } from '@/store/authStore'

// ─── helpers ──────────────────────────────────────────────────────────────────
const money = (n: number | null | undefined) =>
  `₹${Math.round(n || 0).toLocaleString('en-IN')}`
const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtDT = (d: string) =>
  d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const lbl: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }

function ErrBox({ msg }: { msg: string }) {
  if (!msg) return null
  return (
    <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 10 }}>
      ⚠ {msg}
    </div>
  )
}

function InfoBox({ msg }: { msg: string }) {
  if (!msg) return null
  return (
    <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8', padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 10 }}>
      ℹ {msg}
    </div>
  )
}

const EDITABLE_STATUSES = ['DRAFT', 'REJECTED', 'REVISED']
const Q_STATUS: Record<string, { bg: string; color: string; dot: string }> = {
  DRAFT:                { bg: '#F1F5F9', color: '#475569', dot: '#94A3B8' },
  SUBMITTED:            { bg: '#DBEAFE', color: '#1D4ED8', dot: '#3B82F6' },
  APPROVED:             { bg: '#DCFCE7', color: '#166534', dot: '#22C55E' },
  REJECTED:             { bg: '#FEE2E2', color: '#DC2626', dot: '#EF4444' },
  REVISED:              { bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  EXPIRED:              { bg: '#F1F5F9', color: '#94A3B8', dot: '#CBD5E1' },
  CONVERTED_TO_INVOICE: { bg: '#ECFDF5', color: '#059669', dot: '#10B981' },
}

export function QBadge({ status }: { status: string }) {
  const s = Q_STATUS[status] || Q_STATUS.DRAFT
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: s.bg, color: s.color }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {status?.replace(/_/g, ' ')}
    </span>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ServiceSearchPanel — search & add a service to an appliance
// ══════════════════════════════════════════════════════════════════════════════
function ServiceSearchPanel({
  quotationId, quotationStatus, bookingCity, applianceLabel, onAdded, onCancel,
}: {
  quotationId: string; quotationStatus?: string; bookingCity: string; applianceLabel: string;
  onAdded: () => void; onCancel: () => void;
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [addedNames, setAddedNames] = useState<string[]>([])

  const [hasSearched, setHasSearched] = useState(false)

  const search = async (q?: string) => {
    const term = (q ?? query).trim()
    if (!term) return
    setSearching(true); setErr(''); setHasSearched(true)
    try {
      const r = await servicesAPI.search(term)
      const items = r.data.data?.items || r.data.data?.services || r.data.data || []
      setResults(Array.isArray(items) ? items : [])
    } catch { setErr('Search failed') } finally { setSearching(false) }
  }

  // Debounced auto-search as user types
  useEffect(() => {
    if (!query.trim()) { setResults([]); setHasSearched(false); return }
    const t = setTimeout(() => search(query), 400)
    return () => clearTimeout(t)
  }, [query])

  const add = async (svc: any) => {
    if (quotationStatus && !EDITABLE_STATUSES.includes(quotationStatus)) {
      setErr(`Cannot add services: quotation is ${quotationStatus}. Only DRAFT, REJECTED, or REVISED quotations can be edited.`)
      return
    }
    setAdding(svc.id); setErr('')
    try {
      let unitPrice: number = svc.base_price || 0
      if (bookingCity) {
        try {
          const cpRes = await servicesAPI.cityPrices(svc.id)
          const cityPrices: any[] = cpRes.data.data || []
          const cityLower = bookingCity.toLowerCase().trim()
          const match = cityPrices.find((cp: any) =>
            cp.is_available &&
            (cp.city_name?.toLowerCase().trim() === cityLower ||
              cp.city_name?.toLowerCase().includes(cityLower) ||
              cityLower.includes(cp.city_name?.toLowerCase().trim() || ''))
          )
          if (match) unitPrice = match.price
        } catch { }
      }
      await quotationsAPI.addService(quotationId, {
        service_id: svc.id,
        quantity: 1,
        unit_price: unitPrice,
        appliance_label: applianceLabel || undefined,
      })
      setAddedNames(n => [...n, svc.name])
      onAdded()
      setQuery(''); setResults([])
    } catch (ex: any) {
      const detail = ex.response?.data?.detail || ''
      setErr(detail || `Failed to add service "${svc.name}" — quotation may not be in editable state (${quotationStatus || 'unknown'})`)
    } finally { setAdding(null) }
  }

  return (
    <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: 12, marginTop: 8 }}>
      {quotationStatus && !EDITABLE_STATUSES.includes(quotationStatus) && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 6, padding: '8px 12px', fontSize: 12, marginBottom: 8 }}>
          ⚠️ Quotation is <b>{quotationStatus}</b> — cannot add services. Status must be DRAFT, REJECTED, or REVISED.
        </div>
      )}
      <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', marginBottom: 8 }}>
        🔍 Add Service — <span style={{ color: '#6366F1' }}>{applianceLabel}</span>
        {bookingCity && <span style={{ color: '#64748B', fontWeight: 400, marginLeft: 6 }}>· 📍{bookingCity} (city price auto-applied)</span>}
      </div>
      {addedNames.length > 0 && (
        <div style={{ fontSize: 11, color: '#059669', background: '#F0FDF4', borderRadius: 4, padding: '4px 8px', marginBottom: 8 }}>
          ✅ Added: {addedNames.join(', ')}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          className="input" style={{ flex: 1, fontSize: 13 }}
          placeholder="Type service name (e.g. AC Gas Refill, Repair) then press Enter…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { search(query) } }}
          autoFocus
        />
        <button className="btn btn-primary btn-sm" onClick={() => search(query)} disabled={searching}>
          {searching ? <Spinner size="sm" /> : 'Search'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>✕ Done</button>
      </div>
      <ErrBox msg={err} />
      {results.length > 0 && (
        <div style={{ border: '1px solid #BFDBFE', borderRadius: 6, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
          {results.map((s: any) => (
            <div key={s.id} style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #DBEAFE', background: '#fff' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#0F172A' }}>{s.name}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>Base: {money(s.base_price)} · {s.category_name || ''}</div>
              </div>
              <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} onClick={() => add(s)} disabled={adding === s.id}>
                {adding === s.id ? <Spinner size="sm" /> : '+ Add'}
              </button>
            </div>
          ))}
        </div>
      )}
      {results.length === 0 && hasSearched && !searching && (
        <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: 8 }}>No services found for "{query}" — check service is active in Services page</div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// AddPartPanel — add spare part: Office Stock or Market Purchase
// ══════════════════════════════════════════════════════════════════════════════
function AddPartPanel({
  quotationId, applianceLabel, bookingCity, hasTechnician, onAdded, onCancel,
}: {
  quotationId: string; applianceLabel: string; bookingCity: string;
  hasTechnician: boolean; onAdded: () => void; onCancel: () => void;
}) {
  const [source, setSource] = useState<'OFFICE_STOCK' | 'MARKET_PURCHASE'>(
    hasTechnician ? 'OFFICE_STOCK' : 'MARKET_PURCHASE'
  )
  // OFFICE STOCK state
  const [stockQuery, setStockQuery] = useState('')
  const [stockResults, setStockResults] = useState<any[]>([])
  const [stockSearching, setStockSearching] = useState(false)
  const [selectedStock, setSelectedStock] = useState<any>(null)
  const [stockQty, setStockQty] = useState(1)
  const [stockSalePrice, setStockSalePrice] = useState(0)

  // MARKET PURCHASE state
  const [mpQuery, setMpQuery] = useState('')
  const [mpResults, setMpResults] = useState<any[]>([])
  const [mpSearching, setMpSearching] = useState(false)
  const [mpForm, setMpForm] = useState({
    part_name: '', quantity: 1, purchase_price: 0, unit_price: 0,
    vendor_name: '', bill_number: '', notes: '', is_new_part: false,
    inventory_item_id: '',
  })
  const setMP = (k: string, v: any) => setMpForm(f => ({ ...f, [k]: v }))

  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')

  // Search office stock
  const searchStock = async () => {
    if (!stockQuery.trim()) return
    setStockSearching(true); setErr('')
    try {
      const r = await inventoryAPI.search(stockQuery.trim())
      const items = r.data.data?.items || r.data.data || []
      setStockResults(items)
      if (items.length === 0) setErr(`No inventory items found for "${stockQuery}"`)
    } catch { setErr('Search failed') } finally { setStockSearching(false) }
  }

  const selectStockItem = (item: any) => {
    setSelectedStock(item)
    setStockSalePrice(item.selling_price || 0)
    setStockResults([])
    setStockQuery('')
    const avail = item.technician_qty ?? item.current_stock ?? 0
    setInfo(`Available stock: ${avail} ${item.unit || 'pcs'} · Cost: ${money(item.cost_price)} · Sale: ${money(item.selling_price)}`)
  }

  // Search for existing parts in market purchase mode
  const searchMP = async () => {
    if (!mpQuery.trim()) return
    setMpSearching(true); setErr('')
    try {
      const r = await inventoryAPI.search(mpQuery.trim())
      const items = r.data.data?.items || r.data.data || []
      setMpResults(items)
    } catch { setErr('Search failed') } finally { setMpSearching(false) }
  }

  const selectMpItem = (item: any) => {
    setMpForm(f => ({
      ...f,
      part_name: item.name,
      purchase_price: item.cost_price || 0,
      unit_price: item.selling_price || 0,
      inventory_item_id: item.id,
      is_new_part: false,
    }))
    setMpResults([])
    setMpQuery('')
    setInfo(`Existing part: ${item.name} · Catalogue cost: ${money(item.cost_price)} · Sale: ${money(item.selling_price)} · You can override prices below`)
  }

  const addOfficeStock = async () => {
    if (!selectedStock) { setErr('Select an item first'); return }
    if (stockQty < 1) { setErr('Quantity must be at least 1'); return }
    setSaving(true); setErr('')
    try {
      await quotationsAPI.addPart(quotationId, {
        part_name: selectedStock.name,
        part_source: 'OFFICE_STOCK',
        quantity: stockQty,
        unit_price: stockSalePrice,
        purchase_price: selectedStock.cost_price || 0,
        appliance_label: applianceLabel,
        inventory_item_id: selectedStock.id,
        is_new_part: false,
        notes: `SKU: ${selectedStock.sku || ''}`,
      })
      onAdded()
      setSelectedStock(null); setStockQty(1); setInfo(''); setErr('')
    } catch (ex: any) {
      setErr(ex.response?.data?.detail || 'Failed to add part')
    } finally { setSaving(false) }
  }

  const addMarketPurchase = async () => {
    if (!mpForm.part_name.trim()) { setErr('Part name required'); return }
    if (!mpForm.unit_price) { setErr('Sale price required'); return }
    setSaving(true); setErr('')
    try {
      const res = await quotationsAPI.addPart(quotationId, {
        part_name: mpForm.part_name.trim(),
        part_source: 'MARKET_PURCHASE',
        quantity: mpForm.quantity,
        unit_price: mpForm.unit_price,
        purchase_price: mpForm.purchase_price,
        vendor_name: mpForm.vendor_name || undefined,
        bill_number: mpForm.bill_number || undefined,
        notes: mpForm.notes || undefined,
        appliance_label: applianceLabel,
        inventory_item_id: mpForm.inventory_item_id || undefined,
        is_new_part: mpForm.is_new_part,
      })
      if (res.data?.data?.is_pending_verify === 1) {
        setInfo('✅ Part added + submitted to admin for catalogue verification')
      }
      onAdded()
      setMpForm({ part_name: '', quantity: 1, purchase_price: 0, unit_price: 0, vendor_name: '', bill_number: '', notes: '', is_new_part: false, inventory_item_id: '' })
      setInfo('')
    } catch (ex: any) {
      setErr(ex.response?.data?.detail || 'Failed to add part')
    } finally { setSaving(false) }
  }

  const mpTotal = mpForm.unit_price * mpForm.quantity
  const stockTotal = stockSalePrice * stockQty

  return (
    <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: 14, marginTop: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 10 }}>
        🔩 Add Spare Part — <span style={{ color: '#6366F1' }}>{applianceLabel}</span>
      </div>

      {/* Source tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[
          { val: 'OFFICE_STOCK', label: '🏭 Office Stock', hint: 'From assigned inventory' },
          { val: 'MARKET_PURCHASE', label: '🛒 Market Purchase', hint: 'Bought from market' },
        ].map(t => (
          <button
            key={t.val}
            onClick={() => { setSource(t.val as any); setErr(''); setInfo(''); setSelectedStock(null) }}
            style={{
              padding: '6px 14px', borderRadius: 6, border: '2px solid', cursor: 'pointer', fontSize: 12, fontWeight: 700,
              borderColor: source === t.val ? '#F59E0B' : '#E2E8F0',
              background: source === t.val ? '#FEF3C7' : '#F8FAFC',
              color: source === t.val ? '#92400E' : '#64748B',
            }}
          >
            {t.label}
            <div style={{ fontSize: 9, fontWeight: 400, color: '#94A3B8' }}>{t.hint}</div>
          </button>
        ))}
        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto', alignSelf: 'flex-start' }} onClick={onCancel}>✕ Done</button>
      </div>

      <ErrBox msg={err} />
      <InfoBox msg={info} />

      {/* ── OFFICE STOCK ── */}
      {source === 'OFFICE_STOCK' && (
        <>
          {!hasTechnician && (
            <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#92400E', marginBottom: 10 }}>
              ⚠️ No technician assigned to this booking. Office stock will be deducted from warehouse.
            </div>
          )}
          {!selectedStock ? (
            <>
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>
                Search the spare parts catalogue to find a part to use from technician's assigned stock:
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  className="input" style={{ flex: 1 }}
                  placeholder="Part name, SKU (e.g. Capacitor, AC Filter)…"
                  value={stockQuery}
                  onChange={e => setStockQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchStock()}
                  autoFocus
                />
                <button className="btn btn-primary btn-sm" onClick={searchStock} disabled={stockSearching}>
                  {stockSearching ? <Spinner size="sm" /> : '🔍 Search'}
                </button>
              </div>
              {stockResults.length > 0 && (
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 6, overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
                  {stockResults.map((item: any) => (
                    <div key={item.id}
                      style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9', background: '#fff' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#EFF6FF')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                      onClick={() => selectStockItem(item)}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{item.name}</div>
                      <div style={{ fontSize: 11, color: '#94A3B8' }}>
                        SKU: {item.sku || '—'} · Stock: {item.current_stock ?? '?'} {item.unit || 'pcs'}
                        · Cost: {money(item.cost_price)} · Sale: {money(item.selling_price)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {stockResults.length === 0 && stockQuery && !stockSearching && (
                <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: 12 }}>
                  No items found. Try switching to <b>Market Purchase</b> for unlisted parts.
                </div>
              )}
            </>
          ) : (
            <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>✅ {selectedStock.name}</div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>SKU: {selectedStock.sku || '—'} · {selectedStock.unit || 'pcs'}</div>
                </div>
                <button className="btn btn-secondary btn-sm" style={{ fontSize: 10 }} onClick={() => { setSelectedStock(null); setInfo('') }}>
                  Change
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ ...lbl, fontSize: 11 }}>Quantity</label>
                  <input className="input" type="number" min={1} value={stockQty}
                    onChange={e => setStockQty(parseInt(e.target.value) || 1)} />
                </div>
                <div>
                  <label style={{ ...lbl, fontSize: 11 }}>Sale Price to Customer (₹)</label>
                  <input className="input" type="number" min={0} step={0.01} value={stockSalePrice}
                    onChange={e => setStockSalePrice(parseFloat(e.target.value) || 0)} />
                  {stockTotal > 0 && <div style={{ fontSize: 11, color: '#059669', marginTop: 2 }}>Total: {money(stockTotal)}</div>}
                </div>
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: '#64748B' }}>
                💡 Cost: {money(selectedStock.cost_price)} · Margin: {money(stockSalePrice - (selectedStock.cost_price || 0))} per unit
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={addOfficeStock} disabled={saving}>
                  {saving ? <Spinner size="sm" /> : `+ Add ${stockQty} × ${selectedStock.name}`}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── MARKET PURCHASE ── */}
      {source === 'MARKET_PURCHASE' && (
        <>
          {/* Search existing catalogue first */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ ...lbl, fontSize: 11 }}>Search Existing Parts (optional — to get catalogue prices)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input" style={{ flex: 1 }}
                placeholder="Search part name to check if already in catalogue…"
                value={mpQuery}
                onChange={e => setMpQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchMP()}
              />
              <button className="btn btn-secondary btn-sm" onClick={searchMP} disabled={mpSearching}>
                {mpSearching ? <Spinner size="sm" /> : '🔍'}
              </button>
            </div>
            {mpResults.length > 0 && (
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 6, marginTop: 6, overflow: 'hidden', maxHeight: 180, overflowY: 'auto' }}>
                {mpResults.map((item: any) => (
                  <div key={item.id}
                    style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9', background: '#fff', fontSize: 12 }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F0FDF4')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                    onClick={() => selectMpItem(item)}
                  >
                    <b>{item.name}</b> · Cost: {money(item.cost_price)} · Sale: {money(item.selling_price)}
                    <span style={{ color: '#94A3B8', marginLeft: 8 }}>SKU: {item.sku || '—'}</span>
                  </div>
                ))}
              </div>
            )}
            {mpResults.length === 0 && mpQuery && !mpSearching && (
              <div style={{ fontSize: 11, color: '#94A3B8', padding: '4px 0' }}>
                Not found in catalogue — fill in details below and check <b>"Submit as new part"</b>
              </div>
            )}
          </div>

          {/* Part details form */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ ...lbl, fontSize: 11 }}>Part Name *</label>
              <input className="input" placeholder="e.g. Capacitor 35+5 MFD, AC Gas R22…"
                value={mpForm.part_name} onChange={e => setMP('part_name', e.target.value)} autoFocus={!mpForm.part_name} />
            </div>
            <div>
              <label style={{ ...lbl, fontSize: 11 }}>Quantity</label>
              <input className="input" type="number" min={1} value={mpForm.quantity} onChange={e => setMP('quantity', parseInt(e.target.value) || 1)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ ...lbl, fontSize: 11 }}>Purchase Price (₹) — cost</label>
              <input className="input" type="number" min={0} step={0.01} value={mpForm.purchase_price}
                onChange={e => setMP('purchase_price', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label style={{ ...lbl, fontSize: 11 }}>Sale Price to Customer (₹) *</label>
              <input className="input" type="number" min={0} step={0.01} value={mpForm.unit_price}
                onChange={e => setMP('unit_price', parseFloat(e.target.value) || 0)} />
              {mpTotal > 0 && (
                <div style={{ fontSize: 11, marginTop: 2 }}>
                  <span style={{ color: '#059669' }}>Total: {money(mpTotal)}</span>
                  {mpForm.purchase_price > 0 && (
                    <span style={{ color: '#64748B', marginLeft: 8 }}>Margin: {money((mpForm.unit_price - mpForm.purchase_price) * mpForm.quantity)}</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ ...lbl, fontSize: 11 }}>Vendor / Shop Name</label>
              <input className="input" placeholder="Where purchased from" value={mpForm.vendor_name} onChange={e => setMP('vendor_name', e.target.value)} />
            </div>
            <div>
              <label style={{ ...lbl, fontSize: 11 }}>Bill / Receipt No.</label>
              <input className="input" placeholder="Invoice or receipt number" value={mpForm.bill_number} onChange={e => setMP('bill_number', e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ ...lbl, fontSize: 11 }}>Notes</label>
            <input className="input" value={mpForm.notes} onChange={e => setMP('notes', e.target.value)} placeholder="Additional notes" />
          </div>

          {/* New part submission */}
          {!mpForm.inventory_item_id && mpForm.part_name.trim() && (
            <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 6, padding: '8px 12px', marginBottom: 10 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                <input type="checkbox" checked={mpForm.is_new_part} onChange={e => setMP('is_new_part', e.target.checked)}
                  style={{ marginTop: 2 }} />
                <span>
                  <b style={{ color: '#7C3AED' }}>Submit as new catalogue part</b> — adds "{mpForm.part_name}" to inventory as
                  <em> pending admin verification</em>. Usable in quotations immediately; admin reviews before making active.
                </span>
              </label>
            </div>
          )}
          {mpForm.inventory_item_id && (
            <div style={{ fontSize: 11, color: '#059669', background: '#F0FDF4', padding: '4px 8px', borderRadius: 4, marginBottom: 10 }}>
              ✅ Linked to existing catalogue item — prices updated above
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={addMarketPurchase} disabled={saving}>
              {saving ? <Spinner size="sm" /> : '+ Add Part'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ApplianceCard — one machine card with its services + parts
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// CustomerAppliancePicker — pick from customer's existing appliances
// ══════════════════════════════════════════════════════════════════════════════
function CustomerAppliancePicker({
  customerId, quotationId, existingLabels, onPicked, onManual, onCancel,
}: {
  customerId: string; quotationId: string; existingLabels: string[];
  onPicked: (appliance: any, repeatInfo: any) => void;
  onManual: (label: string) => void;
  onCancel: () => void;
}) {
  // Make customerId available in addManual closure via ref — already passed as prop
  const [appliances, setAppliances] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState<string | null>(null)
  const [manualLabel, setManualLabel] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    appliancesAPI.byCustomer(customerId)
      .then(r => {
        const items = r.data.data || []
        setAppliances(Array.isArray(items) ? items : [])
      })
      .catch(() => setAppliances([]))
      .finally(() => setLoading(false))
  }, [customerId])

  const pickAppliance = async (appliance: any) => {
    const label = [appliance.brand_name, appliance.model, appliance.category]
      .filter(Boolean).join(' ').trim() || appliance.id.slice(0, 8)

    if (existingLabels.includes(label)) {
      setErr(`"${label}" is already added to this quotation`)
      return
    }

    setAdding(appliance.id); setErr('')
    try {
      const res = await quotationsAPI.addAppliance(quotationId, {
        appliance_id: appliance.id,
        appliance_label: label,
      })
      const data = res.data.data
      onPicked({ ...appliance, appliance_label: label }, data.repeat_booking || null)
    } catch (ex: any) {
      setErr(ex.response?.data?.detail || 'Failed to add appliance')
    } finally { setAdding(null) }
  }

  const [saveAsAppliance, setSaveAsAppliance] = useState(false)
  const [manualBrand, setManualBrand] = useState('')
  const [manualModel, setManualModel] = useState('')
  const [manualCategory, setManualCategory] = useState('')

  const addManual = async () => {
    const label = manualLabel.trim()
    if (!label) return
    if (existingLabels.includes(label)) {
      setErr(`"${label}" is already added to this quotation`)
      return
    }
    setAdding('manual'); setErr('')
    try {
      // Optionally register as customer appliance first to get an appliance_id
      let applianceId: string | null = null
      if (saveAsAppliance && customerId) {
        try {
          const appRes = await appliancesAPI.add({
            customer_id: customerId,
            model: manualModel.trim() || label,
            category: manualCategory.trim() || undefined,
            notes: `Registered during quotation`,
            status: 'ACTIVE',
          })
          applianceId = appRes.data.data?.id || null
        } catch { /* non-fatal */ }
      }
      await quotationsAPI.addAppliance(quotationId, {
        appliance_id: applianceId,
        appliance_label: label,
      })
      onManual(label)
    } catch (ex: any) {
      setErr(ex.response?.data?.detail || 'Failed to add appliance')
    } finally { setAdding(null) }
  }

  return (
    <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: '#166534' }}>🔧 Add Appliance / Machine</div>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>✕ Cancel</button>
      </div>
      {err && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '7px 12px', borderRadius: 6, fontSize: 12, marginBottom: 8 }}>⚠ {err}</div>}

      {loading ? (
        <div style={{ padding: 16, textAlign: 'center' }}><Spinner /></div>
      ) : (
        <>
          {appliances.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 6 }}>
                Customer's Registered Appliances
              </div>
              <div style={{ border: '1px solid #D1FAE5', borderRadius: 8, overflow: 'hidden' }}>
                {appliances
                  .filter((a: any) => {
                    const label = [a.brand_name, a.model, a.category].filter(Boolean).join(' ').trim() || a.id.slice(0, 8)
                    return !existingLabels.includes(label)
                  })
                  .map((a: any) => {
                    const label = [a.brand_name, a.model, a.category].filter(Boolean).join(' ').trim() || a.id.slice(0, 8)
                    return (
                      <div key={a.id} style={{
                        padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        borderBottom: '1px solid #D1FAE5', background: '#fff',
                      }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#0F172A' }}>🔩 {label}</div>
                          <div style={{ fontSize: 11, color: '#64748B' }}>
                            {a.category && <span>Category: {a.category} · </span>}
                            {a.serial_number && <span>S/N: {a.serial_number} · </span>}
                            <span style={{
                              background: a.status === 'ACTIVE' ? '#DCFCE7' : '#FEF3C7',
                              color: a.status === 'ACTIVE' ? '#166534' : '#92400E',
                              borderRadius: 4, padding: '1px 5px', fontSize: 10,
                            }}>{a.status}</span>
                          </div>
                        </div>
                        <button
                          className="btn btn-primary btn-sm" style={{ fontSize: 11 }}
                          onClick={() => pickAppliance(a)}
                          disabled={adding === a.id}
                        >
                          {adding === a.id ? <Spinner size="sm" /> : '+ Add'}
                        </button>
                      </div>
                    )
                  })}
                {appliances.filter((a: any) => {
                  const label = [a.brand_name, a.model, a.category].filter(Boolean).join(' ').trim() || a.id.slice(0, 8)
                  return !existingLabels.includes(label)
                }).length === 0 && (
                  <div style={{ padding: '12px 14px', fontSize: 12, color: '#64748B', textAlign: 'center' }}>
                    All registered appliances already added to this quotation.
                  </div>
                )}
              </div>
            </div>
          )}

          {appliances.length === 0 && (
            <div style={{ fontSize: 12, color: '#64748B', background: '#FFF', border: '1px solid #E2E8F0', borderRadius: 6, padding: '10px 12px', marginBottom: 10 }}>
              No registered appliances found for this customer.
            </div>
          )}

          {/* Manual entry */}
          <div style={{ borderTop: appliances.length > 0 ? '1px dashed #86EFAC' : 'none', paddingTop: appliances.length > 0 ? 10 : 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 6 }}>
              Or Enter Machine Name Manually
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                className="input" style={{ flex: 1, fontSize: 13 }}
                placeholder="e.g. LG 1.5T Split AC, Samsung 7kg Washing Machine…"
                value={manualLabel}
                onChange={e => setManualLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addManual()}
                autoFocus={appliances.length === 0}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={addManual}
                disabled={!manualLabel.trim() || adding === 'manual'}
              >
                {adding === 'manual' ? <Spinner size="sm" /> : 'Add →'}
              </button>
            </div>
            {/* Save as customer appliance */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12, color: '#475569', marginBottom: saveAsAppliance ? 8 : 0 }}>
              <input type="checkbox" checked={saveAsAppliance} onChange={e => setSaveAsAppliance(e.target.checked)} style={{ marginTop: 2 }} />
              <span>
                <b style={{ color: '#059669' }}>💾 Save as customer appliance</b> — registers this machine against the customer for future tracking &amp; repeat complaint detection
              </span>
            </label>
            {saveAsAppliance && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '8px 10px', background: '#F0FDF4', borderRadius: 8, border: '1px solid #86EFAC' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 3 }}>Brand</div>
                  <input className="input" style={{ fontSize: 12 }} placeholder="e.g. LG, Samsung…" value={manualBrand} onChange={e => setManualBrand(e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 3 }}>Model</div>
                  <input className="input" style={{ fontSize: 12 }} placeholder="e.g. 1.5T 5 Star…" value={manualModel} onChange={e => setManualModel(e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 3 }}>Category</div>
                  <input className="input" style={{ fontSize: 12 }} placeholder="e.g. AC, Fridge…" value={manualCategory} onChange={e => setManualCategory(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// RepeatComplaintBanner — shows repeat complaint warning for an appliance
// ══════════════════════════════════════════════════════════════════════════════
function RepeatComplaintBanner({
  applianceLabel, quotationId, repeatBooking, isRepeat, onToggle,
}: {
  applianceLabel: string; quotationId: string; repeatBooking: any;
  isRepeat: boolean; onToggle: (isRepeat: boolean) => void;
}) {
  const [marking, setMarking] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  const toggle = async () => {
    setMarking(true)
    try {
      await quotationsAPI.markRepeat(quotationId, {
        appliance_label: applianceLabel,
        is_repeat: !isRepeat,
        repeat_booking_id: repeatBooking?.booking_id || null,
      })
      onToggle(!isRepeat)
    } catch { } finally { setMarking(false) }
  }

  if (!repeatBooking && !isRepeat) return null

  return (
    <div style={{
      margin: '8px 14px',
      background: isRepeat ? '#FEF2F2' : '#FFFBEB',
      border: `1.5px solid ${isRepeat ? '#FECACA' : '#FDE68A'}`,
      borderRadius: 8, padding: '10px 12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: isRepeat ? '#DC2626' : '#92400E' }}>
            {isRepeat ? '🔴 MARKED AS REPEAT COMPLAINT' : '⚠️ Possible Repeat Complaint Detected'}
          </div>
          {repeatBooking && (
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>
              Previous completed repair: <b>{repeatBooking.booking_number}</b>
              {repeatBooking.scheduled_date && <> on {new Date(repeatBooking.scheduled_date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })}</>}
              {repeatBooking.service_name && <> · {repeatBooking.service_name}</>}
            </div>
          )}
          {isRepeat && (
            <div style={{ fontSize: 11, color: '#DC2626', marginTop: 3 }}>
              All services & parts for this appliance are excluded from invoice total.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {repeatBooking && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 10, background: '#FEF9C3', color: '#713F12', border: '1px solid #FDE68A' }}
              onClick={() => setShowDetails(v => !v)}
            >
              {showDetails ? 'Hide' : '👁 View'} Details
            </button>
          )}
          <button
            className="btn btn-sm"
            style={{
              fontSize: 10, fontWeight: 700,
              background: isRepeat ? '#DCFCE7' : '#FEE2E2',
              color: isRepeat ? '#166534' : '#DC2626',
              border: `1px solid ${isRepeat ? '#86EFAC' : '#FECACA'}`,
            }}
            onClick={toggle}
            disabled={marking}
          >
            {marking ? <Spinner size="sm" /> : isRepeat ? '✓ Unmark Repeat' : '🔴 Mark as Repeat'}
          </button>
        </div>
      </div>

      {showDetails && repeatBooking && (
        <div style={{ marginTop: 10, background: '#fff', borderRadius: 6, padding: '10px 12px', border: '1px solid #FDE68A' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 6 }}>Previous Repair Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
            <div><span style={{ color: '#94A3B8' }}>Booking:</span> <b>{repeatBooking.booking_number}</b></div>
            <div><span style={{ color: '#94A3B8' }}>Technician:</span> {repeatBooking.technician_name || '—'}</div>
            {repeatBooking.work_done && (
              <div style={{ gridColumn: '1/-1' }}>
                <span style={{ color: '#94A3B8' }}>Work Done:</span> {repeatBooking.work_done}
              </div>
            )}
            {repeatBooking.issue_reported && (
              <div style={{ gridColumn: '1/-1' }}>
                <span style={{ color: '#94A3B8' }}>Issue Reported:</span> {repeatBooking.issue_reported}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ApplianceCard — one machine card with its services + parts
// ══════════════════════════════════════════════════════════════════════════════
function ApplianceCard({
  label, services, parts, canEdit, quotationId, quotationStatus, bookingCity, hasTechnician,
  repeatBooking, isRepeat, onReload, onRemove, onRepeatToggle,
}: {
  label: string; services: any[]; parts: any[]; canEdit: boolean;
  quotationId: string; quotationStatus: string; bookingCity: string; hasTechnician: boolean;
  repeatBooking: any; isRepeat: boolean;
  onReload: () => void; onRemove: (label: string) => void; onRepeatToggle: (label: string, isRepeat: boolean) => void;
}) {
  const [openPanel, setOpenPanel] = useState<'service' | 'part' | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [removingAppliance, setRemovingAppliance] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const removeService = async (id: string) => {
    setRemoving(id)
    try { await quotationsAPI.deleteService(quotationId, id); onReload() } catch { }
    finally { setRemoving(null) }
  }
  const removePart = async (id: string) => {
    setRemoving(id)
    try { await quotationsAPI.deletePart(quotationId, id); onReload() } catch { }
    finally { setRemoving(null) }
  }
  const removeAppliance = async () => {
    setRemovingAppliance(true)
    try {
      await quotationsAPI.removeAppliance(quotationId, label)
      onRemove(label)
    } catch { } finally { setRemovingAppliance(false); setConfirmRemove(false) }
  }

  return (
    <div style={{
      border: `1.5px solid ${isRepeat ? '#FECACA' : '#E2E8F0'}`,
      borderRadius: 10, marginBottom: 12, overflow: 'visible',
      background: isRepeat ? '#FFF5F5' : '#fff',
    }}>
      {/* Appliance header */}
      <div style={{
        background: isRepeat
          ? 'linear-gradient(90deg,#FFF1F2,#FFE4E6)'
          : 'linear-gradient(90deg,#F8FAFC,#EFF6FF)',
        borderBottom: '1px solid #E2E8F0', padding: '10px 14px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{isRepeat ? '🔴' : '🔧'}</span>
          {label}
          <span style={{ fontWeight: 400, fontSize: 11, color: '#94A3B8' }}>
            {services.length} service{services.length !== 1 ? 's' : ''} · {parts.length} part{parts.length !== 1 ? 's' : ''}
          </span>
          {isRepeat && (
            <span style={{ fontSize: 10, background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>
              REPEAT COMPLAINT — ₹0 Invoice
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {canEdit && (
            <>
              <button
                className="btn btn-secondary btn-sm"
                style={{ fontSize: 10, background: openPanel === 'service' ? '#DBEAFE' : '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}
                onClick={() => setOpenPanel(p => p === 'service' ? null : 'service')}
              >
                + Service
              </button>
              <button
                className="btn btn-secondary btn-sm"
                style={{ fontSize: 10, background: openPanel === 'part' ? '#FEF3C7' : '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}
                onClick={() => setOpenPanel(p => p === 'part' ? null : 'part')}
              >
                + Part
              </button>
              {/* Remove appliance button */}
              {confirmRemove ? (
                <>
                  <button
                    className="btn btn-danger btn-sm" style={{ fontSize: 10 }}
                    onClick={removeAppliance} disabled={removingAppliance}
                  >
                    {removingAppliance ? <Spinner size="sm" /> : '✓ Confirm Remove'}
                  </button>
                  <button className="btn btn-secondary btn-sm" style={{ fontSize: 10 }} onClick={() => setConfirmRemove(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: 10, color: '#EF4444', border: '1px solid #FECACA', background: '#FFF5F5' }}
                  onClick={() => setConfirmRemove(true)}
                  title="Remove this appliance and all its services/parts from quotation"
                >
                  🗑 Remove
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Repeat complaint banner */}
      <RepeatComplaintBanner
        applianceLabel={label}
        quotationId={quotationId}
        repeatBooking={repeatBooking}
        isRepeat={isRepeat}
        onToggle={(newIsRepeat) => onRepeatToggle(label, newIsRepeat)}
      />

      {/* Services table */}
      {services.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#FAFAFA' }}>
              <th style={{ padding: '5px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Service</th>
              <th style={{ padding: '5px 8px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#64748B', width: 50 }}>Qty</th>
              <th style={{ padding: '5px 8px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#64748B', width: 100 }}>Unit</th>
              <th style={{ padding: '5px 8px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#64748B', width: 100 }}>Total</th>
              {canEdit && <th style={{ width: 30 }} />}
            </tr>
          </thead>
          <tbody>
            {services.map((s: any) => (
              <tr key={s.id} style={{ borderTop: '1px solid #F1F5F9', opacity: isRepeat ? 0.6 : 1 }}>
                <td style={{ padding: '8px 14px', color: '#0F172A' }}>
                  {s.display_name}
                  {isRepeat && <span style={{ marginLeft: 6, fontSize: 10, color: '#EF4444' }}>₹0</span>}
                </td>
                <td style={{ padding: '8px', textAlign: 'center', color: '#64748B' }}>{s.quantity}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#64748B' }}>{money(s.unit_price)}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, textDecoration: isRepeat ? 'line-through' : 'none', color: isRepeat ? '#94A3B8' : '#0F172A' }}>
                  {money(s.total_price)}
                </td>
                {canEdit && (
                  <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                    {removing === s.id ? <Spinner size="sm" /> :
                      <button onClick={() => removeService(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 14 }}>✕</button>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Parts */}
      {parts.map((p: any) => (
        <div key={p.id} style={{ padding: '8px 14px', borderTop: '1px solid #FEF3C7', background: '#FFFBEB', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: 12, opacity: isRepeat ? 0.6 : 1 }}>
          <div>
            <div style={{ fontWeight: 700, color: '#0F172A' }}>
              🔩 {p.part_name}
              {p.is_pending_verify === 1 && (
                <span style={{ marginLeft: 6, fontSize: 10, background: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE', borderRadius: 4, padding: '1px 5px' }}>
                  Pending Verify
                </span>
              )}
              {isRepeat && <span style={{ marginLeft: 6, fontSize: 10, color: '#EF4444' }}>₹0</span>}
            </div>
            <div style={{ color: '#64748B', marginTop: 2 }}>
              {p.part_source?.replace('_', ' ')} · Qty: {p.quantity}
              {p.purchase_price > 0 && <span style={{ color: '#94A3B8', marginLeft: 6 }}>Cost: {money(p.purchase_price)}</span>}
              {p.vendor_name && <span style={{ marginLeft: 6 }}>· {p.vendor_name}</span>}
              {p.bill_number && <span style={{ marginLeft: 6 }}>· Bill: {p.bill_number}</span>}
            </div>
            {p.notes && <div style={{ color: '#94A3B8', marginTop: 1 }}>📝 {p.notes}</div>}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
            <div>
              <div style={{ fontWeight: 700, textAlign: 'right', textDecoration: isRepeat ? 'line-through' : 'none', color: isRepeat ? '#94A3B8' : '#0F172A' }}>
                {money(p.total_price)}
              </div>
              {p.purchase_price > 0 && !isRepeat && (
                <div style={{ fontSize: 10, color: '#059669', textAlign: 'right' }}>
                  Margin: {money((p.unit_price - p.purchase_price) * p.quantity)}
                </div>
              )}
            </div>
            {canEdit && (
              removing === p.id ? <Spinner size="sm" /> :
                <button onClick={() => removePart(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 14 }}>✕</button>
            )}
          </div>
        </div>
      ))}

      {services.length === 0 && parts.length === 0 && !openPanel && (
        <div style={{ padding: '12px 14px', fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>
          No items yet. Click <b>+ Service</b> or <b>+ Part</b> above.
        </div>
      )}

      {/* Inline panels */}
      {openPanel && (
        <div style={{ padding: '0 14px 14px' }}>
          {openPanel === 'service'
            ? <ServiceSearchPanel
                quotationId={quotationId} quotationStatus={quotationStatus} bookingCity={bookingCity}
                applianceLabel={label}
                onAdded={() => { onReload(); }}
                onCancel={() => setOpenPanel(null)}
              />
            : <AddPartPanel
                quotationId={quotationId} applianceLabel={label}
                bookingCity={bookingCity} hasTechnician={hasTechnician}
                onAdded={() => { onReload(); }}
                onCancel={() => setOpenPanel(null)}
              />
          }
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// QuotationEditor — the main modal
// ══════════════════════════════════════════════════════════════════════════════
export function QuotationEditor({
  initQuotation, initBooking, onClose, onRefresh, userRole,
}: {
  initQuotation: any; initBooking?: any; onClose: () => void; onRefresh: () => void; userRole: string;
}) {
  const [q, setQ] = useState<any>(initQuotation)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({ labour_charges: 0, service_charges: 0, tax_percent: 18, remarks: '', discount_amount: 0, adjustment_amount: 0, tax_mode: 'B2C', customer_gst_number: '', customer_gst_name: '', customer_gst_address: '' })
  const setEF = (k: string, v: any) => setEditForm(f => ({ ...f, [k]: v }))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [rejectNote, setRejectNote] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [bookingDetail, setBookingDetail] = useState<any>(initBooking || null)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<any>(null)
  // NOTE: coupons are applied by the customer at booking time only. Admin/CCO/
  // technician have no UI to apply, change, or remove a coupon — see the
  // read-only coupon display below.

  // Appliance management
  const [showAddAppliance, setShowAddAppliance] = useState(false)
  const [quotationAppliances, setQuotationAppliances] = useState<any[]>([])  // from /appliances endpoint
  const [repeatMap, setRepeatMap] = useState<Record<string, { isRepeat: boolean; repeatBooking: any }>>({})

  const isAdminCCO = ['ADMIN', 'SUPER_ADMIN', 'CCO'].includes(userRole)
  const isTech = userRole === 'TECHNICIAN'
  const canEdit = EDITABLE_STATUSES.includes(q?.status) &&
    (!isTech || !['APPROVED', 'CONVERTED_TO_INVOICE'].includes(q?.status))

  const hasTechnician = !!(bookingDetail?.technician_id || bookingDetail?.technician_name)

  // Load appliance metadata from the dedicated endpoint
  const loadApplianceMeta = useCallback(async () => {
    try {
      const r = await quotationsAPI.listAppliances(q.id)
      const items: any[] = r.data.data || []
      setQuotationAppliances(items)
      const map: Record<string, { isRepeat: boolean; repeatBooking: any }> = {}
      for (const item of items) {
        map[item.appliance_label] = {
          isRepeat: !!item.is_repeat_complaint,
          repeatBooking: item.repeat_booking_id ? {
            booking_id: item.repeat_booking_id,
            booking_number: item.prev_booking_number || '',
            scheduled_date: item.prev_date || '',
            service_name: item.prev_service || '',
            technician_name: item.prev_technician || '',
            work_done: item.prev_work_done || '',
            issue_reported: item.prev_issue || '',
          } : null,
        }
      }
      setRepeatMap(map)
    } catch { }
  }, [q?.id])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const r = await quotationsAPI.get(q.id)
      const data = r.data.data
      setQ(data)
      setEditForm({
        labour_charges: data.labour_charges || 0,
        service_charges: data.service_charges || 0,
        tax_percent: data.tax_percent || 18,
        remarks: data.remarks || '',
        discount_amount: data.discount_amount || 0,
        adjustment_amount: data.adjustment_amount || 0,
        tax_mode: data.tax_mode || 'B2C',
        customer_gst_number: data.customer_gst_number || '',
        customer_gst_name: data.customer_gst_name || '',
        customer_gst_address: data.customer_gst_address || '',
      })
    } catch { } finally { setLoading(false) }
    await loadApplianceMeta()
  }, [q?.id, loadApplianceMeta])

  useEffect(() => {
    reload()
    if (!initBooking && initQuotation?.booking_id) {
      bookingsAPI.get(initQuotation.booking_id)
        .then(r => setBookingDetail(r.data.data))
        .catch(() => { })
    }
  }, [])

  // ── Real-time sync: admin <-> technician ──────────────────────────────────
  // Subscribes to /ws/booking/{booking_id}. When the technician (or another
  // admin tab) creates/edits this quotation, QUOTATION_* events arrive here
  // and we silently reload so both sides always see the latest state.
  const currentUserId = useAuthStore(s => s.user?.id)
  const { lastEvent: quotationWsEvent } = useBookingWebSocket(q?.booking_id || initQuotation?.booking_id || null)
  useEffect(() => {
    if (!quotationWsEvent) return
    const isQuotationEvent = ['QUOTATION_CREATED', 'QUOTATION_UPDATED', 'QUOTATION_DELETED'].includes(quotationWsEvent.type)
    if (!isQuotationEvent) return
    // Skip the reload that would just be echoing our own just-made change —
    // avoids a redundant flicker right after we save.
    const actorId = quotationWsEvent.payload?.actor_user_id
    if (actorId && currentUserId && actorId === currentUserId) return
    // Only react to events for the quotation we currently have open
    // (the booking room also carries events for sibling quotations/revisions).
    if (quotationWsEvent.payload?.id && q?.id && quotationWsEvent.payload.id !== q.id) return
    reload()
  }, [quotationWsEvent])

  // Parse groups from services/parts
  const services: any[] = q?.services || []
  const parts: any[] = q?.parts || []
  const applianceGroups = new Map<string, { services: any[]; parts: any[] }>()
  const ensureGroup = (label: string) => {
    if (!applianceGroups.has(label)) applianceGroups.set(label, { services: [], parts: [] })
    return applianceGroups.get(label)!
  }
  services.forEach((s: any) => {
    const name: string = s.service_name || ''
    if (name.includes(' :: ')) {
      const idx = name.indexOf(' :: ')
      ensureGroup(name.substring(0, idx)).services.push({ ...s, display_name: name.substring(idx + 4) })
    } else {
      ensureGroup('General').services.push({ ...s, display_name: name })
    }
  })
  parts.forEach((p: any) => ensureGroup(p.appliance_label || 'General').parts.push(p))

  // Merge: quotationAppliances (from DB) drives the display list — ensures appliances with no items yet appear
  const applianceLabelsFromDB = quotationAppliances.map(a => a.appliance_label)
  // Add any service/part groups not yet tracked in quotation_appliances
  const allGroupLabels = new Set([...applianceLabelsFromDB, ...Array.from(applianceGroups.keys())])

  const displayGroups: [string, { services: any[]; parts: any[] }][] = Array.from(allGroupLabels).map(label => [
    label, applianceGroups.get(label) || { services: [], parts: [] }
  ])

  // If no groups at all and quotation is editable, auto-show the add appliance picker
  const showEmptyPrompt = displayGroups.length === 0 && canEdit

  const existingLabels = displayGroups.map(([l]) => l)

  const saveEdit = async () => {
    setSaving(true); setErr('')
    try {
      const updatePayload: any = {
        labour_charges: editForm.labour_charges,
        service_charges: editForm.service_charges,
        tax_percent: editForm.tax_mode === 'NONE' ? 0 : editForm.tax_percent,
        remarks: editForm.remarks || undefined,
        tax_mode: editForm.tax_mode,
      }
      if (editForm.tax_mode === 'B2B') {
        updatePayload.customer_gst_number  = editForm.customer_gst_number || undefined
        updatePayload.customer_gst_name    = editForm.customer_gst_name || undefined
        updatePayload.customer_gst_address = editForm.customer_gst_address || undefined
      }
      await quotationsAPI.update(q.id, updatePayload)
      await quotationsAPI.discount(q.id, { amount: editForm.discount_amount })
      await quotationsAPI.adjustment(q.id, { amount: editForm.adjustment_amount })
      setEditMode(false)
      await reload(); onRefresh()
    } catch (ex: any) { setErr(ex.response?.data?.detail || 'Save failed') } finally { setSaving(false) }
  }

  const doSubmit = async () => {
    if (services.length === 0) { setErr('Add at least one service before submitting'); return }
    setSaving(true); setErr('')
    try { await quotationsAPI.submit(q.id); await reload(); onRefresh() }
    catch (ex: any) { setErr(ex.response?.data?.detail || 'Submit failed') } finally { setSaving(false) }
  }

  const doApprove = async () => {
    setSaving(true); setErr('')
    try { await quotationsAPI.approve(q.id); await reload(); onRefresh() }
    catch (ex: any) { setErr(ex.response?.data?.detail || 'Approve failed') } finally { setSaving(false) }
  }

  const doReject = async () => {
    if (!rejectNote.trim()) { setErr('Rejection reason required'); return }
    setSaving(true); setErr('')
    try { await quotationsAPI.reject(q.id, { reason: rejectNote.trim() }); setShowReject(false); setRejectNote(''); await reload(); onRefresh() }
    catch (ex: any) { setErr(ex.response?.data?.detail || 'Reject failed') } finally { setSaving(false) }
  }

  const doRevise = async () => {
    setSaving(true); setErr('')
    try { const r = await quotationsAPI.revise(q.id, { notes: 'Revision by ' + userRole }); setQ(r.data.data); await reload(); onRefresh() }
    catch (ex: any) { setErr(ex.response?.data?.detail || 'Revise failed') } finally { setSaving(false) }
  }

  const handleAppliancePicked = async (_appliance: any, repeatInfo: any) => {
    // repeatInfo comes from the addAppliance API response
    setShowAddAppliance(false)
    await reload()  // reload to get updated list
  }

  const handleManualAppliance = async (_label: string) => {
    setShowAddAppliance(false)
    await reload()
  }

  const handleRemoveAppliance = async (_label: string) => {
    await reload()
  }

  const handleRepeatToggle = (label: string, isRepeat: boolean) => {
    setRepeatMap(m => ({ ...m, [label]: { ...m[label], isRepeat } }))
    reload()  // recalculate totals from backend
  }

  const loadHistory = async () => {
    try { const r = await quotationsAPI.history(q.id); setHistory(r.data.data); setShowHistory(true) } catch { }
  }

  if (loading) {
    return (
      <Modal title={`Quotation ${q?.quotation_number || '…'}`} onClose={onClose} size="xl">
        <div style={{ padding: 60, textAlign: 'center' }}><Spinner /></div>
      </Modal>
    )
  }

  return (
    <Modal title={`Quotation ${q?.quotation_number || '…'}`} onClose={onClose} size="xl">
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <QBadge status={q?.status} />
        <span style={{ fontSize: 11, background: '#F1F5F9', borderRadius: 20, padding: '1px 8px', color: '#64748B' }}>v{q?.version}</span>
        {(q?.booking_number || bookingDetail?.booking_number) && (
          <span style={{ fontSize: 12, color: '#1B4FD8', fontFamily: 'monospace', fontWeight: 700 }}>
            {q?.booking_number || bookingDetail?.booking_number}
          </span>
        )}
        {bookingDetail && (
          <>
            <span style={{ color: '#CBD5E1' }}>·</span>
            <span style={{ fontSize: 12, color: '#64748B' }}>👤 {bookingDetail.customer_name}</span>
            {bookingDetail.city && <span style={{ fontSize: 12, color: '#64748B' }}>📍 {bookingDetail.city}</span>}
            {hasTechnician && <span style={{ fontSize: 12, color: '#059669' }}>👷 {bookingDetail.technician_name}</span>}
          </>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {canEdit && !editMode && <button className="btn btn-secondary btn-sm" onClick={() => setEditMode(true)}>✏️ Edit Header</button>}
          {editMode && (
            <>
              <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving}>{saving ? <Spinner size="sm" /> : '💾 Save'}</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditMode(false)}>Cancel</button>
            </>
          )}
          {isAdminCCO && q?.status === 'APPROVED' && (
            <button className="btn btn-secondary btn-sm" onClick={doRevise} disabled={saving}>↩ Revise</button>
          )}
          <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={loadHistory}>📋 History</button>
        </div>
      </div>

      <ErrBox msg={err} />

      {/* Edit header */}
      {editMode && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 10 }}>✏️ Edit Quotation Header</div>
          {/* Charges grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 10 }}>
            {[
              { k: 'labour_charges', label: 'Labour (₹)' },
              { k: 'service_charges', label: 'Svc Charges (₹)' },
              { k: 'discount_amount', label: 'Discount (₹)' },
              { k: 'adjustment_amount', label: 'Adjustment − Deduct (₹)' },
            ].map(({ k, label }) => (
              <div key={k}>
                <label style={{ ...lbl, fontSize: 11 }}>{label}</label>
                <input className="input" type="number" step="0.01"
                  value={(editForm as any)[k]}
                  onChange={e => setEF(k, parseFloat(e.target.value) || 0)} />
              </div>
            ))}
          </div>
          {/* Tax mode */}
          <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED', marginBottom: 8 }}>🧾 Tax / GST Settings</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {[
                { val: 'B2C', label: 'B2C (Consumer)', hint: 'Default GST' },
                { val: 'B2B', label: 'B2B (Business)', hint: 'Require GSTIN' },
                { val: 'NONE', label: 'No Tax', hint: 'Tax exempt' },
              ].map(t => (
                <button key={t.val} onClick={() => setEF('tax_mode', t.val)} style={{
                  flex: 1, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                  border: `2px solid ${editForm.tax_mode === t.val ? '#7C3AED' : '#E2E8F0'}`,
                  background: editForm.tax_mode === t.val ? '#EDE9FE' : '#F8FAFC',
                  color: editForm.tax_mode === t.val ? '#5B21B6' : '#64748B',
                }}>
                  {t.label}
                  <div style={{ fontSize: 9, fontWeight: 400, color: '#94A3B8' }}>{t.hint}</div>
                </button>
              ))}
            </div>
            {editForm.tax_mode !== 'NONE' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: editForm.tax_mode === 'B2B' ? 10 : 0 }}>
                <label style={{ ...lbl, marginBottom: 0, fontSize: 11, whiteSpace: 'nowrap' }}>GST %</label>
                <input className="input" type="number" min={0} max={100} step={0.1}
                  value={editForm.tax_percent}
                  onChange={e => setEF('tax_percent', parseFloat(e.target.value) || 0)}
                  style={{ width: 90 }} />
                <span style={{ fontSize: 11, color: '#94A3B8' }}>Applied on subtotal</span>
              </div>
            )}
            {editForm.tax_mode === 'NONE' && (
              <div style={{ fontSize: 11, color: '#64748B' }}>⚠️ Tax-exempt — no GST will be calculated.</div>
            )}
            {editForm.tax_mode === 'B2B' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ ...lbl, fontSize: 11 }}>Customer GSTIN *</label>
                  <input className="input" placeholder="e.g. 21AABCP1234M1ZV"
                    value={editForm.customer_gst_number}
                    onChange={e => setEF('customer_gst_number', e.target.value)} />
                </div>
                <div>
                  <label style={{ ...lbl, fontSize: 11 }}>Business Name *</label>
                  <input className="input" placeholder="Registered business name"
                    value={editForm.customer_gst_name}
                    onChange={e => setEF('customer_gst_name', e.target.value)} />
                </div>
                <div>
                  <label style={{ ...lbl, fontSize: 11 }}>Business Address</label>
                  <input className="input" placeholder="Registered address"
                    value={editForm.customer_gst_address}
                    onChange={e => setEF('customer_gst_address', e.target.value)} />
                </div>
              </div>
            )}
          </div>
          <div>
            <label style={{ ...lbl, fontSize: 11 }}>Remarks</label>
            <input className="input" value={editForm.remarks} onChange={e => setEF('remarks', e.target.value)} />
          </div>
        </div>
      )}

      {/* ═══ APPLIANCES SECTION ═══ */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>
            🔧 Appliances & Services
            <span style={{ fontSize: 11, fontWeight: 400, color: '#94A3B8', marginLeft: 8 }}>
              {displayGroups.length} appliance{displayGroups.length !== 1 ? 's' : ''}
            </span>
          </div>
          {canEdit && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ background: showAddAppliance ? '#DCFCE7' : '#F0FDF4', color: '#166534', border: '1px solid #86EFAC', fontSize: 12 }}
              onClick={() => setShowAddAppliance(v => !v)}
            >
              {showAddAppliance ? '✕ Close' : '+ New Appliance / Machine'}
            </button>
          )}
        </div>

        {/* Appliance picker (customer's saved appliances) */}
        {showAddAppliance && (bookingDetail?.customer_id || q?.customer_id) && (
          <CustomerAppliancePicker
            customerId={bookingDetail?.customer_id || q?.customer_id}
            quotationId={q.id}
            existingLabels={existingLabels}
            onPicked={handleAppliancePicked}
            onManual={handleManualAppliance}
            onCancel={() => setShowAddAppliance(false)}
          />
        )}
        {showAddAppliance && !bookingDetail?.customer_id && !q?.customer_id && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12, color: '#DC2626' }}>
            ⚠️ No customer linked to this quotation. Cannot load appliances.
          </div>
        )}

        {/* Empty state */}
        {showEmptyPrompt && !showAddAppliance && (
          <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 10, padding: '24px 20px', textAlign: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔧</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#475569', marginBottom: 4 }}>No Appliances Added Yet</div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 12 }}>
              Add the customer's machine/appliance first, then add services and spare parts to it.
            </div>
            <button
              className="btn btn-primary"
              onClick={() => setShowAddAppliance(true)}
            >
              + Add First Appliance
            </button>
          </div>
        )}

        {/* Appliance cards */}
        {displayGroups.map(([label, group]) => {
          const meta = repeatMap[label] || { isRepeat: false, repeatBooking: null }
          return (
            <ApplianceCard
              key={label}
              label={label}
              services={group.services}
              parts={group.parts}
              canEdit={canEdit}
              quotationId={q.id}
              quotationStatus={q?.status || ''}
              bookingCity={bookingDetail?.city || ''}
              hasTechnician={hasTechnician}
              repeatBooking={meta.repeatBooking}
              isRepeat={meta.isRepeat}
              onReload={reload}
              onRemove={handleRemoveAppliance}
              onRepeatToggle={handleRepeatToggle}
            />
          )
        })}
      </div>

      {/* Amount summary */}
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 16px', marginBottom: 14 }}>
        {/* Show repeat complaint note if any */}
        {Object.values(repeatMap).some(m => m.isRepeat) && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#DC2626' }}>
            🔴 Some appliances are marked as repeat complaint — their services & parts are excluded from the total below.
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12 }}>
          {[
            ['Services Total', money(q?.services_total)],
            ['Parts Total', money(q?.parts_total)],
            ['Labour', money(q?.labour_charges)],
            ['Service Charges', money(q?.service_charges)],
            ['Discount (−)', `− ${money(q?.discount_amount)}`],
            ['Adjustment (−)', q?.adjustment_amount ? `− ${money(q.adjustment_amount)}` : money(0)],
            ...(q?.coupon_code ? [[`🏷️ Coupon (${q.coupon_code})`, `− ${money(q.coupon_discount)}`]] : []),
          ].map(([k, v]) => (
            <div key={k} style={{ background: '#fff', borderRadius: 6, padding: '8px 12px', border: '1px solid #F1F5F9' }}>
              <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 3 }}>{k}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 12, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Subtotal</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{money(q?.subtotal_amount)}</div>
          </div>
          {/* Show GST only when tax_mode is NOT NONE */}
          {q?.tax_mode !== 'NONE' && (
            <div>
              <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>
                GST ({q?.tax_percent}%)
                {q?.tax_mode === 'B2B' && (
                  <span style={{ marginLeft: 6, background: '#EDE9FE', color: '#5B21B6', borderRadius: 4, padding: '1px 5px', fontWeight: 700, fontSize: 9 }}>B2B</span>
                )}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#64748B' }}>{money(q?.tax_amount)}</div>
            </div>
          )}
          {q?.tax_mode === 'NONE' && (
            <div style={{ fontSize: 11, color: '#64748B', background: '#F1F5F9', borderRadius: 6, padding: '6px 10px', alignSelf: 'center' }}>
              🚫 Tax Exempt (No GST)
            </div>
          )}
          <div style={{ borderLeft: '3px solid #3B82F6', paddingLeft: 20 }}>
            <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Grand Total</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#059669' }}>{money(q?.total_amount)}</div>
          </div>
        </div>
        {/* B2B GST info strip */}
        {q?.tax_mode === 'B2B' && q?.customer_gst_number && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: '#EDE9FE', borderRadius: 6, fontSize: 12, color: '#5B21B6' }}>
            🏢 <b>B2B:</b> {q.customer_gst_name && <><b>{q.customer_gst_name}</b> · </>}GSTIN: <b>{q.customer_gst_number}</b>
            {q.customer_gst_address && <span style={{ color: '#7C3AED', marginLeft: 8 }}>· {q.customer_gst_address}</span>}
          </div>
        )}

        {/* Coupon — read-only. Coupons are applied by the customer at booking time
            only; admin/CCO/technician have no ability to apply, change, or remove a
            coupon here. The discount is calculated automatically from the booking's
            coupon on the first quotation and shown for visibility only. */}
        {isAdminCCO && (q?.coupon_code || initBooking?.coupon_code) && (
          <div style={{ marginTop: 10, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px' }}>
            {q?.coupon_code ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#92400E', fontWeight: 700 }}>🏷️ Coupon Applied (by customer):</span>
                <span style={{ background: '#FEF3C7', color: '#92400E', padding: '2px 12px', borderRadius: 20, fontWeight: 800, border: '1px solid #FDE68A', fontFamily: 'monospace', fontSize: 13 }}>
                  {q.coupon_code}
                </span>
                <span style={{ color: '#DC2626', fontWeight: 700, fontSize: 13 }}>−{money(q.coupon_discount)}</span>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#92400E' }}>
                🏷️ Customer applied coupon <b>{initBooking.coupon_code}</b> at booking — it only applies to the first quotation of this booking.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status boxes */}
      {q?.remarks && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '9px 14px', marginBottom: 10, fontSize: 13 }}>
          📝 <b>Remarks:</b> {q.remarks}
        </div>
      )}
      {q?.rejection_reason && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 14px', marginBottom: 10, fontSize: 13 }}>
          ❌ <b>Rejected:</b> {q.rejection_reason}
        </div>
      )}
      {q?.approved_at && (
        <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '9px 14px', marginBottom: 10, fontSize: 13 }}>
          ✅ <b>Approved:</b> {fmtDT(q.approved_at)}
        </div>
      )}

      {/* Reject form */}
      {showReject && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', marginBottom: 8 }}>Reject Quotation</div>
          <label style={lbl}>Rejection Reason *</label>
          <textarea className="input" rows={2} value={rejectNote} onChange={e => setRejectNote(e.target.value)}
            placeholder="Why is this quotation rejected?" style={{ resize: 'vertical', marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-danger btn-sm" onClick={doReject} disabled={saving || !rejectNote.trim()}>
              {saving ? <Spinner size="sm" /> : 'Confirm Reject'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowReject(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #F1F5F9', paddingTop: 14 }}>
        <DownloadQuotationPDFButton quotation={q} />
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={doSubmit} disabled={saving}>
            📤 Submit for Approval
          </button>
        )}
        {isAdminCCO && ['SUBMITTED', 'DRAFT'].includes(q?.status) && (
          <button className="btn btn-secondary btn-sm"
            style={{ background: '#F0FDF4', color: '#166534', border: '1px solid #86EFAC' }}
            onClick={doApprove} disabled={saving}>
            ⚡ {q?.status === 'SUBMITTED' ? 'Pre-Approve' : 'Direct Approve'}
          </button>
        )}
        {isAdminCCO && ['SUBMITTED', 'DRAFT'].includes(q?.status) && (
          <button className="btn btn-danger btn-sm" onClick={() => setShowReject(true)}>✗ Reject</button>
        )}
        {isAdminCCO && q?.status === 'APPROVED' && (
          <button className="btn btn-secondary btn-sm" onClick={doRevise} disabled={saving}>↩ Create Revision</button>
        )}
      </div>

      {/* History modal */}
      {showHistory && history && (
        <Modal title="Quotation Version History" onClose={() => setShowHistory(false)} size="md">
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Versions</div>
            {(history.versions || []).map((v: any) => (
              <div key={v.id} style={{ padding: '8px 12px', background: '#F8FAFC', borderRadius: 6, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 13, fontFamily: 'monospace' }}>
                  {v.quotation_number} <span style={{ color: '#94A3B8', fontWeight: 400, fontFamily: 'sans-serif' }}>v{v.version}</span>
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <QBadge status={v.status} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>{money(v.total_amount)}</span>
                </div>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Event Timeline</div>
            <div style={{ borderLeft: '2px solid #E2E8F0', paddingLeft: 14 }}>
              {(history.events || []).map((e: any, i: number) => (
                <div key={i} style={{ position: 'relative', marginBottom: 12 }}>
                  <div style={{ position: 'absolute', left: -20, top: 4, width: 8, height: 8, borderRadius: '50%', background: Q_STATUS[e.status]?.dot || '#94A3B8', border: '2px solid white', boxShadow: '0 0 0 1px #E2E8F0' }} />
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{e.status}</div>
                  {e.notes && <div style={{ fontSize: 12, color: '#64748B' }}>{e.notes}</div>}
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>{fmtDT(e.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  )
}

export function QuotationFromBookingModal({
  booking, onClose, onDone, userRole, readOnly,
}: {
  booking: any; onClose: () => void; onDone: () => void; userRole?: string; readOnly?: boolean;
}) {
  const role = userRole || 'ADMIN'

  // ── state ──
  const [phase, setPhase] = useState<'loading' | 'list' | 'create' | 'editor'>('loading')
  const [existingQ, setExistingQ] = useState<any[]>([])
  const [openingId, setOpeningId] = useState<string | null>(null)  // which row is loading
  const [quotation, setQuotation] = useState<any>(null)
  const [form, setForm] = useState({ labour_charges: 0, service_charges: 0, tax_percent: 18, remarks: '', tax_mode: 'B2C', customer_gst_number: '', customer_gst_name: '', customer_gst_address: '', coupon_code: '' })
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  const [creating, setCreating] = useState(false)
  const [revertingId, setRevertingId] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [custGst, setCustGst] = useState<{ gst_number?: string; gst_name?: string; gst_address?: string } | null>(null)
  const [custGstLoading, setCustGstLoading] = useState(false)

  // ── load the customer's saved GST profile (if any) once, so the admin can
  //     reuse it instead of retyping GST details for every B2B quotation ──
  useEffect(() => {
    const custId = booking?.customer_id
    if (!custId) return
    setCustGstLoading(true)
    customersAPI.get(custId)
      .then((r: any) => {
        const c = r.data?.data || r.data
        if (c?.gst_number) setCustGst({ gst_number: c.gst_number, gst_name: c.gst_name, gst_address: c.gst_address })
      })
      .catch(() => {})
      .finally(() => setCustGstLoading(false))
  }, [booking?.customer_id])

  const useSavedCustomerGst = () => {
    if (!custGst) return
    setForm(f => ({
      ...f,
      customer_gst_number: custGst.gst_number || f.customer_gst_number,
      customer_gst_name: custGst.gst_name || f.customer_gst_name,
      customer_gst_address: custGst.gst_address || f.customer_gst_address,
    }))
  }

  // ── on mount: load existing quotations ──
  useEffect(() => {
    // Pre-populate service_charges from booking base_amount as a starting hint
    if (booking.base_amount) {
      set('service_charges', booking.base_amount)
    }
    setPhase('loading')
    quotationsAPI.list({ booking_id: booking.id, per_page: 20 })
      .then(async r => {
        const items: any[] = r.data.data?.items || []
        setExistingQ(items)

        // If exactly one DRAFT/REVISED/REJECTED quotation — auto-open it directly
        const editables = items.filter((q: any) => EDITABLE_STATUSES.includes(q.status))
        if (editables.length === 1 && items.length === 1) {
          try {
            const detail = await quotationsAPI.get(editables[0].id)
            setQuotation(detail.data.data)
            setPhase('editor')
          } catch {
            setPhase('list')
          }
        } else {
          setPhase('list')
        }
      })
      .catch(() => setPhase('list'))
  }, [booking.id])

  // ── open a specific quotation by id ──
  const openQuotation = async (qid: string) => {
    setOpeningId(qid); setErr('')
    try {
      const r = await quotationsAPI.get(qid)
      setQuotation(r.data.data)
      setPhase('editor')
    } catch (ex: any) {
      setErr(ex.response?.data?.detail || 'Failed to load quotation')
    } finally {
      setOpeningId(null)
    }
  }

  // ── revise an approved quotation then open the new draft ──
  const reviseAndOpen = async (qid: string) => {
    setOpeningId(qid + '_revise'); setErr('')
    try {
      const rv = await quotationsAPI.revise(qid, { notes: 'Revision from booking' })
      const newId = rv.data.data?.id
      if (newId) {
        const detail = await quotationsAPI.get(newId)
        setQuotation(detail.data.data)
        setPhase('editor')
      } else {
        // Fallback: reload list and find the new editable
        const refetch = await quotationsAPI.list({ booking_id: booking.id, per_page: 20 })
        const items: any[] = refetch.data.data?.items || []
        setExistingQ(items)
        const newest = items.find((q: any) => EDITABLE_STATUSES.includes(q.status))
        if (newest) {
          const detail = await quotationsAPI.get(newest.id)
          setQuotation(detail.data.data)
          setPhase('editor')
        } else {
          setErr('Revision created — please refresh and reopen')
          setPhase('list')
        }
      }
    } catch (ex: any) {
      setErr(ex.response?.data?.detail || 'Failed to create revision')
    } finally {
      setOpeningId(null)
    }
  }

  // ── revert submitted/approved quotation back to draft, then open ──
  const revertAndOpen = async (qid: string) => {
    setRevertingId(qid); setErr('')
    try {
      await quotationsAPI.revertToDraft(qid)
      const detail = await quotationsAPI.get(qid)
      setQuotation(detail.data.data)
      setPhase('editor')
    } catch (ex: any) {
      setErr(ex.response?.data?.detail || 'Failed to revert to draft')
    } finally { setRevertingId(null) }
  }

  // ── create new quotation ──
  const createNew = async () => {
    setCreating(true); setErr('')
    try {
      const payload: any = {
        booking_id: booking.id,
        labour_charges: form.labour_charges,
        service_charges: form.service_charges,
        tax_percent: form.tax_mode === 'NONE' ? 0 : form.tax_percent,
        remarks: form.remarks || undefined,
        tax_mode: form.tax_mode,
        // Admin creates on behalf of the assigned technician (same as CCO)
        on_behalf_technician_id: booking?.technician_id || undefined,
      }
      // Coupon is carried over automatically from the booking — only ever on the
      // first quotation (backend also enforces this). Admin cannot type/override it.
      if (booking?.coupon_code && existingQ.length === 0) {
        payload.coupon_code = booking.coupon_code.trim().toUpperCase()
      }
      if (form.tax_mode === 'B2B') {
        if (form.customer_gst_number) payload.customer_gst_number = form.customer_gst_number
        if (form.customer_gst_name)   payload.customer_gst_name   = form.customer_gst_name
        if (form.customer_gst_address) payload.customer_gst_address = form.customer_gst_address
      }
      const r = await quotationsAPI.create(payload)
      const newId = r.data.data?.id
      if (!newId) throw new Error('No quotation ID returned')
      // NOTE: We do NOT call applyCoupon here after creation.
      // The create_quotation backend already stores coupon_id + coupon_code when
      // payload.coupon_code is sent, and _recalculate_quotation will dynamically compute
      // the discount as services are added. Calling applyCoupon here would double-increment
      // used_count and eventually block the coupon with "usage limit reached".
      const detail = await quotationsAPI.get(newId)
      setQuotation(detail.data.data)
      setPhase('editor')
    } catch (ex: any) {
      setErr(ex.response?.data?.detail || 'Failed to create quotation')
    } finally { setCreating(false) }
  }

  // ── PHASE: loading ──
  if (phase === 'loading') {
    return (
      <Modal title={`Quotation — ${booking.booking_number}`} onClose={onClose} size="xl">
        <div style={{ padding: 80, textAlign: 'center' }}>
          <Spinner />
          <div style={{ marginTop: 12, fontSize: 13, color: '#94A3B8' }}>Loading quotations…</div>
        </div>
      </Modal>
    )
  }

  // ── PHASE: editor ──
  if (phase === 'editor' && quotation) {
    return (
      <QuotationEditor
        initQuotation={quotation}
        initBooking={booking}
        onClose={() => { onDone(); onClose() }}
        onRefresh={() => { onDone() }}
        userRole={role}
      />
    )
  }

  // ── PHASE: list (show existing + create option) ──
  const hasExisting = existingQ.length > 0

  return (
    <Modal title={`Quotation — ${booking.booking_number}`} onClose={onClose} size="lg">
      {/* Booking info strip */}
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#1E40AF', fontFamily: 'monospace' }}>{booking.booking_number}</div>
        <div style={{ fontSize: 13, color: '#3B82F6', marginTop: 4 }}>
          👤 {booking.customer_name || '—'}
          {booking.city && <> · 📍 {booking.city}</>}
          {booking.service_name && <> · 🔧 {booking.service_name}</>}
          {booking.technician_name && <> · 👷 {booking.technician_name}</>}
        </div>
        {(booking.appliance_brand || booking.appliance_model) && (
          <div style={{ fontSize: 12, color: '#6366F1', marginTop: 3 }}>
            🔩 {booking.appliance_brand} {booking.appliance_model}
          </div>
        )}
      </div>

      <ErrBox msg={err} />

      {/* ── Existing quotations ── */}
      {hasExisting && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
            📋 {existingQ.length} existing quotation{existingQ.length !== 1 ? 's' : ''} for this booking:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {existingQ.map((eq: any) => {
              const isEditable = EDITABLE_STATUSES.includes(eq.status)
              const isApproved = eq.status === 'APPROVED'
              const isLoadingThis = openingId === eq.id
              const isRevisingThis = openingId === eq.id + '_revise'
              return (
                <div key={eq.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px', background: '#F8FAFC', borderRadius: 8,
                  border: isEditable ? '1.5px solid #86EFAC' : '1px solid #E2E8F0',
                }}>
                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#1B4FD8', fontFamily: 'monospace' }}>
                        {eq.quotation_number}
                      </span>
                      <QBadge status={eq.status} />
                      <span style={{ fontSize: 11, color: '#94A3B8' }}>v{eq.version}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>
                      Total: <b style={{ color: '#059669' }}>₹{(eq.total_amount || 0).toLocaleString('en-IN')}</b>
                      {eq.coupon_code && (
                        <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 10, padding: '1px 7px' }}>
                          🏷️ {eq.coupon_code}
                        </span>
                      )}
                      {isEditable && <span style={{ marginLeft: 10, color: '#166534', fontWeight: 600 }}>✏️ Can add services</span>}
                      {isApproved && <span style={{ marginLeft: 10, color: '#92400E' }}>🔒 Approved — revise to edit</span>}
                    </div>
                  </div>
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: 11, fontWeight: 600, background: isEditable ? '#DCFCE7' : '#EFF6FF', color: isEditable ? '#166534' : '#1D4ED8', border: `1px solid ${isEditable ? '#86EFAC' : '#BFDBFE'}` }}
                      onClick={() => openQuotation(eq.id)}
                      disabled={openingId !== null || revertingId !== null}
                    >
                      {isLoadingThis ? <Spinner size="sm" /> : isEditable ? '✏️ Open & Edit' : '👁 View'}
                    </button>
                    {/* SUBMITTED → revert back to DRAFT for editing */}
                    {eq.status === 'SUBMITTED' && (
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: 11, fontWeight: 600, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}
                        onClick={() => revertAndOpen(eq.id)}
                        disabled={openingId !== null || revertingId !== null}
                        title="Revert back to DRAFT so you can edit and re-submit"
                      >
                        {revertingId === eq.id ? <Spinner size="sm" /> : '✏️ Edit (Revert to Draft)'}
                      </button>
                    )}
                    {/* APPROVED → create revision OR revert to draft */}
                    {isApproved && (
                      <>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: 11, fontWeight: 600, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}
                          onClick={() => reviseAndOpen(eq.id)}
                          disabled={openingId !== null || revertingId !== null}
                          title="Create a new revision (keeps approved version)"
                        >
                          {isRevisingThis ? <Spinner size="sm" /> : '↩ Revise & Edit'}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: 11, fontWeight: 600, background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}
                          onClick={() => revertAndOpen(eq.id)}
                          disabled={openingId !== null || revertingId !== null}
                          title="Revert this approved quotation back to DRAFT (removes approval)"
                        >
                          {revertingId === eq.id ? <Spinner size="sm" /> : '🔄 Edit (Un-Approve)'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {/* Only show "create new" divider if booking is not closed and no approved quotation exists */}
          {!readOnly && !existingQ.some((q: any) => q.status === 'APPROVED') && (
            <div style={{ margin: '16px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
              <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>OR CREATE A NEW QUOTATION</span>
              <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
            </div>
          )}
        </div>
      )}

      {/* ── Create new quotation form — hide if booking is closed OR approved quotation exists ── */}
      {readOnly ? (
        <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#92400E' }}>
          🔒 This booking is <b>settled and closed</b>. New quotations cannot be created.
        </div>
      ) : existingQ.some((q: any) => q.status === 'APPROVED') ? (
        <div style={{ background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#166534' }}>
          ✅ An <b>approved</b> quotation already exists for this booking. Use <b>Revise &amp; Edit</b> or <b>Edit (Un-Approve)</b> above to make changes.
        </div>
      ) : (
        <>
          {!hasExisting && (
            <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#166534' }}>
              No quotations yet for this booking. Fill in charges below and create one.
            </div>
          )}

          {/* ── Tax Mode ── */}
          <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#7C3AED', marginBottom: 10 }}>🧾 Tax / GST Settings</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {[
                { val: 'B2C', label: 'B2C (Consumer)', hint: 'Default — apply GST' },
                { val: 'B2B', label: 'B2B (Business)', hint: 'Require customer GSTIN' },
                { val: 'NONE', label: 'No Tax', hint: 'Tax exempt / Non-GST' },
              ].map(t => (
                <button key={t.val} onClick={() => set('tax_mode', t.val)} style={{
                  flex: 1, padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  border: `2px solid ${form.tax_mode === t.val ? '#7C3AED' : '#E2E8F0'}`,
                  background: form.tax_mode === t.val ? '#EDE9FE' : '#F8FAFC',
                  color: form.tax_mode === t.val ? '#5B21B6' : '#64748B',
                }}>
                  {t.label}
                  <div style={{ fontSize: 9, fontWeight: 400, color: '#94A3B8' }}>{t.hint}</div>
                </button>
              ))}
            </div>
            {form.tax_mode !== 'NONE' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ ...lbl, marginBottom: 0, fontSize: 12 }}>GST %</label>
                <input className="input" type="number" min={0} max={100} step={0.1}
                  value={form.tax_percent}
                  onChange={e => set('tax_percent', parseFloat(e.target.value) || 0)}
                  style={{ width: 100 }} />
                <span style={{ fontSize: 11, color: '#94A3B8' }}>Applied on subtotal</span>
              </div>
            )}
            {form.tax_mode === 'NONE' && (
              <div style={{ fontSize: 11, color: '#64748B' }}>⚠️ Tax-exempt — no GST will be calculated or shown on this quotation.</div>
            )}
            {form.tax_mode === 'B2B' && (
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {custGst && !form.customer_gst_number && (
                  <div style={{ gridColumn: '1/-1', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px' }}>
                    <div style={{ fontSize: 11, color: '#92400E', marginBottom: 4 }}>
                      This customer has saved GST details: <b>{custGst.gst_name}</b> ({custGst.gst_number})
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={useSavedCustomerGst}>
                      Use saved GST details
                    </button>
                  </div>
                )}
                {custGstLoading && !custGst && (
                  <div style={{ gridColumn: '1/-1', fontSize: 11, color: '#64748B' }}>Checking customer's saved GST details…</div>
                )}
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ ...lbl, fontSize: 11 }}>Customer GSTIN *</label>
                  <input className="input" placeholder="e.g. 21AABCP1234M1ZV" value={form.customer_gst_number}
                    onChange={e => set('customer_gst_number', e.target.value)} />
                </div>
                <div>
                  <label style={{ ...lbl, fontSize: 11 }}>Business Name *</label>
                  <input className="input" placeholder="Registered business name" value={form.customer_gst_name}
                    onChange={e => set('customer_gst_name', e.target.value)} />
                </div>
                <div>
                  <label style={{ ...lbl, fontSize: 11 }}>Business Address</label>
                  <input className="input" placeholder="Registered address" value={form.customer_gst_address}
                    onChange={e => set('customer_gst_address', e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Labour Charges (₹)</label>
              <input className="input" type="number" min={0} step={0.01} value={form.labour_charges}
                onChange={e => set('labour_charges', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label style={lbl}>Service Charges (₹)</label>
              <input className="input" type="number" min={0} step={0.01} value={form.service_charges}
                onChange={e => set('service_charges', parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Remarks (optional)</label>
            <textarea className="input" rows={2} value={form.remarks} onChange={e => set('remarks', e.target.value)}
              placeholder="Optional remarks…" style={{ resize: 'vertical' }} />
          </div>

          {/* Coupon — read-only. Coupon codes are applied by the customer at booking
              time only; admin/CCO/technician cannot apply or change one here. If the
              customer applied a coupon on this booking, it is carried over and the
              discount is calculated automatically on the first quotation. */}
          {existingQ.length === 0 && booking?.coupon_code && (
            <div style={{ marginBottom: 16, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 12, color: '#92400E', fontWeight: 700, marginBottom: 2 }}>🏷️ Coupon applied by customer</div>
              <div style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1, fontSize: 14, color: '#92400E' }}>
                {booking.coupon_code}
              </div>
              <div style={{ fontSize: 11, color: '#92400E', marginTop: 3 }}>
                Discount will be calculated automatically on this quotation.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={createNew}
              disabled={creating || (form.tax_mode === 'B2B' && (!form.customer_gst_number.trim() || !form.customer_gst_name.trim()))}>
              {creating ? <Spinner size="sm" /> : '✅ Create New Quotation →'}
            </button>
            {form.tax_mode === 'B2B' && (!form.customer_gst_number.trim() || !form.customer_gst_name.trim()) && (
              <span style={{ fontSize: 11, color: '#DC2626', alignSelf: 'center' }}>B2B requires GSTIN &amp; Business Name</span>
            )}
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </>
      )}
    </Modal>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Authenticated Quotation PDF download button (used in QuotationEditor) ──────
function DownloadQuotationPDFButton({ quotation }: { quotation: any }) {
  const [loading, setLoading] = useState(false)
  if (!quotation?.id) return null
  const handleClick = async () => {
    setLoading(true)
    try {
      const r    = await quotationsAPI.pdf(quotation.id)
      const blob = new Blob([r.data], { type: 'application/pdf' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${quotation.quotation_number || quotation.id}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (err) {
      console.error('Quotation PDF download error:', err)
      alert('Failed to download PDF. Please try again.')
    } finally {
      setLoading(false)
    }
  }
  return (
    <button
      className="btn btn-secondary btn-sm"
      style={{ background: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}
      onClick={handleClick}
      disabled={loading}>
      {loading ? <Spinner size="sm" /> : '📄 Download PDF'}
    </button>
  )
}

// PDF Generation Helpers
// ══════════════════════════════════════════════════════════════════════════════

async function generateQuotationPDF(q: any): Promise<void> {
  // Fetch full quotation + domain profile for branding
  let fullQ = q
  let domainProfile: any = null

  try {
    const r = await quotationsAPI.get(q.id)
    fullQ = r.data.data
  } catch { }

  // Try to fetch domain profile using booking's domain_id
  if (fullQ.domain_id || q.domain_id) {
    try {
      const dpRes = await domainsAPI.profile(fullQ.domain_id || q.domain_id)
      domainProfile = dpRes.data.data
    } catch { }
  }

  const money = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`
  const fmtD  = (d: string) => d ? new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  // Group services and parts by appliance
  const services: any[] = fullQ.services || []
  const parts: any[]    = fullQ.parts    || []

  const groupMap = new Map<string, { services: any[]; parts: any[] }>()
  const ensureG  = (label: string) => { if (!groupMap.has(label)) groupMap.set(label, { services: [], parts: [] }); return groupMap.get(label)! }
  services.forEach((s: any) => {
    const name: string = s.service_name || s.display_name || ''
    if (name.includes(' :: ')) {
      const idx = name.indexOf(' :: ')
      ensureG(name.substring(0, idx)).services.push({ ...s, _name: name.substring(idx + 4) })
    } else {
      ensureG('General').services.push({ ...s, _name: name })
    }
  })
  parts.forEach((p: any) => ensureG(p.appliance_label || 'General').parts.push(p))

  // Build appliance rows HTML
  const applianceHTML = Array.from(groupMap.entries()).map(([label, grp]) => {
    const svcRows = grp.services.map(s => `
      <tr>
        <td style="padding:7px 10px;border-bottom:1px solid #F1F5F9;">${s._name || s.service_name || ''}</td>
        <td style="padding:7px 10px;text-align:center;border-bottom:1px solid #F1F5F9;">${s.quantity}</td>
        <td style="padding:7px 10px;text-align:right;border-bottom:1px solid #F1F5F9;">${money(s.unit_price)}</td>
        <td style="padding:7px 10px;text-align:right;font-weight:700;border-bottom:1px solid #F1F5F9;">${money(s.total_price)}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #F1F5F9;color:#6B7280;font-size:11px;">Service</td>
      </tr>`).join('')

    const partRows = grp.parts.map(p => `
      <tr style="background:#FFFBEB;">
        <td style="padding:7px 10px;border-bottom:1px solid #FEF3C7;">🔩 ${p.part_name}</td>
        <td style="padding:7px 10px;text-align:center;border-bottom:1px solid #FEF3C7;">${p.quantity}</td>
        <td style="padding:7px 10px;text-align:right;border-bottom:1px solid #FEF3C7;">${money(p.unit_price)}</td>
        <td style="padding:7px 10px;text-align:right;font-weight:700;border-bottom:1px solid #FEF3C7;">${money(p.total_price)}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #FEF3C7;color:#6B7280;font-size:11px;">${p.part_source?.replace('_', ' ') || 'Part'}</td>
      </tr>`).join('')

    if (!svcRows && !partRows) return ''

    return `
      <div style="margin-bottom:20px;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;">
        <div style="background:linear-gradient(90deg,#1B4FD8,#2563EB);color:white;padding:10px 14px;font-weight:700;font-size:13px;">
          🔧 ${label}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#F8FAFC;">
              <th style="padding:7px 10px;text-align:left;color:#64748B;font-size:11px;text-transform:uppercase;">Description</th>
              <th style="padding:7px 10px;text-align:center;color:#64748B;font-size:11px;text-transform:uppercase;width:50px;">Qty</th>
              <th style="padding:7px 10px;text-align:right;color:#64748B;font-size:11px;text-transform:uppercase;width:100px;">Unit Price</th>
              <th style="padding:7px 10px;text-align:right;color:#64748B;font-size:11px;text-transform:uppercase;width:100px;">Total</th>
              <th style="padding:7px 10px;color:#64748B;font-size:11px;text-transform:uppercase;width:90px;">Type</th>
            </tr>
          </thead>
          <tbody>${svcRows}${partRows}</tbody>
        </table>
      </div>`
  }).join('')

  // Domain branding
  const brandColor = domainProfile?.brand_color || '#1B4FD8'
  const domainName = domainProfile?.business_legal_name || q.domain_name || 'Palei Solutions'
  const domainPhone = domainProfile?.support_phone || ''
  const domainEmail = domainProfile?.support_email || ''
  const domainAddress = [domainProfile?.office_address, domainProfile?.office_city, domainProfile?.office_state].filter(Boolean).join(', ')
  const domainGST = domainProfile?.gstin || ''
  const bankName = domainProfile?.bank_name || ''
  const bankAccount = domainProfile?.bank_account_number || ''
  const bankIFSC = domainProfile?.bank_ifsc || ''
  const bankHolder = domainProfile?.bank_account_name || ''
  const upiId = domainProfile?.upi_id || ''
  const logoUrl = domainProfile?.logo_url || q.domain_logo_url || ''

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Quotation ${fullQ.quotation_number || ''}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0F172A; font-size: 13px; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body style="padding:0;margin:0;background:#F8FAFC;">
  <div style="max-width:800px;margin:0 auto;background:white;min-height:100vh;">

    <!-- Header / Brand -->
    <div style="background:${brandColor};color:white;padding:28px 32px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="display:flex;align-items:center;gap:14px;">
          ${logoUrl ? `<img src="${logoUrl}" style="height:52px;object-fit:contain;background:white;border-radius:8px;padding:4px;" alt="Logo" />` : ''}
          <div>
            <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;">${domainName}</div>
            ${domainAddress ? `<div style="font-size:11px;opacity:0.85;margin-top:3px;">${domainAddress}</div>` : ''}
            ${domainPhone ? `<div style="font-size:11px;opacity:0.85;">📞 ${domainPhone}${domainEmail ? ' · ✉ ' + domainEmail : ''}</div>` : ''}
            ${domainGST ? `<div style="font-size:10px;opacity:0.7;margin-top:2px;">GSTIN: ${domainGST}</div>` : ''}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:26px;font-weight:800;letter-spacing:-1px;opacity:0.9;">QUOTATION</div>
          <div style="font-size:14px;font-weight:700;margin-top:4px;opacity:0.85;">${fullQ.quotation_number || ''}</div>
          <div style="font-size:11px;opacity:0.7;margin-top:2px;">Version ${fullQ.version || 1}</div>
        </div>
      </div>
    </div>

    <!-- Meta strip -->
    <div style="background:#F1F5F9;padding:14px 32px;display:flex;gap:32px;flex-wrap:wrap;border-bottom:1px solid #E2E8F0;">
      <div><div style="font-size:10px;color:#64748B;font-weight:700;text-transform:uppercase;">Date</div><div style="font-weight:600;font-size:13px;">${fmtD(fullQ.created_at)}</div></div>
      <div><div style="font-size:10px;color:#64748B;font-weight:700;text-transform:uppercase;">Booking #</div><div style="font-weight:600;font-size:13px;font-family:monospace;">${fullQ.booking_number || q.booking_number || '—'}</div></div>
      <div><div style="font-size:10px;color:#64748B;font-weight:700;text-transform:uppercase;">Status</div><div style="font-weight:700;font-size:13px;color:${fullQ.status === 'APPROVED' ? '#059669' : '#1B4FD8'};">${fullQ.status?.replace(/_/g, ' ')}</div></div>
      ${fullQ.valid_until ? `<div><div style="font-size:10px;color:#64748B;font-weight:700;text-transform:uppercase;">Valid Until</div><div style="font-weight:600;font-size:13px;">${fmtD(fullQ.valid_until)}</div></div>` : ''}
    </div>

    <!-- Customer details -->
    <div style="padding:20px 32px;display:flex;gap:32px;flex-wrap:wrap;">
      <div style="flex:1;min-width:220px;">
        <div style="font-size:10px;color:#64748B;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Bill To</div>
        <div style="font-weight:700;font-size:15px;">${fullQ.customer_name || q.customer_name || '—'}</div>
        ${fullQ.customer_mobile || q.customer_mobile ? `<div style="font-size:13px;color:#475569;">📞 ${fullQ.customer_mobile || q.customer_mobile}</div>` : ''}
        ${fullQ.customer_address ? `<div style="font-size:12px;color:#64748B;margin-top:2px;">${fullQ.customer_address}</div>` : ''}
        ${fullQ.tax_mode === 'B2B' && fullQ.customer_gst_number ? `
          <div style="margin-top:6px;padding:6px 10px;background:#EDE9FE;border-radius:6px;font-size:11px;color:#5B21B6;">
            <b>GSTIN:</b> ${fullQ.customer_gst_number}<br/>
            ${fullQ.customer_gst_name ? `<b>Business:</b> ${fullQ.customer_gst_name}` : ''}
          </div>` : ''}
      </div>
      ${fullQ.technician_name ? `
      <div style="flex:1;min-width:200px;">
        <div style="font-size:10px;color:#64748B;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Technician</div>
        <div style="font-weight:600;font-size:14px;">👷 ${fullQ.technician_name}</div>
      </div>` : ''}
    </div>

    <!-- Appliance sections -->
    <div style="padding:0 32px 20px;">
      ${applianceHTML || '<p style="color:#94A3B8;text-align:center;padding:20px;">No items in this quotation</p>'}
    </div>

    <!-- Payment Summary -->
    <div style="margin:0 32px 24px;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;">
      <div style="background:#F8FAFC;padding:10px 16px;font-weight:700;font-size:13px;border-bottom:1px solid #E2E8F0;">Payment Summary</div>
      <div style="padding:14px 16px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:4px 0;color:#475569;">Services Total</td><td style="padding:4px 0;text-align:right;font-weight:600;">${money(fullQ.services_total)}</td></tr>
          <tr><td style="padding:4px 0;color:#475569;">Parts Total</td><td style="padding:4px 0;text-align:right;font-weight:600;">${money(fullQ.parts_total)}</td></tr>
          ${fullQ.labour_charges > 0 ? `<tr><td style="padding:4px 0;color:#475569;">Labour Charges</td><td style="padding:4px 0;text-align:right;font-weight:600;">${money(fullQ.labour_charges)}</td></tr>` : ''}
          ${fullQ.service_charges > 0 ? `<tr><td style="padding:4px 0;color:#475569;">Service Charges</td><td style="padding:4px 0;text-align:right;font-weight:600;">${money(fullQ.service_charges)}</td></tr>` : ''}
          ${fullQ.discount_amount > 0 ? `<tr><td style="padding:4px 0;color:#DC2626;">Discount (−)</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#DC2626;">− ${money(fullQ.discount_amount)}</td></tr>` : ''}
          ${fullQ.coupon_code ? `<tr><td style="padding:4px 0;color:#B45309;">🏷️ Coupon (${fullQ.coupon_code})</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#B45309;">− ${money(fullQ.coupon_discount)}</td></tr>` : ''}
          <tr style="border-top:1px solid #E2E8F0;"><td style="padding:8px 0;color:#475569;">Subtotal</td><td style="padding:8px 0;text-align:right;font-weight:700;">${money(fullQ.subtotal_amount)}</td></tr>
          ${fullQ.tax_mode !== 'NONE' ? `<tr><td style="padding:4px 0;color:#475569;">GST (${fullQ.tax_percent}%)</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#64748B;">${money(fullQ.tax_amount)}</td></tr>` : ''}
          <tr style="border-top:2px solid ${brandColor};">
            <td style="padding:10px 0;font-weight:800;font-size:16px;color:${brandColor};">GRAND TOTAL</td>
            <td style="padding:10px 0;text-align:right;font-weight:800;font-size:18px;color:#059669;">${money(fullQ.total_amount)}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Bank / Payment Details -->
    ${(bankAccount || upiId) ? `
    <div style="margin:0 32px 24px;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;">
      <div style="background:#F8FAFC;padding:10px 16px;font-weight:700;font-size:13px;border-bottom:1px solid #E2E8F0;">Account Details</div>
      <div style="padding:14px 16px;display:flex;gap:32px;flex-wrap:wrap;">
        ${bankAccount ? `
        <div>
          <div style="font-size:11px;color:#64748B;margin-bottom:8px;font-weight:600;text-transform:uppercase;">Bank Transfer</div>
          ${bankHolder ? `<div style="font-size:13px;"><b>Account Name:</b> ${bankHolder}</div>` : ''}
          ${bankName ? `<div style="font-size:13px;"><b>Bank:</b> ${bankName}</div>` : ''}
          <div style="font-size:13px;"><b>Account No:</b> ${bankAccount}</div>
          ${bankIFSC ? `<div style="font-size:13px;"><b>IFSC:</b> ${bankIFSC}</div>` : ''}
        </div>` : ''}
        ${upiId ? `
        <div>
          <div style="font-size:11px;color:#64748B;margin-bottom:8px;font-weight:600;text-transform:uppercase;">UPI</div>
          <div style="font-size:14px;font-weight:700;color:#6B21A8;">${upiId}</div>
        </div>` : ''}
      </div>
    </div>` : ''}

    ${fullQ.remarks ? `
    <div style="margin:0 32px 24px;padding:12px 16px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;font-size:12px;color:#92400E;">
      <b>Remarks:</b> ${fullQ.remarks}
    </div>` : ''}

    <!-- Footer -->
    <div style="border-top:2px solid ${brandColor};padding:16px 32px;text-align:center;color:#64748B;font-size:11px;">
      <div style="font-weight:600;color:#475569;">${domainName}</div>
      ${domainPhone ? `<div>📞 ${domainPhone}${domainEmail ? ' · ✉ ' + domainEmail : ''}</div>` : ''}
      <div style="margin-top:6px;font-style:italic;">Thank you for your business!</div>
    </div>

  </div>
  <script>
    window.onload = function() { window.print(); }
  </script>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url  = URL.createObjectURL(blob)
  const win  = window.open(url, '_blank')
  if (!win) { alert('Please allow popups to download PDF') }
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Quotations Page
// ══════════════════════════════════════════════════════════════════════════════
export default function Quotations() {
  const [items, setItems]         = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [page, setPage]           = useState(1)
  const [pages, setPages]         = useState(1)
  const [total, setTotal]         = useState(0)
  const [statusFilter, setStatus] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch]       = useState('')
  const [detail, setDetail]       = useState<any>(null)
  const [createBooking, setCreateBooking] = useState<any>(null)
  const [bookingSearch, setBookingSearch] = useState('')
  const [bookingResults, setBookingResults] = useState<any[]>([])
  const [bookingSearching, setBookingSearching] = useState(false)
  const [showBookingPicker, setShowBookingPicker] = useState(false)
  const [domainFilter, setDomainFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [downloadingPDF, setDownloadingPDF] = useState<string | null>(null)

  const userRole = 'ADMIN'

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = { page, per_page: 20 }
      if (statusFilter) params.status = statusFilter
      if (search) params.search = search
      if (domainFilter) params.domain_id = domainFilter
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
      const r = await quotationsAPI.list(params)
      const d = r.data.data
      setItems(d.items || []); setPages(d.pages || 1); setTotal(d.total || 0)
    } catch { setItems([]) } finally { setLoading(false) }
  }, [page, statusFilter, search, domainFilter, dateFrom, dateTo])

  const [domains, setDomains] = useState<any[]>([])
  useEffect(() => {
    import('@/services/api').then(({ domainsAPI }) => {
      domainsAPI.list({ per_page: 100 }).then(r => setDomains(r.data.data?.items || r.data.data || [])).catch(() => {})
    })
  }, [])

  useEffect(() => { fetchList() }, [fetchList])
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [searchInput])

  const openDetail = async (q: any) => {
    try { const r = await quotationsAPI.get(q.id); setDetail(r.data.data) }
    catch { setDetail(q) }
  }

  const downloadQuotationPDF = async (q: any) => {
    setDownloadingPDF(q.id)
    try {
      const r = await quotationsAPI.pdf(q.id)
      const blob = new Blob([r.data], { type: 'application/pdf' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${q.quotation_number || q.id}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (err) {
      console.error('Quotation PDF download error:', err)
      alert('Failed to download PDF. Please try again.')
    } finally {
      setDownloadingPDF(null)
    }
  }

  const searchBookings = async () => {
    if (!bookingSearch.trim()) return
    setBookingSearching(true)
    try {
      const r = await bookingsAPI.list({ search: bookingSearch.trim(), per_page: 15 })
      setBookingResults(r.data.data?.items || r.data.data?.bookings || [])
    } catch { setBookingResults([]) } finally { setBookingSearching(false) }
  }

  const ALL_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'REVISED', 'EXPIRED', 'CONVERTED_TO_INVOICE']

  return (
    <div style={{ padding: '24px 28px' }}>
      <PageHeader
        title="Quotations"
        subtitle={`${total} quotation${total !== 1 ? 's' : ''}`}
        actions={<button className="btn btn-primary" onClick={() => setShowBookingPicker(true)}>+ New Quotation</button>}
      />
      <div style={{ height: 16 }} />

      {/* Filter */}
      <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', marginBottom: 4, textTransform: 'uppercase' }}>Search</div>
            <div style={{ position: 'relative' }}>
              <input className="input" placeholder="Quotation #, booking #, customer name/mobile…" value={searchInput}
                onChange={e => setSearchInput(e.target.value)} style={{ paddingLeft: 32 }} />
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}>🔍</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', marginBottom: 4, textTransform: 'uppercase' }}>Status</div>
            <select className="input" value={statusFilter} onChange={e => { setStatus(e.target.value); setPage(1) }}>
              <option value="">All Statuses</option>
              {ALL_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', marginBottom: 4, textTransform: 'uppercase' }}>Domain</div>
            <select className="input" value={domainFilter} onChange={e => { setDomainFilter(e.target.value); setPage(1) }}>
              <option value="">All Domains</option>
              {domains.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', marginBottom: 4, textTransform: 'uppercase' }}>From</div>
            <input className="input" type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', marginBottom: 4, textTransform: 'uppercase' }}>To</div>
            <input className="input" type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} />
          </div>
          {(statusFilter || search || domainFilter || dateFrom || dateTo) && (
            <div style={{ alignSelf: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => { setStatus(''); setSearchInput(''); setSearch(''); setDomainFilter(''); setDateFrom(''); setDateTo(''); setPage(1) }}>✕ Clear</button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}><Spinner /></div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ minWidth: 860 }}>
                <thead>
                  <tr>
                    <th style={{ width: 44, textAlign: 'center' }}>#</th>
                    <th>Quotation #</th>
                    <th>Customer</th>
                    <th>Booking</th>
                    <th>Domain</th>
                    <th style={{ textAlign: 'right' }}>Services</th>
                    <th style={{ textAlign: 'right' }}>Parts</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th style={{ minWidth: 180 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ textAlign: 'center', color: '#94A3B8', padding: 48 }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                        <div style={{ fontSize: 14 }}>No quotations found</div>
                      </td>
                    </tr>
                  ) : items.map((q: any, i: number) => (
                    <tr key={q.id}>
                      <td style={{ textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>{(page - 1) * 20 + i + 1}</td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#1B4FD8', fontSize: 13, fontFamily: 'monospace', cursor: 'pointer' }}
                          onClick={() => openDetail(q)}>{q.quotation_number || q.id?.slice(0, 8)}</div>
                        <div style={{ fontSize: 10, color: '#94A3B8' }}>v{q.version}</div>
                        {q.coupon_code && (
                          <div style={{ marginTop: 3 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 10, padding: '1px 7px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              🏷️ {q.coupon_code} −{money(q.coupon_discount)}
                            </span>
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{q.customer_name || '—'}</div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>{q.customer_mobile || ''}</div>
                      </td>
                      <td style={{ fontSize: 13, color: '#0F172A', fontFamily: 'monospace' }}>{q.booking_number || '—'}</td>
                      <td>
                        {q.domain_name
                          ? <span style={{ fontSize: 11, background: '#EFF6FF', color: '#1B4FD8', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{q.domain_name}</span>
                          : <span style={{ fontSize: 11, color: '#CBD5E1' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 13, color: '#64748B' }}>{money(q.services_total)}</td>
                      <td style={{ textAlign: 'right', fontSize: 13, color: '#64748B' }}>{money(q.parts_total)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#059669' }}>{money(q.total_amount)}</td>
                      <td><QBadge status={q.status} /></td>
                      <td style={{ fontSize: 12, color: '#94A3B8' }}>{fmtDate(q.created_at)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => openDetail(q)}>View</button>
                          <button className="btn btn-secondary btn-sm"
                            style={{ fontSize: 11, background: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}
                            onClick={() => downloadQuotationPDF(q)}
                            disabled={downloadingPDF === q.id}>
                            {downloadingPDF === q.id ? <Spinner size="sm" /> : '📄 PDF'}
                          </button>
                          {q.status === 'SUBMITTED' && ['ADMIN', 'SUPER_ADMIN', 'CCO'].includes(userRole) && (
                            <button className="btn btn-secondary btn-sm"
                              style={{ fontSize: 11, background: '#F0FDF4', color: '#166534', border: '1px solid #86EFAC' }}
                              onClick={async () => {
                                if (!window.confirm(`Approve quotation ${q.quotation_number}? This will update the booking amounts and notify the technician.`)) return;
                                try { await quotationsAPI.approve(q.id); fetchList() } catch (err: any) {
                                  alert(`Failed to approve: ${err?.response?.data?.detail || err?.message || 'Unknown error'}`);
                                }
                              }}>
                              ✅ Approve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ borderTop: '1px solid #F1F5F9', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: '#94A3B8' }}>
                {items.length ? `${(page - 1) * 20 + 1}–${Math.min(page * 20, total)} of ${total}` : '0 results'}
              </div>
              <Pagination page={page} pages={pages} onPage={p => { setPage(p); window.scrollTo(0, 0) }} />
            </div>
          </>
        )}
      </div>

      {/* Detail editor */}
      {detail && (
        <QuotationEditor initQuotation={detail} onClose={() => setDetail(null)} onRefresh={fetchList} userRole={userRole} />
      )}

      {/* Booking picker */}
      {showBookingPicker && !createBooking && (
        <Modal title="New Quotation — Select Booking" onClose={() => { setShowBookingPicker(false); setBookingResults([]) }} size="lg">
          <p style={{ fontSize: 13, color: '#64748B', marginBottom: 14 }}>Search for the booking to create a quotation for:</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input className="input" style={{ flex: 1 }}
              placeholder="Booking #, customer name or mobile…"
              value={bookingSearch}
              onChange={e => setBookingSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchBookings()} />
            <button className="btn btn-primary" onClick={searchBookings} disabled={bookingSearching}>
              {bookingSearching ? <Spinner size="sm" /> : '🔍 Search'}
            </button>
          </div>
          {bookingResults.length > 0 && (
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
              {bookingResults.map((b: any) => (
                <div key={b.id}
                  onClick={() => { setCreateBooking(b); setShowBookingPicker(false); setBookingResults([]); setBookingSearch('') }}
                  style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#EFF6FF')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#1B4FD8', fontFamily: 'monospace' }}>{b.booking_number}</span>
                      <span style={{ marginLeft: 10 }}><StatusBadge status={b.status} /></span>
                    </div>
                    <span style={{ fontSize: 11, color: '#94A3B8' }}>{fmtDate(b.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                    👤 {b.customer_name || '—'} · 🔧 {b.service_name || '—'} · 📍 {b.city || '—'}
                    {b.technician_name && <> · 👷 {b.technician_name}</>}
                  </div>
                  {(b.appliance_brand || b.appliance_model) && (
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>🔩 {b.appliance_brand} {b.appliance_model}</div>
                  )}
                </div>
              ))}
            </div>
          )}
          {bookingResults.length === 0 && bookingSearch && !bookingSearching && (
            <div style={{ textAlign: 'center', color: '#94A3B8', padding: 24, fontSize: 13 }}>No bookings found</div>
          )}
        </Modal>
      )}

      {/* New quotation flow */}
      {createBooking && (
        <QuotationFromBookingModal
          booking={createBooking}
          onClose={() => setCreateBooking(null)}
          onDone={fetchList}
          userRole={userRole}
        />
      )}
    </div>
  )
}
