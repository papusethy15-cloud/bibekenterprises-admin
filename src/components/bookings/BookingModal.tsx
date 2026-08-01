/**
 * BookingModal.tsx — Premium Multi-Step Booking Wizard
 *
 * Steps:
 *  1. MOBILE    — enter mobile, find customer
 *  2. REGISTER  — new customer registration + default address (if not found)
 *  3. CUSTOMER  — customer preview + booking history + duplicate warning
 *  4. SERVICE   — domain → service search (+ add new service inline if missing)
 *  5. ADDRESS   — pick / add / edit address
 *  6. SCHEDULE  — date + slot availability
 *  7. EXTRAS    — appliance, priority, notes, coupon
 *  8. CONFIRM   — review & create booking
 */
import { todayIST } from '../../lib/tz'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  api, customersAPI, bookingsAPI, domainsAPI, servicesAPI,
  servicePricingAPI, couponsAPI,
} from '@/services/api'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'

// ─── Constants ────────────────────────────────────────────────────────────────
const SLOTS = [
  { value: '08:00-10:00', label: '8–10 AM'    },
  { value: '10:00-12:00', label: '10 AM–12 PM' },
  { value: '12:00-14:00', label: '12–2 PM'    },
  { value: '14:00-16:00', label: '2–4 PM'     },
  { value: '16:00-18:00', label: '4–6 PM'     },
  { value: '18:00-20:00', label: '6–8 PM'     },
]
const ACTIVE_ST = ['PENDING','CONFIRMED','ASSIGNED','ACCEPTED','EN_ROUTE','ARRIVED','INSPECTING','IN_PROGRESS','PENDING_VERIFICATION','TECHNICIAN_ACCEPTED','WORK_STARTED','WORK_PAUSED']
const STEPS = ['mobile','register','customer','service','address','schedule','extras','confirm'] as const
type StepId = typeof STEPS[number]

const STEP_LABELS: Record<StepId, string> = {
  mobile:   'Find Customer',
  register: 'Register',
  customer: 'Preview',
  service:  'Service',
  address:  'Address',
  schedule: 'Schedule',
  extras:   'Extras',
  confirm:  'Confirm',
}
// Steps shown in stepper (skip mobile/register — they are pre-steps)
const WIZARD_STEPS: StepId[] = ['customer','service','address','schedule','extras','confirm']

// ─── Helpers ─────────────────────────────────────────────────────────────────
const money = (n: number) => `₹${(n||0).toLocaleString('en-IN')}`
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Kolkata'})
const shortAddr = (a: any) => [a.address_line1, a.city, a.pincode].filter(Boolean).join(', ')

const statusBadge = (s: string) => {
  const active = ACTIVE_ST.includes(s)
  const done   = s === 'COMPLETED'
  const cancel = s === 'CANCELLED'
  return { bg: active?'#FEF3C7':done?'#DCFCE7':cancel?'#FEE2E2':'#F1F5F9',
           color: active?'#92400E':done?'#166534':cancel?'#991B1B':'#475569' }
}

const slotStyle = (n: number) =>
  n===0 ? { bg:'#DCFCE7',color:'#166534',dot:'#22C55E',label:'Free' }
  : n<=2 ? { bg:'#FEF3C7',color:'#92400E',dot:'#F59E0B',label:'Filling' }
  :        { bg:'#FEE2E2',color:'#991B1B',dot:'#EF4444',label:'Busy' }

// ─── Sub-components ───────────────────────────────────────────────────────────
const FieldErr = ({ msg }: { msg?: string }) =>
  msg ? <div style={{color:'#DC2626',fontSize:12,marginTop:4}}>{msg}</div> : null

const Banner = ({ type, children }: { type:'info'|'warn'|'success'|'error', children: React.ReactNode }) => {
  const cfg = {
    info:    { bg:'#EFF6FF',border:'#BFDBFE',color:'#1E40AF',icon:'ℹ️' },
    warn:    { bg:'#FFFBEB',border:'#FCD34D',color:'#92400E',icon:'⚠️' },
    success: { bg:'#F0FDF4',border:'#86EFAC',color:'#166534',icon:'✅' },
    error:   { bg:'#FEF2F2',border:'#FECACA',color:'#DC2626',icon:'❌' },
  }[type]
  return (
    <div style={{background:cfg.bg,border:`1px solid ${cfg.border}`,borderRadius:10,
      padding:'12px 16px',marginBottom:16,display:'flex',gap:10,alignItems:'flex-start'}}>
      <span style={{fontSize:18,lineHeight:1.2}}>{cfg.icon}</span>
      <div style={{fontSize:13,color:cfg.color,flex:1}}>{children}</div>
    </div>
  )
}

