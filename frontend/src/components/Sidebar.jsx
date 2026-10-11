import { Icon } from './Primitives.jsx'

const navItems = [
  { id: 'overview', label: 'Overview', icon: 'grid', group: 'WORKSPACE' },
  { id: 'inspector', label: 'Request inspector', icon: 'scan' },
  { id: 'audit', label: 'Audit explorer', icon: 'list', group: 'INTELLIGENCE' },
  { id: 'operations', label: 'Operations', icon: 'pulse' },
  { id: 'evaluation', label: 'Evaluation', icon: 'chart' },
]

export function Sidebar({ active, onNavigate, health, connected }) {
  const healthTone = !connected ? 'neutral' : health?.status === 'ok' ? 'green' : 'amber'
  const healthLabel = !connected ? 'API unavailable' : health?.status === 'ok' ? 'API operational' : 'API degraded'
  return <aside className="sidebar">
    <a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); onNavigate('overview') }} aria-label="FINIGUARD overview">
      <span className="brand-mark"><Icon name="shield" size={19}/></span><span className="brand-copy"><strong>FINIGUARD</strong><small>AI SECURITY FIREWALL</small><em>Intelligence analyzed. Every action verified.</em></span>
    </a>
    <div className="sidebar-rule"/>
    <nav aria-label="Main navigation" className="main-nav">
      {navItems.map((item, index) => <div key={item.id}>
        {item.group && <p className={`nav-group ${index ? 'nav-group-spaced' : ''}`}>{item.group}</p>}
        <button className={`nav-item ${active === item.id ? 'nav-active' : ''}`} aria-current={active === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}>
          <Icon name={item.icon}/><span>{item.label}</span>
        </button>
      </div>)}
    </nav>
    <div className="sidebar-bottom">
      <div className="sidebar-health"><span className={`health-orb ${healthTone}`}/><div><strong>{healthLabel}</strong><small>{health?.ai?.status ? `AI ${health.ai.status}` : 'Live service status'}</small></div></div>
      <p className="sidebar-disclaimer">Synthetic demo environment<br/>No real banking connections</p>
      <div className="sidebar-foot"><span>FINIGUARD</span><span>v1.0</span></div>
    </div>
  </aside>
}
