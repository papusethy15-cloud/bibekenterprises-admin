import { ReactNode } from 'react'

interface Props { title: string; subtitle?: string | ReactNode; actions?: ReactNode }

export default function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div style={{ padding:'24px 28px 0', display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
      <div>
        <h1 style={{ fontSize:22, fontWeight:700, color:'#0F172A' }}>{title}</h1>
        {subtitle && <p style={{ fontSize:14, color:'#64748B', marginTop:2 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display:'flex', gap:10 }}>{actions}</div>}
    </div>
  )
}