// Address form (reused in multiple steps)
const AddressForm = ({
  value, onChange, cities, saving, error, onSave, onCancel, submitLabel='Save Address',
}: {
  value: any; onChange: (f: any) => void; cities: any[]
  saving: boolean; error: string; onSave: () => void; onCancel?: () => void; submitLabel?: string
}) => {
  const set = (k: string, v: string) => onChange({ ...value, [k]: v })
  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
        <div style={{gridColumn:'1/-1'}}>
          <label style={LBL}>Address Line 1 *</label>
          <input className="input" placeholder="Flat/House no, Street" value={value.address_line1}
            onChange={e=>set('address_line1',e.target.value)} autoFocus />
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <label style={LBL}>Address Line 2 <span style={{fontWeight:400,color:'#94A3B8'}}>(landmark/area)</span></label>
          <input className="input" placeholder="Landmark, Colony, Area" value={value.address_line2}
            onChange={e=>set('address_line2',e.target.value)} />
        </div>
        <div>
          <label style={LBL}>City *</label>
          {cities.length>0 ? (
            <select className="input" value={value.city} onChange={e=>{
              const c = cities.find((x:any)=>x.name===e.target.value)
              onChange({...value, city:e.target.value, state:c?.state||value.state})
            }}>
              <option value="">Select city</option>
              {cities.map((c:any)=><option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          ) : (
            <input className="input" placeholder="City" value={value.city} onChange={e=>set('city',e.target.value)}/>
          )}
        </div>
        <div>
          <label style={LBL}>State *</label>
          <input className="input" placeholder="State" value={value.state} onChange={e=>set('state',e.target.value)}/>
        </div>
        <div>
          <label style={LBL}>Pincode *</label>
          <input className="input" placeholder="6-digit" maxLength={6} value={value.pincode}
            onChange={e=>set('pincode',e.target.value.replace(/\D/g,''))}/>
        </div>
        <div>
          <label style={LBL}>Label</label>
          <div style={{display:'flex',gap:6}}>
            {['Home','Work','Other'].map(l=>(
              <button key={l} onClick={()=>set('label',l)}
                style={{padding:'6px 12px',borderRadius:6,border:'1px solid',cursor:'pointer',fontSize:12,fontWeight:600,
                  borderColor:value.label===l?'#3B82F6':'#E2E8F0',
                  background:value.label===l?'#EFF6FF':'white',
                  color:value.label===l?'#1D4ED8':'#64748B'}}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
      {error && <div style={{background:'#FEE2E2',color:'#DC2626',padding:'8px 12px',borderRadius:6,fontSize:12,marginBottom:10}}>{error}</div>}
      <div style={{display:'flex',gap:8}}>
        <button className="btn btn-primary" onClick={onSave} disabled={saving}
          style={{background:'linear-gradient(135deg,#1D4ED8,#3B82F6)'}}>
          {saving ? <Spinner size="sm"/> : submitLabel}
        </button>
        {onCancel && <button className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>}
      </div>
    </div>
  )
}

const BLANK_ADDR = { label:'Home', address_line1:'', address_line2:'', city:'', state:'', pincode:'' }
const LBL: React.CSSProperties = { display:'block', fontSize:12, fontWeight:600, marginBottom:4, color:'#374151' }

// ─── Main component ───────────────────────────────────────────────────────────
interface BookingModalProps {
  customer?:   any
  addresses?:  any[]
  appliances?: any[]
  onClose: () => void
  onDone:  () => void
}

export default function BookingModal({
  customer:   initCustomer   = null,
  addresses:  initAddresses  = [],
  appliances: initAppliances = [],
  onClose,
  onDone,
}: BookingModalProps) {

  // ── Step state ──
  const [step, setStep] = useState<StepId>(initCustomer ? 'customer' : 'mobile')

  // ── Step 1: mobile lookup ──
  const [mobile,     setMobile]     = useState('')
  const [checking,   setChecking]   = useState(false)
  const [mobileErr,  setMobileErr]  = useState('')
  const [searchedMobile, setSearchedMobile] = useState('')

  // ── Step 2: register ──
  const [regForm, setRegForm] = useState({ name:'', email:'', alternate_mobile:'', notes:'' })
  const [regSaving, setRegSaving] = useState(false)
  const [regErr,    setRegErr]    = useState('')
  const [regStep, setRegStep] = useState<'info'|'address'>('info')  // sub-steps within register
  const [regAddrForm, setRegAddrForm] = useState({ ...BLANK_ADDR })
  const [regAddrSaving, setRegAddrSaving] = useState(false)
  const [regAddrErr,    setRegAddrErr]    = useState('')

  // ── Customer ──
  const [customer,   setCustomer]   = useState<any>(initCustomer)
  const [addresses,  setAddresses]  = useState<any[]>(initAddresses)
  const [appliances, setAppliances] = useState<any[]>(initAppliances)
  const [recentBkgs, setRecentBkgs] = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(false)

  // ── Step: service ──
  const [domains,    setDomains]    = useState<any[]>([])
  const [domainId,   setDomainId]   = useState('')
  const [allSvcs,    setAllSvcs]    = useState<any[]>([])
  const [svcSearch,  setSvcSearch]  = useState('')
  const [loadSvc,    setLoadSvc]    = useState(false)
  const [selSvc,     setSelSvc]     = useState<any>(null)
  const [cityPrices, setCityPrices] = useState<any[]>([])
  const [loadPrice,  setLoadPrice]  = useState(false)
  // Add new service inline
  const [showAddSvc,   setShowAddSvc]   = useState(false)
  const [categories,   setCategories]   = useState<any[]>([])
  const [newSvcForm,   setNewSvcForm]   = useState({ name:'', category_id:'', base_price:'', gst_percent:'', description:'' })
  const [newSvcSaving, setNewSvcSaving] = useState(false)
  const [newSvcErr,    setNewSvcErr]    = useState('')

  // ── Step: address ──
  const [selAddrId, setSelAddrId] = useState('')
  const [showAddAddr, setShowAddAddr] = useState(false)
  const [editAddrId,  setEditAddrId]  = useState<string|null>(null)
  const [addrForm,    setAddrForm]    = useState({ ...BLANK_ADDR })
  const [addrSaving,  setAddrSaving]  = useState(false)
  const [addrErr,     setAddrErr]     = useState('')

  // ── Step: schedule ──
  const [schedDate,    setSchedDate]    = useState('')
  const [schedSlot,    setSchedSlot]    = useState('')
  const [slotCounts,   setSlotCounts]   = useState<Record<string,number>>({})
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotFetched,  setSlotFetched]  = useState('')

  // ── Step: extras ──
  const [applianceId, setApplianceId] = useState('')
  const [priority,    setPriority]    = useState('NORMAL')
  const [notes,       setNotes]       = useState('')
  const [couponCode,  setCouponCode]  = useState('')
  const [couponResult, setCouponResult] = useState<any>(null)
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponErr,   setCouponErr]   = useState('')

  // ── Booking submit ──
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')
  const [created, setCreated] = useState<any[]>([])
  const [forcedup, setForcedup] = useState(false)
  const [showForce, setShowForce] = useState(false)

  // ── Cities ──
  const [cities, setCities] = useState<any[]>([])

  const mobileRef = useRef<HTMLInputElement>(null)

  // ── Derived ──
  const selAddr      = addresses.find(a=>a.id===selAddrId)
  const cityPrice    = selAddr ? cityPrices.find(cp=>cp.city_name?.toLowerCase()===selAddr.city?.toLowerCase()) : null
  const basePrice    = selSvc?.base_price ?? 0
  const effectiveP   = cityPrice ? cityPrice.price : basePrice
  const gstPct       = selSvc?.gst_percent ?? 0
  const gstAmt       = Math.round(effectiveP * gstPct / 100)
  const subtotal     = Math.round(effectiveP + gstAmt)
  const discount     = couponResult?.discount_amount ?? 0
  const totalPrice   = Math.max(0, subtotal - discount)
  const selAppl      = appliances.find(a=>a.id===applianceId)
  const activeBkgs   = recentBkgs.filter(b=>ACTIVE_ST.includes(b.status))
  const filteredSvcs = svcSearch.trim()
    ? allSvcs.filter((s:any)=>(s.name||s.service_name||'').toLowerCase().includes(svcSearch.toLowerCase()) || (s.category_name||'').toLowerCase().includes(svcSearch.toLowerCase()))
    : allSvcs

  // ── Load on mount ──
  useEffect(() => {
    domainsAPI.list().then(r=>setDomains(r.data.data?.items||r.data.data||[])).catch(()=>{})
    api.get('/cities?limit=200').then((r:any)=>setCities(r.data?.data?.items??r.data?.data??[])).catch(()=>{})
    servicesAPI.categories().then(r=>setCategories(r.data?.data?.items||r.data?.data||[])).catch(()=>{})
  }, [])

  // ── Load services on domain change ──
  useEffect(() => {
    if (!domainId) { setAllSvcs([]); setSelSvc(null); setSvcSearch(''); return }
    setLoadSvc(true)
    domainsAPI.services(domainId)
      .then(r=>setAllSvcs(r.data.data?.items||r.data.data||[]))
      .catch(()=>setAllSvcs([]))
      .finally(()=>setLoadSvc(false))
    setSelSvc(null); setSvcSearch(''); setShowForce(false); setForcedup(false)
  }, [domainId])

  // ── Load city prices on service change ──
  useEffect(() => {
    if (!selSvc) { setCityPrices([]); return }
    setLoadPrice(true)
    servicePricingAPI.cityPrices(selSvc.service_id||selSvc.id)
      .then(r=>setCityPrices(r.data.data||[]))
      .catch(()=>setCityPrices([]))
      .finally(()=>setLoadPrice(false))
  }, [selSvc])

  // ── Fetch slots on date change ──
  const fetchSlots = useCallback(async (date: string) => {
    if (!date) { setSlotCounts({}); return }
    setLoadingSlots(true)
    try {
      const r = await bookingsAPI.slotSummary(date)
      setSlotCounts(r.data?.data?.slot_counts||{})
      setSlotFetched(date)
    } catch { setSlotCounts({}) }
    finally { setLoadingSlots(false) }
  }, [])

  useEffect(() => {
    if (schedDate && schedDate !== slotFetched) fetchSlots(schedDate)
  }, [schedDate, fetchSlots, slotFetched])

  // ── Auto-select default address ──
  useEffect(() => {
    if (addresses.length > 0 && !selAddrId) {
      const def = addresses.find((a:any)=>a.is_default) || addresses[0]
      setSelAddrId(def.id)
    }
  }, [addresses])

  // ─── Step navigation ──────────────────────────────────────────────────────
  const go = (s: StepId) => { setErr(''); setStep(s) }

  // ─── Mobile lookup ────────────────────────────────────────────────────────
  const checkMobile = async () => {
    const m = mobile.trim()
    if (m.length < 10) { setMobileErr('Enter a valid 10-digit mobile number'); return }
    setChecking(true); setMobileErr(''); setSearchedMobile(m)
    try {
      const r = await customersAPI.checkMobile(m)
      const cust = r.data.data
      if (!cust) { go('register'); return }
      setCustomer(cust)
      setLoadingData(true)
      const [aR, apR, bR] = await Promise.all([
        customersAPI.addresses(cust.id),
        customersAPI.appliances(cust.id),
        customersAPI.bookings(cust.id),
      ])
      setAddresses(aR.data.data||[])
      setAppliances(apR.data.data||[])
      const allB: any[] = bR.data.data?.items||bR.data.data||[]
      setRecentBkgs([...allB].sort((a,b)=>{
        const aA = ACTIVE_ST.includes(a.status)?1:0
        const bA = ACTIVE_ST.includes(b.status)?1:0
        return bA!==aA ? bA-aA : new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime()
      }).slice(0,8))
      go('customer')
    } catch { setMobileErr('Error looking up customer. Please try again.') }
    finally { setChecking(false); setLoadingData(false) }
  }

  // ─── Register new customer ────────────────────────────────────────────────
  const handleRegister = async () => {
    if (!regForm.name.trim()) { setRegErr('Customer name is required'); return }
    setRegSaving(true); setRegErr('')
    try {
      const payload: any = { name: regForm.name.trim(), mobile: searchedMobile }
      if (regForm.email.trim()) payload.email = regForm.email.trim()
      if (regForm.alternate_mobile.trim()) payload.alternate_mobile = regForm.alternate_mobile.trim()
      if (regForm.notes.trim()) payload.notes = regForm.notes.trim()
      const res = await customersAPI.create(payload)
      setCustomer(res.data.data)
      setAddresses([]); setAppliances([]); setRecentBkgs([])
      setRegStep('address')
    } catch (ex: any) {
      const d = ex.response?.data?.detail
      setRegErr(Array.isArray(d) ? d.map((x:any)=>x.msg||'').join('; ') : (d||'Failed to create customer'))
    } finally { setRegSaving(false) }
  }

  const handleRegAddr = async () => {
    if (!regAddrForm.address_line1.trim()||!regAddrForm.city.trim()||!regAddrForm.state.trim()||!regAddrForm.pincode.trim()) {
      setRegAddrErr('Address line, city, state and pincode are required'); return
    }
    if (!customer) return
    setRegAddrSaving(true); setRegAddrErr('')
    try {
      await customersAPI.addAddress(customer.id, { ...regAddrForm, is_default: true })
      const aR = await customersAPI.addresses(customer.id)
      setAddresses(aR.data.data||[])
      go('customer')
    } catch (ex: any) {
      setRegAddrErr(ex.response?.data?.detail||'Failed to save address')
    } finally { setRegAddrSaving(false) }
  }

  // ─── Address CRUD ─────────────────────────────────────────────────────────
  const saveAddress = async () => {
    if (!addrForm.address_line1.trim()||!addrForm.city.trim()||!addrForm.state.trim()||!addrForm.pincode.trim()) {
      setAddrErr('Address line, city, state and pincode are required'); return
    }
    if (!customer) return
    setAddrSaving(true); setAddrErr('')
    try {
      if (editAddrId) {
        await customersAPI.updateAddress(customer.id, editAddrId, addrForm)
      } else {
        await customersAPI.addAddress(customer.id, { ...addrForm, is_default: addresses.length === 0 })
      }
      const aR = await customersAPI.addresses(customer.id)
      const newAddrs = aR.data.data||[]
      setAddresses(newAddrs)
      if (!selAddrId && newAddrs.length>0) setSelAddrId(newAddrs[0].id)
      setShowAddAddr(false); setEditAddrId(null)
      setAddrForm({ ...BLANK_ADDR }); setAddrErr('')
    } catch (ex: any) {
      setAddrErr(ex.response?.data?.detail||'Failed to save address')
    } finally { setAddrSaving(false) }
  }

  const startEditAddr = (a: any) => {
    setEditAddrId(a.id)
    setAddrForm({ label:a.label||'Home', address_line1:a.address_line1||'', address_line2:a.address_line2||'', city:a.city||'', state:a.state||'', pincode:a.pincode||'' })
    setShowAddAddr(true); setAddrErr('')
  }

  // ─── Add new service inline ───────────────────────────────────────────────
  const handleAddNewService = async () => {
    if (!newSvcForm.name.trim()) { setNewSvcErr('Service name is required'); return }
    if (!newSvcForm.base_price) { setNewSvcErr('Base price is required'); return }
    setNewSvcSaving(true); setNewSvcErr('')
    try {
      const payload: any = {
        name: newSvcForm.name.trim(),
        base_price: parseFloat(newSvcForm.base_price),
        gst_percent: parseFloat(newSvcForm.gst_percent)||0,
        description: newSvcForm.description.trim()||undefined,
        category_id: newSvcForm.category_id||undefined,
        is_active: true,
      }
      const svcRes = await servicesAPI.create(payload)
      const newSvc = svcRes.data.data
      // Link to selected domain
      if (domainId) {
        await domainsAPI.linkService(domainId, { service_id: newSvc.id })
        // Refresh domain services
        const svcListR = await domainsAPI.services(domainId)
        setAllSvcs(svcListR.data.data?.items||svcListR.data.data||[])
      }
      // Auto-select the new service
      const mapped = { ...newSvc, service_id: newSvc.id, service_name: newSvc.name }
      setSelSvc(mapped)
      setSvcSearch(newSvc.name)
      setShowAddSvc(false)
      setNewSvcForm({ name:'', category_id:'', base_price:'', gst_percent:'', description:'' })
      setNewSvcErr('')
    } catch (ex: any) {
      setNewSvcErr(ex.response?.data?.detail||'Failed to create service')
    } finally { setNewSvcSaving(false) }
  }

  // ─── Coupon validation ────────────────────────────────────────────────────
  const applyCoupon = async () => {
    if (!couponCode.trim()) return
    setCouponLoading(true); setCouponErr(''); setCouponResult(null)
    try {
      const r = await couponsAPI.validate({
        code: couponCode.trim().toUpperCase(),
        service_id: selSvc?.service_id||selSvc?.id,
        order_amount: subtotal,
        customer_mobile: customer?.mobile,
      })
      const data = r.data?.data
      if (data?.valid) {
        setCouponResult(data)
      } else {
        setCouponErr(data?.message||'Coupon is not valid')
      }
    } catch (ex: any) {
      setCouponErr(ex.response?.data?.detail||'Invalid coupon code')
    } finally { setCouponLoading(false) }
  }

  // ─── Create booking ───────────────────────────────────────────────────────
  const handleCreate = async () => {
    setErr('')
    if (!selSvc)      { setErr('Please select a service');          return }
    if (!selAddrId)   { setErr('Please select a service address');  return }
    if (!schedDate)   { setErr('Please select a scheduled date');   return }
    setSaving(true)
    try {
      const payload: any = {
        customer_id:    customer.id,
        service_id:     selSvc.service_id||selSvc.id,
        address_id:     selAddrId,
        scheduled_date: schedDate + 'T00:00:00',
        scheduled_slot: schedSlot||undefined,
        notes:          notes||undefined,
        priority,
        source:         'CALL_CENTER',
        domain_id:      domainId||undefined,
        city_id:        cityPrice?.city_id||undefined,
        city:           cityPrice?.city_name||selAddr?.city||undefined,
        force_duplicate: forcedup,
        coupon_code:    couponResult ? couponCode.trim().toUpperCase() : undefined,
        coupon_discount: couponResult?.discount_amount||undefined,
      }
      if (selAppl) {
        payload.appliance_brand = selAppl.brand_name||selAppl.category||undefined
        payload.appliance_model = selAppl.model||undefined
        payload.appliance_id    = selAppl.id||undefined
      }
      const res = await bookingsAPI.create(payload)
      const b = res.data.data
      setCreated(prev=>[...prev, b])
      // Reset booking fields for next booking
      setSelSvc(null); setSvcSearch(''); setSchedDate(''); setSchedSlot('')
      setApplianceId(''); setNotes(''); setPriority('NORMAL')
      setCouponCode(''); setCouponResult(null); setCouponErr('')
      setShowForce(false); setForcedup(false); setSlotCounts({}); setSlotFetched('')
      setDomainId(''); setErr('')
      go('service')
    } catch (ex: any) {
      const detail: string = ex.response?.data?.detail||''
      if (detail.startsWith('DUPLICATE:')) {
        const [,bkNum,bkStatus,catName] = detail.split(':')
        const catMsg = catName ? ` in "${catName}"` : ''
        setErr(`Duplicate blocked: Booking ${bkNum} (${bkStatus}) is already active${catMsg} at this address. Force-create or use a different address.`)
        setShowForce(true)
      } else {
        setErr(detail||'Failed to create booking')
      }
    } finally { setSaving(false) }
  }

  const resetAll = () => {
    setStep('mobile'); setCustomer(null); setAddresses([]); setAppliances([]); setRecentBkgs([])
    setMobile(''); setSearchedMobile(''); setMobileErr('')
    setRegForm({name:'',email:'',alternate_mobile:'',notes:''}); setRegErr(''); setRegStep('info')
    setRegAddrForm({...BLANK_ADDR}); setRegAddrErr('')
    setDomainId(''); setAllSvcs([]); setSelSvc(null); setSvcSearch(''); setCityPrices([])
    setSelAddrId(''); setSchedDate(''); setSchedSlot(''); setSlotCounts({}); setSlotFetched('')
    setApplianceId(''); setPriority('NORMAL'); setNotes('')
    setCouponCode(''); setCouponResult(null); setCouponErr('')
    setErr(''); setShowForce(false); setForcedup(false)
  }

  // ─── Stepper ──────────────────────────────────────────────────────────────
  const wizardIdx   = WIZARD_STEPS.indexOf(step)
  const showStepper = wizardIdx >= 0

  const StepIndicator = () => (
    <div style={{display:'flex',alignItems:'center',gap:0,marginBottom:24,padding:'0 4px'}}>
      {WIZARD_STEPS.map((s,i)=>{
        const done    = wizardIdx > i
        const current = wizardIdx === i
        const future  = wizardIdx < i
        return (
          <div key={s} style={{display:'flex',alignItems:'center',flex:i<WIZARD_STEPS.length-1?1:'initial'}}>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
              <div onClick={()=>done ? go(s) : undefined} style={{
                width:28,height:28,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:11,fontWeight:700,cursor:done?'pointer':'default',transition:'all 0.2s',
                background:done?'#16A34A':current?'linear-gradient(135deg,#1D4ED8,#3B82F6)':'#E5E7EB',
                color:done||current?'white':'#9CA3AF',
                boxShadow:current?'0 2px 8px rgba(59,130,246,0.4)':'none',
              }}>
                {done ? '✓' : i+1}
              </div>
              <div style={{fontSize:9,marginTop:3,fontWeight:600,color:current?'#1D4ED8':done?'#16A34A':'#9CA3AF',
                whiteSpace:'nowrap',letterSpacing:0.3}}>
                {STEP_LABELS[s].toUpperCase()}
              </div>
            </div>
            {i < WIZARD_STEPS.length-1 && (
              <div style={{flex:1,height:2,margin:'0 4px',marginTop:-12,
                background:done?'#16A34A':'#E5E7EB',transition:'background 0.3s'}}/>
            )}
          </div>
        )
      })}
    </div>
  )

  // ─── Nav bar ──────────────────────────────────────────────────────────────
  const NavBar = ({ onBack, onNext, nextLabel='Continue →', nextDisabled=false, nextLoading=false }:
    { onBack?:()=>void; onNext?:()=>void; nextLabel?:string; nextDisabled?:boolean; nextLoading?:boolean }) => (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
      marginTop:24,paddingTop:16,borderTop:'1px solid #F1F5F9'}}>
      <div>
        {onBack && <button className="btn btn-secondary" onClick={onBack}>← Back</button>}
      </div>
      <div style={{display:'flex',gap:10,alignItems:'center'}}>
        {created.length>0 && (
          <button className="btn btn-secondary" onClick={()=>{onDone();onClose()}}>
            ✓ Done ({created.length} created)
          </button>
        )}
        {onNext && (
          <button className="btn btn-primary" onClick={onNext} disabled={nextDisabled||nextLoading}
            style={{background:'linear-gradient(135deg,#1D4ED8,#3B82F6)',minWidth:130,
              opacity:nextDisabled?0.5:1}}>
            {nextLoading ? <Spinner size="sm"/> : nextLabel}
          </button>
        )}
      </div>
    </div>
  )

  // ─── RENDER ───────────────────────────────────────────────────────────────
  const modalTitle =
    step==='mobile'   ? 'New Booking — Find Customer' :
    step==='register' ? 'New Booking — Register Customer' :
    customer          ? `Booking — ${customer.name}` : 'New Booking'

  return (
    <Modal title={modalTitle} onClose={onClose} size="xl">
      {/* Stepper */}
      {showStepper && <StepIndicator/>}

      {/* Created sessions banner */}
      {created.length>0 && showStepper && (
        <div style={{background:'linear-gradient(135deg,#F0FDF4,#DCFCE7)',border:'1px solid #86EFAC',
          borderRadius:10,padding:'10px 16px',marginBottom:16,display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:20}}>🎉</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:13,color:'#166534'}}>
              {created.length} Booking{created.length>1?'s':''} Created This Session
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:4}}>
              {created.map(b=>(
                <span key={b.id} style={{fontSize:11,background:'white',color:'#166534',
                  padding:'2px 8px',borderRadius:12,fontWeight:600,border:'1px solid #86EFAC'}}>
                  #{b.booking_number}
                </span>
              ))}
            </div>
          </div>
          <button className="btn" onClick={()=>{onDone();onClose()}}
            style={{background:'#16A34A',color:'white',fontSize:12,padding:'6px 14px'}}>
            Done
          </button>
        </div>
      )}

      {/* ══ STEP: MOBILE ══════════════════════════════════════════════════════ */}
      {step==='mobile' && (
        <div>
          <div style={{maxWidth:480,margin:'0 auto',paddingTop:8}}>
            <div style={{textAlign:'center',marginBottom:32}}>
              <div style={{width:64,height:64,borderRadius:'50%',background:'linear-gradient(135deg,#EFF6FF,#DBEAFE)',
                margin:'0 auto 16px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28}}>
                📱
              </div>
              <div style={{fontSize:18,fontWeight:700,color:'#0F172A',marginBottom:6}}>
                Find Customer
              </div>
              <div style={{fontSize:13,color:'#64748B'}}>
                Enter the customer's mobile number to look up their profile & booking history
              </div>
            </div>

            <div style={{position:'relative',marginBottom:16}}>
              <div style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',fontSize:18,color:'#94A3B8'}}>
                📞
              </div>
              <input
                ref={mobileRef}
                className="input" type="tel" placeholder="10-digit mobile number"
                maxLength={10} autoFocus value={mobile}
                onChange={e=>{ setMobile(e.target.value.replace(/\D/g,'')); setMobileErr('') }}
                onKeyDown={e=>e.key==='Enter'&&checkMobile()}
                style={{paddingLeft:44,fontSize:18,fontWeight:700,letterSpacing:2,height:52,
                  border:mobileErr?'2px solid #EF4444':'2px solid #E2E8F0',
                  borderRadius:10,textAlign:'center'}}
              />
            </div>

            {mobileErr && (
              <div style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:8,
                padding:'8px 14px',fontSize:13,color:'#DC2626',marginBottom:12,textAlign:'center'}}>
                {mobileErr}
              </div>
            )}

            <button
              className="btn btn-primary" onClick={checkMobile}
              disabled={checking || mobile.length<10}
              style={{width:'100%',height:48,fontSize:15,fontWeight:700,borderRadius:10,
                background:'linear-gradient(135deg,#1D4ED8,#3B82F6)',
                boxShadow:'0 4px 12px rgba(59,130,246,0.3)',
                opacity:mobile.length<10?0.5:1}}>
              {checking ? <><Spinner size="sm"/> &nbsp;Looking up...</> : '🔍 Find Customer'}
            </button>

            <div style={{marginTop:20,background:'#F8FAFC',borderRadius:10,padding:'14px 16px',fontSize:12,color:'#64748B'}}>
              <div style={{fontWeight:700,color:'#374151',marginBottom:6}}>How it works</div>
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                {['Enter mobile → existing customer found → proceed to booking',
                  'Mobile not found → register new customer → add address → book',
                  'Duplicate check prevents double-booking for same service & address',
                ].map((t,i)=>(
                  <div key={i} style={{display:'flex',gap:6}}>
                    <span style={{color:'#3B82F6',fontWeight:700}}>→</span> {t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ STEP: REGISTER ════════════════════════════════════════════════════ */}
      {step==='register' && (
        <div>
          {regStep==='info' && (
            <div>
              <Banner type="info">
                <strong>New Customer</strong> — No account found for{' '}
                <span style={{fontFamily:'monospace',fontWeight:700,fontSize:14}}>{searchedMobile}</span>.
                Fill in the details below to register.
              </Banner>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                <div style={{gridColumn:'1/-1'}}>
                  <label style={LBL}>Full Name *</label>
                  <input className="input" placeholder="Customer's full name" autoFocus
                    value={regForm.name} onChange={e=>setRegForm(f=>({...f,name:e.target.value}))}/>
                </div>
                <div>
                  <label style={LBL}>Mobile (auto-filled)</label>
                  <input className="input" value={searchedMobile} readOnly
                    style={{background:'#F8FAFC',color:'#64748B',fontWeight:700}}/>
                </div>
                <div>
                  <label style={LBL}>Alt. Mobile <span style={{fontWeight:400,color:'#94A3B8'}}>(optional)</span></label>
                  <input className="input" type="tel" maxLength={10} placeholder="Alternate number"
                    value={regForm.alternate_mobile}
                    onChange={e=>setRegForm(f=>({...f,alternate_mobile:e.target.value.replace(/\D/g,'')}))}/>
                </div>
                <div style={{gridColumn:'1/-1'}}>
                  <label style={LBL}>Email <span style={{fontWeight:400,color:'#94A3B8'}}>(optional)</span></label>
                  <input className="input" type="email" placeholder="customer@email.com"
                    value={regForm.email} onChange={e=>setRegForm(f=>({...f,email:e.target.value}))}/>
                </div>
                <div style={{gridColumn:'1/-1'}}>
                  <label style={LBL}>Notes <span style={{fontWeight:400,color:'#94A3B8'}}>(optional)</span></label>
                  <input className="input" placeholder="Internal notes (e.g. VIP, referred by...)"
                    value={regForm.notes} onChange={e=>setRegForm(f=>({...f,notes:e.target.value}))}/>
                </div>
              </div>

              {regErr && <Banner type="error">{regErr}</Banner>}

              <NavBar
                onBack={()=>{ go('mobile'); setRegForm({name:'',email:'',alternate_mobile:'',notes:''}); setRegErr('') }}
                onNext={handleRegister}
                nextLabel="Register & Add Address →"
                nextLoading={regSaving}
              />
            </div>
          )}

          {regStep==='address' && customer && (
            <div>
              <Banner type="success">
                <strong>{customer.name}</strong> registered successfully! &nbsp;
                <span style={{opacity:.8}}>Code: {customer.customer_code} · {customer.mobile}</span>
              </Banner>

              <div style={{fontWeight:700,fontSize:14,color:'#374151',marginBottom:14}}>
                📍 Add Service Address <span style={{fontWeight:400,fontSize:12,color:'#94A3B8'}}>(required to book)</span>
              </div>

              <AddressForm
                value={regAddrForm}
                onChange={setRegAddrForm}
                cities={cities}
                saving={regAddrSaving}
                error={regAddrErr}
                onSave={handleRegAddr}
                submitLabel="Save Address & Continue →"
              />
            </div>
          )}
        </div>
      )}

      {/* ══ STEP: CUSTOMER PREVIEW ════════════════════════════════════════════ */}
      {step==='customer' && customer && (
        <div>
          {/* Customer card */}
          <div style={{background:'linear-gradient(135deg,#EFF6FF,#DBEAFE)',border:'1px solid #BFDBFE',
            borderRadius:12,padding:'16px 20px',marginBottom:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
              <div style={{display:'flex',gap:12,alignItems:'center'}}>
                <div style={{width:44,height:44,borderRadius:'50%',background:'linear-gradient(135deg,#1D4ED8,#3B82F6)',
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:700,color:'white'}}>
                  {customer.name?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <div style={{fontWeight:800,fontSize:16,color:'#1E40AF'}}>{customer.name}</div>
                  <div style={{fontSize:13,color:'#3B82F6'}}>📱 {customer.mobile}</div>
                  {customer.email && <div style={{fontSize:12,color:'#60A5FA'}}>✉ {customer.email}</div>}
                </div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:10,color:'#60A5FA',fontWeight:600,letterSpacing:0.5,marginBottom:3}}>CUSTOMER CODE</div>
                <div style={{fontFamily:'monospace',fontWeight:800,color:'#1E40AF',background:'white',
                  padding:'4px 10px',borderRadius:6,fontSize:13,boxShadow:'0 1px 4px rgba(0,0,0,0.08)'}}>
                  {customer.customer_code}
                </div>
              </div>
            </div>
            <div style={{display:'flex',gap:20,flexWrap:'wrap',borderTop:'1px solid rgba(59,130,246,0.2)',paddingTop:12}}>
              {[
                {label:'Total Bookings',value:customer.total_bookings||recentBkgs.length,icon:'📋'},
                {label:'Addresses',value:addresses.length,icon:'📍'},
                {label:'Appliances',value:appliances.length,icon:'🔧'},
                {label:'Active',value:activeBkgs.length,icon:'🟡'},
              ].map(s=>(
                <div key={s.label}>
                  <div style={{fontSize:10,color:'#60A5FA',fontWeight:600}}>{s.icon} {s.label}</div>
                  <div style={{fontWeight:800,fontSize:16,color:'#1E40AF'}}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Active booking warning */}
          {activeBkgs.length>0 && (
            <Banner type="warn">
              <strong>🟠 {activeBkgs.length} Active Booking{activeBkgs.length>1?'s':''}</strong>
              <div style={{marginTop:4,fontSize:12}}>
                Same service category + same address = <strong>duplicate block</strong>.
                Different category or different address is always allowed.
              </div>
              <div style={{marginTop:6,display:'flex',flexWrap:'wrap',gap:6}}>
                {activeBkgs.map(b=>(
                  <span key={b.id} style={{fontSize:11,background:'#FEF3C7',color:'#92400E',
                    padding:'2px 8px',borderRadius:10,fontWeight:600,border:'1px solid #FCD34D'}}>
                    #{b.booking_number} · {b.status}
                  </span>
                ))}
              </div>
            </Banner>
          )}

          {/* Recent bookings */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:700,color:'#374151',marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
              Recent Bookings
              <span style={{fontSize:11,fontWeight:500,color:'#94A3B8'}}>({recentBkgs.length} shown)</span>
            </div>
            {loadingData ? (
              <div style={{textAlign:'center',padding:20}}><Spinner/></div>
            ) : recentBkgs.length===0 ? (
              <Banner type="success">
                No booking history — this will be the customer's <strong>first booking</strong>.
              </Banner>
            ) : (
              <div style={{border:'1px solid #E2E8F0',borderRadius:10,overflow:'hidden'}}>
                {recentBkgs.map((b:any,i:number)=>{
                  const sc = statusBadge(b.status)
                  const isActive = ACTIVE_ST.includes(b.status)
                  return (
                    <div key={b.id} style={{
                      padding:'11px 14px',
                      borderBottom:i<recentBkgs.length-1?'1px solid #F1F5F9':'none',
                      background:isActive?'#FFFBEB':'white',
                      borderLeft:`3px solid ${isActive?'#F59E0B':'transparent'}`,
                    }}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <span style={{fontWeight:700,fontSize:12,fontFamily:'monospace',color:isActive?'#92400E':'#0F172A'}}>
                            #{b.booking_number||b.id?.slice(0,8)}
                          </span>
                          <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:10,
                            background:sc.bg,color:sc.color}}>{b.status}</span>
                          {isActive && <span style={{fontSize:10,color:'#F59E0B'}}>⚡ Active</span>}
                        </div>
                        <span style={{fontWeight:700,fontSize:12,color:'#059669'}}>{money(b.total_amount||0)}</span>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#64748B'}}>
                        <span>🔧 {b.service_name||b.domain_name||'—'}</span>
                        <span>{b.scheduled_date?fmtDate(b.scheduled_date):'—'}</span>
                      </div>
                      {b.address_str&&b.address_str!=='—'&&(
                        <div style={{fontSize:11,color:'#94A3B8',marginTop:2}}>📍 {b.address_str}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* No address warning */}
          {addresses.length===0 && (
            <Banner type="warn">
              <strong>No saved addresses.</strong> You'll be prompted to add one in the next step.
            </Banner>
          )}

          <NavBar
            onBack={resetAll}
            onNext={()=>go('service')}
            nextLabel="Continue — Select Service →"
          />
        </div>
      )}

      {/* ══ STEP: SERVICE ═════════════════════════════════════════════════════ */}
      {step==='service' && (
        <div>
          {/* Domain selector */}
          <div style={{marginBottom:16}}>
            <label style={{...LBL,fontSize:13}}>Business / Domain *</label>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:8}}>
              {domains.map((d:any)=>(
                <div key={d.id} onClick={()=>setDomainId(d.id)}
                  style={{padding:'12px 14px',borderRadius:10,cursor:'pointer',border:'2px solid',
                    borderColor:domainId===d.id?'#3B82F6':'#E2E8F0',
                    background:domainId===d.id?'linear-gradient(135deg,#EFF6FF,#DBEAFE)':'white',
                    transition:'all 0.15s',boxShadow:domainId===d.id?'0 2px 8px rgba(59,130,246,0.2)':'none'}}>
                  <div style={{fontWeight:700,fontSize:13,color:domainId===d.id?'#1D4ED8':'#0F172A'}}>{d.name}</div>
                  {d.city&&<div style={{fontSize:11,color:'#94A3B8',marginTop:2}}>{d.city}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Service search */}
          <div style={{marginBottom:8}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <label style={{...LBL,fontSize:13,marginBottom:0}}>
                Service *
                {allSvcs.length>0&&<span style={{fontWeight:400,color:'#94A3B8',marginLeft:6,fontSize:12}}>({allSvcs.length} in domain)</span>}
              </label>
            </div>

            {!domainId ? (
              <div style={{padding:'14px',background:'#F8FAFC',borderRadius:8,fontSize:13,color:'#94A3B8',textAlign:'center'}}>
                ← Select a domain first to see available services
              </div>
            ) : loadSvc ? (
              <div style={{textAlign:'center',padding:20}}><Spinner/></div>
            ) : (
              <div>
                <div style={{position:'relative'}}>
                  <div style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',fontSize:14,color:'#94A3B8'}}>🔍</div>
                  <input className="input" placeholder={`Search ${allSvcs.length} services...`}
                    value={svcSearch}
                    onChange={e=>{ setSvcSearch(e.target.value); if(!e.target.value){setSelSvc(null)} }}
                    style={{paddingLeft:34}}/>
                </div>

                {/* Dropdown */}
                {svcSearch && !selSvc && (
                  <div style={{border:'1px solid #E2E8F0',borderRadius:8,marginTop:4,maxHeight:220,overflowY:'auto',
                    boxShadow:'0 4px 16px rgba(0,0,0,0.1)'}}>
                    {filteredSvcs.length===0 ? (
                      <div style={{padding:'16px',textAlign:'center'}}>
                        <div style={{color:'#64748B',fontSize:13,marginBottom:10}}>
                          No service found for "<strong>{svcSearch}</strong>"
                        </div>
                        <button className="btn btn-primary" onClick={()=>{ setNewSvcForm(f=>({...f,name:svcSearch})); setShowAddSvc(true) }}
                          style={{fontSize:12,background:'linear-gradient(135deg,#059669,#10B981)'}}>
                          + Add "{svcSearch}" as New Service
                        </button>
                      </div>
                    ) : (
                      filteredSvcs.map((s:any)=>(
                        <div key={s.service_id||s.id}
                          onClick={()=>{ setSelSvc(s); setSvcSearch(s.name||s.service_name||'') }}
                          style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid #F1F5F9',fontSize:13,
                            transition:'background 0.1s'}}
                          onMouseEnter={e=>(e.currentTarget.style.background='#EFF6FF')}
                          onMouseLeave={e=>(e.currentTarget.style.background='white')}>
                          <div style={{fontWeight:600,color:'#0F172A'}}>{s.name||s.service_name}</div>
                          <div style={{fontSize:11,color:'#94A3B8',marginTop:2}}>
                            {s.category_name&&<span>{s.category_name} · </span>}
                            <span style={{fontWeight:600,color:'#059669'}}>{s.base_price?`₹${s.base_price}`:'Price varies'}</span>
                            {s.gst_percent?<span> + {s.gst_percent}% GST</span>:''}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Selected service chip */}
                {selSvc && (
                  <div style={{marginTop:8,background:'linear-gradient(135deg,#F0FDF4,#DCFCE7)',
                    border:'1px solid #86EFAC',borderRadius:8,padding:'10px 14px',display:'flex',
                    justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:13,color:'#166534'}}>✓ {selSvc.name||selSvc.service_name}</div>
                      <div style={{fontSize:11,color:'#15803D'}}>
                        {selSvc.category_name&&<span>{selSvc.category_name} · </span>}
                        Base ₹{selSvc.base_price||0}{selSvc.gst_percent?` + ${selSvc.gst_percent}% GST`:''}
                      </div>
                    </div>
                    <button onClick={()=>{ setSelSvc(null); setSvcSearch('') }}
                      style={{background:'none',border:'none',cursor:'pointer',color:'#94A3B8',fontSize:16,padding:4}}>✕</button>
                  </div>
                )}

                {/* No search yet — show grid of all services */}
                {!svcSearch && !selSvc && allSvcs.length>0 && (
                  <div style={{marginTop:8,display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:6,maxHeight:200,overflowY:'auto'}}>
                    {allSvcs.map((s:any)=>(
                      <div key={s.service_id||s.id}
                        onClick={()=>{ setSelSvc(s); setSvcSearch(s.name||s.service_name||'') }}
                        style={{padding:'10px 12px',borderRadius:8,cursor:'pointer',border:'1px solid #E2E8F0',
                          transition:'all 0.15s',fontSize:12}}
                        onMouseEnter={e=>{ e.currentTarget.style.background='#EFF6FF'; e.currentTarget.style.borderColor='#3B82F6' }}
                        onMouseLeave={e=>{ e.currentTarget.style.background='white'; e.currentTarget.style.borderColor='#E2E8F0' }}>
                        <div style={{fontWeight:600,color:'#0F172A',marginBottom:2}}>{s.name||s.service_name}</div>
                        <div style={{fontSize:10,color:'#94A3B8'}}>{s.category_name||'General'}</div>
                        <div style={{fontSize:11,fontWeight:700,color:'#059669',marginTop:4}}>
                          ₹{s.base_price||0}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new service option */}
                {domainId && !showAddSvc && (
                  <button onClick={()=>setShowAddSvc(true)}
                    style={{marginTop:10,fontSize:12,color:'#059669',background:'none',border:'none',
                      cursor:'pointer',display:'flex',alignItems:'center',gap:4,fontWeight:600,padding:0}}>
                    + Service not listed? Add new service
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Add new service panel */}
          {showAddSvc && (
            <div style={{background:'#F0FDF4',border:'1px solid #86EFAC',borderRadius:10,padding:16,marginTop:8}}>
              <div style={{fontWeight:700,fontSize:13,color:'#166534',marginBottom:12}}>
                ➕ Add New Service {domainId&&<span style={{fontWeight:400,fontSize:11,color:'#15803D'}}>(will be linked to this domain)</span>}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                <div style={{gridColumn:'1/-1'}}>
                  <label style={LBL}>Service Name *</label>
                  <input className="input" placeholder="e.g. AC Deep Cleaning" autoFocus
                    value={newSvcForm.name} onChange={e=>setNewSvcForm(f=>({...f,name:e.target.value}))}/>
                </div>
                <div>
                  <label style={LBL}>Category</label>
                  <select className="input" value={newSvcForm.category_id}
                    onChange={e=>setNewSvcForm(f=>({...f,category_id:e.target.value}))}>
                    <option value="">Select category</option>
                    {categories.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LBL}>Base Price (₹) *</label>
                  <input className="input" type="number" placeholder="e.g. 599"
                    value={newSvcForm.base_price} onChange={e=>setNewSvcForm(f=>({...f,base_price:e.target.value}))}/>
                </div>
                <div>
                  <label style={LBL}>GST %</label>
                  <input className="input" type="number" placeholder="e.g. 18"
                    value={newSvcForm.gst_percent} onChange={e=>setNewSvcForm(f=>({...f,gst_percent:e.target.value}))}/>
                </div>
                <div style={{gridColumn:'1/-1'}}>
                  <label style={LBL}>Description <span style={{fontWeight:400,color:'#94A3B8'}}>(optional)</span></label>
                  <input className="input" placeholder="Brief description"
                    value={newSvcForm.description} onChange={e=>setNewSvcForm(f=>({...f,description:e.target.value}))}/>
                </div>
              </div>
              {newSvcErr && <div style={{color:'#DC2626',fontSize:12,marginBottom:8}}>{newSvcErr}</div>}
              <div style={{display:'flex',gap:8}}>
                <button className="btn btn-primary" onClick={handleAddNewService} disabled={newSvcSaving}
                  style={{background:'linear-gradient(135deg,#059669,#10B981)',fontSize:12}}>
                  {newSvcSaving?<Spinner size="sm"/>:'Create & Select Service'}
                </button>
                <button className="btn btn-secondary" onClick={()=>{setShowAddSvc(false);setNewSvcErr('')}} style={{fontSize:12}}>Cancel</button>
              </div>
            </div>
          )}

          {/* Price preview */}
          {selSvc && (
            <div style={{background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:10,padding:'12px 16px',marginTop:12}}>
              <div style={{fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:0.5,marginBottom:8}}>
                Price Estimate
              </div>
              {loadPrice ? <Spinner size="sm"/> : (
                <div style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'flex-end'}}>
                  <div>
                    <div style={{fontSize:10,color:'#94A3B8'}}>Base</div>
                    <div style={{fontWeight:700,color:'#0F172A'}}>₹{basePrice.toLocaleString('en-IN')}</div>
                  </div>
                  {gstPct>0&&<div>
                    <div style={{fontSize:10,color:'#94A3B8'}}>GST {gstPct}%</div>
                    <div style={{fontWeight:700,color:'#64748B'}}>+₹{gstAmt.toLocaleString('en-IN')}</div>
                  </div>}
                  {cityPrices.length>0&&<div>
                    <div style={{fontSize:10,color:'#94A3B8'}}>City pricing available</div>
                    <div style={{fontSize:11,color:'#3B82F6',fontWeight:600}}>{cityPrices.length} cities</div>
                  </div>}
                  <div style={{borderLeft:'2px solid #E2E8F0',paddingLeft:16,marginLeft:4}}>
                    <div style={{fontSize:10,color:'#94A3B8'}}>Total Estimate</div>
                    <div style={{fontWeight:800,fontSize:16,color:'#059669'}}>₹{subtotal.toLocaleString('en-IN')}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          <NavBar
            onBack={()=>go('customer')}
            onNext={()=>{ if(!selSvc){setErr('Please select a service'); return}; setErr(''); go('address') }}
            nextLabel="Continue — Address →"
            nextDisabled={!selSvc}
          />
          {err && <div style={{color:'#DC2626',fontSize:12,marginTop:8,textAlign:'center'}}>{err}</div>}
        </div>
      )}

      {/* ══ STEP: ADDRESS ═════════════════════════════════════════════════════ */}
      {step==='address' && (
        <div>
          {addresses.length>0 && !showAddAddr && (
            <div>
              <div style={{fontSize:13,fontWeight:700,color:'#374151',marginBottom:10}}>
                Select Service Address *
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:12}}>
                {addresses.map((a:any)=>(
                  <div key={a.id}
                    onClick={()=>{ setSelAddrId(a.id); setEditAddrId(null); setShowAddAddr(false) }}
                    style={{padding:'12px 14px',borderRadius:10,cursor:'pointer',border:'2px solid',
                      borderColor:selAddrId===a.id?'#3B82F6':'#E2E8F0',
                      background:selAddrId===a.id?'linear-gradient(135deg,#EFF6FF,#DBEAFE)':'white',
                      transition:'all 0.15s',position:'relative'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                      <div style={{flex:1}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                          <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:10,
                            background:selAddrId===a.id?'#1D4ED8':'#E5E7EB',
                            color:selAddrId===a.id?'white':'#374151'}}>
                            {a.label||'Address'}
                          </span>
                          {a.is_default&&<span style={{fontSize:10,color:'#059669',fontWeight:600}}>★ Default</span>}
                        </div>
                        <div style={{fontSize:13,fontWeight:600,color:selAddrId===a.id?'#1D4ED8':'#0F172A'}}>
                          {a.address_line1}
                        </div>
                        {a.address_line2&&<div style={{fontSize:12,color:'#64748B'}}>{a.address_line2}</div>}
                        <div style={{fontSize:12,color:'#64748B'}}>{a.city}, {a.state} – {a.pincode}</div>
                        {/* Show city-specific price if available */}
                        {selSvc && (() => {
                          const cp = cityPrices.find(cp=>cp.city_name?.toLowerCase()===a.city?.toLowerCase())
                          return cp ? (
                            <div style={{fontSize:11,color:'#059669',fontWeight:600,marginTop:4}}>
                              💰 City price: ₹{cp.price} (vs base ₹{basePrice})
                            </div>
                          ) : null
                        })()}
                      </div>
                      <div style={{display:'flex',gap:6,marginLeft:8}}>
                        {selAddrId===a.id&&(
                          <span style={{fontSize:16,color:'#3B82F6'}}>✓</span>
                        )}
                        <button onClick={e=>{ e.stopPropagation(); startEditAddr(a) }}
                          style={{background:'#F1F5F9',border:'none',borderRadius:6,padding:'4px 8px',
                            fontSize:11,cursor:'pointer',color:'#64748B',fontWeight:600}}>
                          Edit
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={()=>{ setEditAddrId(null); setAddrForm({...BLANK_ADDR}); setShowAddAddr(true) }}
                style={{display:'flex',alignItems:'center',gap:6,fontSize:13,color:'#1D4ED8',
                  background:'none',border:'2px dashed #BFDBFE',borderRadius:10,padding:'10px 16px',
                  cursor:'pointer',width:'100%',fontWeight:600,marginBottom:12}}>
                + Add New Address
              </button>
            </div>
          )}

          {/* No addresses */}
          {addresses.length===0 && !showAddAddr && (
            <div>
              <Banner type="warn">
                <strong>No addresses saved.</strong> Add a service address to continue.
              </Banner>
              <button className="btn btn-primary" onClick={()=>setShowAddAddr(true)}
                style={{background:'linear-gradient(135deg,#1D4ED8,#3B82F6)'}}>
                + Add Address
              </button>
            </div>
          )}

          {/* Add/Edit address form */}
          {showAddAddr && (
            <div style={{background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:10,padding:16,marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:13,color:'#374151',marginBottom:12}}>
                {editAddrId ? '✏️ Edit Address' : '➕ Add New Address'}
              </div>
              <AddressForm
                value={addrForm}
                onChange={setAddrForm}
                cities={cities}
                saving={addrSaving}
                error={addrErr}
                onSave={saveAddress}
                onCancel={()=>{ setShowAddAddr(false); setEditAddrId(null); setAddrErr('') }}
                submitLabel={editAddrId?'Save Changes':'Save Address'}
              />
            </div>
          )}

          <NavBar
            onBack={()=>go('service')}
            onNext={()=>{ if(!selAddrId&&!showAddAddr){setErr('Select an address'); return}; setErr(''); go('schedule') }}
            nextLabel="Continue — Schedule →"
            nextDisabled={!selAddrId||showAddAddr}
          />
          {err && <div style={{color:'#DC2626',fontSize:12,marginTop:8,textAlign:'center'}}>{err}</div>}
        </div>
      )}

      {/* ══ STEP: SCHEDULE ════════════════════════════════════════════════════ */}
      {step==='schedule' && (
        <div>
          <div style={{marginBottom:20}}>
            <label style={{...LBL,fontSize:13}}>Scheduled Date *</label>
            <input className="input" type="date" value={schedDate} min={todayIST()}
              onChange={e=>{ setSchedDate(e.target.value); setSchedSlot('') }}
              style={{fontSize:15,fontWeight:600,height:44}}/>
          </div>

          {schedDate && (
            <div>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:700,color:'#374151'}}>Time Slot</div>
                {loadingSlots && <Spinner size="sm"/>}
                {!loadingSlots && (
                  <span style={{fontSize:11,color:'#94A3B8'}}>
                    {Object.values(slotCounts).reduce((a,b)=>a+b,0)} total bookings on {fmtDate(schedDate)}
                  </span>
                )}
              </div>

              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:16}}>
                {/* Any slot */}
                <div onClick={()=>setSchedSlot('')}
                  style={{padding:'12px 8px',borderRadius:10,cursor:'pointer',textAlign:'center',
                    border:`2px solid ${schedSlot===''?'#3B82F6':'#E2E8F0'}`,
                    background:schedSlot===''?'linear-gradient(135deg,#EFF6FF,#DBEAFE)':'white',
                    transition:'all 0.15s',boxShadow:schedSlot===''?'0 2px 8px rgba(59,130,246,0.2)':'none'}}>
                  <div style={{fontSize:14,marginBottom:4}}>🕐</div>
                  <div style={{fontSize:12,fontWeight:700,color:schedSlot===''?'#1D4ED8':'#374151'}}>Any Time</div>
                  <div style={{fontSize:10,color:'#94A3B8',marginTop:2}}>No preference</div>
                </div>

                {SLOTS.map(s=>{
                  const count = slotCounts[s.value]||0
                  const st    = slotStyle(count)
                  const sel   = schedSlot===s.value
                  return (
                    <div key={s.value} onClick={()=>setSchedSlot(s.value)}
                      style={{padding:'12px 8px',borderRadius:10,cursor:'pointer',textAlign:'center',
                        border:`2px solid ${sel?'#3B82F6':count>4?'#FECACA':'#E2E8F0'}`,
                        background:sel?'linear-gradient(135deg,#EFF6FF,#DBEAFE)':st.bg,
                        transition:'all 0.15s',boxShadow:sel?'0 2px 8px rgba(59,130,246,0.2)':'none'}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:4,marginBottom:4}}>
                        <div style={{width:7,height:7,borderRadius:'50%',background:sel?'#3B82F6':st.dot}}/>
                      </div>
                      <div style={{fontSize:11,fontWeight:700,color:sel?'#1D4ED8':st.color}}>{s.label}</div>
                      <div style={{fontSize:10,marginTop:3,fontWeight:600,color:sel?'#3B82F6':st.color}}>
                        {loadingSlots ? '...' : count===0?'✓ Free':`${count} booked · ${st.label}`}
                      </div>
                    </div>
                  )
                })}
              </div>

              {schedSlot && (
                <Banner type="info">
                  Selected slot: <strong>{SLOTS.find(s=>s.value===schedSlot)?.label}</strong> on {fmtDate(schedDate)}
                </Banner>
              )}
            </div>
          )}

          {!schedDate && (
            <div style={{textAlign:'center',padding:'32px 16px',background:'#F8FAFC',borderRadius:10}}>
              <div style={{fontSize:32,marginBottom:8}}>📅</div>
              <div style={{fontSize:13,color:'#94A3B8'}}>Select a date above to view slot availability</div>
            </div>
          )}

          <NavBar
            onBack={()=>go('address')}
            onNext={()=>{ if(!schedDate){setErr('Select a date'); return}; setErr(''); go('extras') }}
            nextLabel="Continue — Extras →"
            nextDisabled={!schedDate}
          />
          {err&&<div style={{color:'#DC2626',fontSize:12,marginTop:8,textAlign:'center'}}>{err}</div>}
        </div>
      )}

      {/* ══ STEP: EXTRAS ══════════════════════════════════════════════════════ */}
      {step==='extras' && (
        <div>
          {/* Appliance */}
          <div style={{marginBottom:16}}>
            <label style={{...LBL,fontSize:13}}>
              Appliance <span style={{fontWeight:400,color:'#94A3B8'}}>(optional)</span>
            </label>
            {appliances.length===0 ? (
              <div style={{padding:'10px 14px',background:'#FFFBEB',border:'1px solid #FDE68A',
                borderRadius:8,fontSize:12,color:'#92400E'}}>
                No appliances registered. Technician will fill during the service.
              </div>
            ) : (
              <select className="input" value={applianceId} onChange={e=>setApplianceId(e.target.value)}>
                <option value="">— Not specified / Technician will assess —</option>
                {appliances.map((a:any)=>(
                  <option key={a.id} value={a.id}>
                    {a.category||a.category_name||'Appliance'}
                    {a.brand_name?` — ${a.brand_name}`:''}
                    {a.model?` (${a.model})`:''}
                    {a.is_under_warranty?' 🛡️ Warranty':''}
                  </option>
                ))}
              </select>
            )}
            {selAppl&&(
              <div style={{marginTop:6,fontSize:12,background:'#EFF6FF',color:'#1D4ED8',
                padding:'6px 12px',borderRadius:6,display:'inline-flex',alignItems:'center',gap:8}}>
                🔧 <strong>{selAppl.brand_name||'—'}</strong> · {selAppl.model||'—'}
                {selAppl.is_under_warranty&&<span style={{background:'#D1FAE5',color:'#065F46',
                  padding:'1px 6px',borderRadius:4,fontWeight:600,fontSize:11}}>Under Warranty</span>}
              </div>
            )}
          </div>

          {/* Priority */}
          <div style={{marginBottom:16}}>
            <label style={{...LBL,fontSize:13}}>Priority</label>
            <div style={{display:'flex',gap:8}}>
              {[
                {v:'NORMAL',label:'Normal',color:'#64748B',activeBg:'#F1F5F9'},
                {v:'HIGH',label:'High',color:'#EA580C',activeBg:'#FFF7ED'},
                {v:'URGENT',label:'Urgent',color:'#DC2626',activeBg:'#FEF2F2'},
              ].map(p=>(
                <div key={p.v} onClick={()=>setPriority(p.v)}
                  style={{flex:1,padding:'10px',borderRadius:8,cursor:'pointer',textAlign:'center',
                    border:`2px solid ${priority===p.v?p.color:'#E2E8F0'}`,
                    background:priority===p.v?p.activeBg:'white',transition:'all 0.15s'}}>
                  <div style={{fontWeight:700,fontSize:12,color:priority===p.v?p.color:'#9CA3AF'}}>{p.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div style={{marginBottom:16}}>
            <label style={{...LBL,fontSize:13}}>Internal Notes <span style={{fontWeight:400,color:'#94A3B8'}}>(optional)</span></label>
            <textarea className="input" rows={2} placeholder="Notes for CCO / technician..."
              value={notes} onChange={e=>setNotes(e.target.value)}
              style={{resize:'none',lineHeight:1.5}}/>
          </div>

          {/* Coupon code */}
          <div style={{marginBottom:4}}>
            <label style={{...LBL,fontSize:13}}>Coupon Code <span style={{fontWeight:400,color:'#94A3B8'}}>(optional)</span></label>
            <div style={{display:'flex',gap:8}}>
              <input className="input" placeholder="ENTER CODE" value={couponCode}
                onChange={e=>{ setCouponCode(e.target.value.toUpperCase()); setCouponResult(null); setCouponErr('') }}
                style={{fontFamily:'monospace',fontWeight:700,letterSpacing:1,flex:1}}
                disabled={!!couponResult}/>
              {!couponResult ? (
                <button className="btn btn-primary" onClick={applyCoupon} disabled={!couponCode.trim()||couponLoading}
                  style={{minWidth:90,background:'linear-gradient(135deg,#059669,#10B981)'}}>
                  {couponLoading?<Spinner size="sm"/>:'Apply'}
                </button>
              ) : (
                <button className="btn btn-secondary" onClick={()=>{ setCouponResult(null); setCouponCode(''); setCouponErr('') }}>
                  Remove
                </button>
              )}
            </div>
            {couponErr && <div style={{color:'#DC2626',fontSize:12,marginTop:4}}>{couponErr}</div>}
            {couponResult && (
              <div style={{marginTop:6,background:'#F0FDF4',border:'1px solid #86EFAC',borderRadius:8,
                padding:'8px 12px',fontSize:12,color:'#166534',display:'flex',alignItems:'center',gap:8}}>
                🎉 <strong>{couponCode}</strong> applied — Save {money(discount)}!
                <span style={{color:'#94A3B8',fontSize:11}}>({couponResult.discount_type} discount)</span>
              </div>
            )}
          </div>

          <NavBar
            onBack={()=>go('schedule')}
            onNext={()=>go('confirm')}
            nextLabel="Review Booking →"
          />
        </div>
      )}

      {/* ══ STEP: CONFIRM ════════════════════════════════════════════════════ */}
      {step==='confirm' && (
        <div>
          <div style={{fontSize:14,fontWeight:700,color:'#374151',marginBottom:16}}>Review & Confirm Booking</div>

          {/* Summary card */}
          <div style={{background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:12,overflow:'hidden',marginBottom:16}}>
            {[
              { section:'Customer', rows:[
                {label:'Name', value:customer?.name},
                {label:'Mobile', value:customer?.mobile},
                {label:'Code', value:customer?.customer_code},
              ]},
              { section:'Service', rows:[
                {label:'Domain', value:domains.find(d=>d.id===domainId)?.name||'—'},
                {label:'Service', value:selSvc?.name||selSvc?.service_name||'—'},
                {label:'Category', value:selSvc?.category_name||'—'},
              ]},
              { section:'Address', rows:[
                {label:'Address', value:selAddr?shortAddr(selAddr):'—'},
                {label:'Label', value:selAddr?.label||'—'},
                {label:'City', value:selAddr?.city||'—'},
              ]},
              { section:'Schedule', rows:[
                {label:'Date', value:schedDate?fmtDate(schedDate):'—'},
                {label:'Slot', value:schedSlot?SLOTS.find(s=>s.value===schedSlot)?.label:'Any time'},
                {label:'Priority', value:priority},
              ]},
            ].map(block=>(
              <div key={block.section} style={{borderBottom:'1px solid #E2E8F0'}}>
                <div style={{background:'#F1F5F9',padding:'8px 16px',fontSize:11,fontWeight:700,
                  color:'#64748B',textTransform:'uppercase',letterSpacing:0.5}}>
                  {block.section}
                </div>
                {block.rows.map(r=>(
                  <div key={r.label} style={{display:'flex',justifyContent:'space-between',
                    padding:'8px 16px',borderBottom:'1px solid #F8FAFC',fontSize:13}}>
                    <span style={{color:'#64748B'}}>{r.label}</span>
                    <span style={{fontWeight:600,color:'#0F172A',textAlign:'right',maxWidth:'60%'}}>{r.value||'—'}</span>
                  </div>
                ))}
              </div>
            ))}

            {/* Price summary */}
            <div style={{borderBottom:'1px solid #E2E8F0'}}>
              <div style={{background:'#F1F5F9',padding:'8px 16px',fontSize:11,fontWeight:700,
                color:'#64748B',textTransform:'uppercase',letterSpacing:0.5}}>Pricing</div>
              <div style={{padding:'10px 16px'}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4,color:'#64748B'}}>
                  <span>Service ({selAddr?.city||'base'})</span>
                  <span>₹{effectiveP.toLocaleString('en-IN')}</span>
                </div>
                {gstPct>0&&(
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4,color:'#64748B'}}>
                    <span>GST ({gstPct}%)</span>
                    <span>+₹{gstAmt.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {discount>0&&(
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4,color:'#059669'}}>
                    <span>Coupon ({couponCode})</span>
                    <span>-₹{discount.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div style={{display:'flex',justifyContent:'space-between',fontWeight:800,fontSize:15,
                  color:'#059669',borderTop:'1px solid #E2E8F0',paddingTop:8,marginTop:8}}>
                  <span>Estimated Total</span>
                  <span>₹{totalPrice.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {notes&&(
              <div style={{padding:'10px 16px',fontSize:12,color:'#64748B'}}>
                📝 Notes: <em>{notes}</em>
              </div>
            )}
          </div>

          {/* Active booking duplicate warning */}
          {activeBkgs.length>0&&(
            <Banner type="warn">
              <strong>{activeBkgs.length} active booking{activeBkgs.length>1?'s':''} exist.</strong>{' '}
              If you book the same service at the same address, it will be blocked as a duplicate.
              Different service or address = always allowed.
            </Banner>
          )}

          {err && (
            <div style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:8,
              padding:'12px 14px',marginBottom:12,fontSize:13,color:'#DC2626'}}>
              {err}
              {showForce&&(
                <div style={{marginTop:10,display:'flex',alignItems:'flex-start',gap:10}}>
                  <input type="checkbox" id="force-dup" checked={forcedup}
                    onChange={e=>setForcedup(e.target.checked)} style={{marginTop:2,accentColor:'#DC2626'}}/>
                  <label htmlFor="force-dup" style={{cursor:'pointer',fontSize:12,color:'#92400E'}}>
                    <strong>Force-create</strong> — Override duplicate block.
                    <span style={{display:'block',fontSize:11,color:'#B45309'}}>Only if intentional (split job, second tech, etc.)</span>
                  </label>
                </div>
              )}
            </div>
          )}

          <NavBar
            onBack={()=>{ setErr(''); setShowForce(false); setForcedup(false); go('extras') }}
            onNext={handleCreate}
            nextLabel={saving?'Creating…':'✓ Confirm & Create Booking'}
            nextLoading={saving}
          />
        </div>
      )}
    </Modal>
  )
}
