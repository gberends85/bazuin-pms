'use client';
import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { api } from '@/lib/api';
import Link from 'next/link';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [ferries, setFerries] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().split('T')[0];
  const todayFmt = new Date().toLocaleDateString('nl-NL', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  useEffect(() => {
    Promise.all([
      api.stats.get(),
      api.ferries.schedules(today),
    ]).then(([s, f]) => { setStats(s); setFerries(f); }).finally(() => setLoading(false));
  }, []);

  const occupancyPct = stats ? Math.round(stats.currentOccupancy / stats.totalCapacity * 100) : 0;

  return (
    <AdminLayout>
      <div style={{padding:'24px 28px',maxWidth:1100}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
          <div>
            <h1 style={{margin:'0 0 2px',fontSize:22,fontWeight:800,color:'#0a2240'}}>Dashboard</h1>
            <p style={{margin:0,fontSize:13,color:'#7090b0',textTransform:'capitalize'}}>{todayFmt}</p>
          </div>
          <div style={{display:'flex',gap:10}}>
            <Link href="/arrivals" className="btn btn-primary">⬇ Snel inchecken</Link>
            <Link href="/departures" className="btn btn-ghost">⬆ Vertrekken</Link>
          </div>
        </div>

        {/* Ferry strip */}
        <div style={{background:'#0a2240',borderRadius:12,padding:'16px 20px',marginBottom:20,color:'white'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <span style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,0.45)',textTransform:'uppercase',letterSpacing:'0.6px'}}>⛴ Boottijden vandaag — Rederij Doeksen</span>
            <Link href="/settings/ferries" style={{fontSize:11,color:'rgba(255,255,255,0.5)',textDecoration:'none'}}>✎ Aanpassen</Link>
          </div>
          {ferries?.schedules ? (() => {
            const outbound = ferries.schedules.filter((s: any) => s.direction === 'outbound');
            const returns = ferries.schedules.filter((s: any) => s.direction === 'return');
            const destinations = ['terschelling','vlieland'] as const;
            return (
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {destinations.map(dest => {
                  const out = outbound.filter((s: any) => s.destination === dest);
                  const ret = returns.filter((s: any) => s.destination === dest);
                  if (out.length === 0 && ret.length === 0) return null;
                  return (
                    <div key={dest}>
                      <div style={{fontSize:10,fontWeight:700,color:'rgba(255,255,255,0.35)',textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:6}}>
                        {dest === 'terschelling' ? '🟡 Terschelling' : '🔵 Vlieland'}
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))',gap:8}}>
                        {out.slice(0,5).map((s: any, i: number) => (
                          <div key={i} style={{background:'rgba(255,255,255,0.07)',borderRadius:8,padding:'8px 10px'}}>
                            <div style={{fontSize:9,fontWeight:700,color:'#f5c842',textTransform:'uppercase',marginBottom:2}}>↗ Heen</div>
                            <div style={{fontSize:19,fontWeight:800}}>{s.departureTime}</div>
                            <div style={{fontSize:9,color:'rgba(255,255,255,0.4)',marginTop:1}}>{s.ferryName}</div>
                          </div>
                        ))}
                        {ret.slice(0,3).map((s: any, i: number) => (
                          <div key={i} style={{background:'rgba(255,255,255,0.07)',borderRadius:8,padding:'8px 10px',borderLeft:'2px solid #0a7c6e'}}>
                            <div style={{fontSize:9,fontWeight:700,color:'#0d9b8a',textTransform:'uppercase',marginBottom:2}}>↙ Arr. Harlingen</div>
                            <div style={{fontSize:19,fontWeight:800}}>{s.arrivalHarlingen || s.departureTime}</div>
                            <div style={{fontSize:9,color:'rgba(255,255,255,0.4)',marginTop:1}}>{dest} retour</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })() : (
            <div style={{color:'rgba(255,255,255,0.3)',fontSize:13}}>Geen veerboottijden beschikbaar</div>
          )}
        </div>

        {/* Stats */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
          {[
            { label:'Aankomsten vandaag', value: stats?.arrivalsToday ?? '—', color:'#0a7c6e', link:'/arrivals' },
            { label:'Vertrekken vandaag', value: stats?.departuresToday ?? '—', color:'#0a2240', link:'/departures' },
            { label:'Bezet / Capaciteit', value: stats ? `${stats.currentOccupancy} / ${stats.totalCapacity}` : '—', color:'#0a2240' },
            { label:'Omzet vandaag', value: stats ? `€ ${Number(stats.revenueToday).toFixed(0)}` : '—', color:'#2a7a3a' },
          ].map((m, i) => (
            <div key={i} className="card" style={{padding:'16px 18px'}}>
              <div style={{fontSize:10,fontWeight:700,color:'#7090b0',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>{m.label}</div>
              {m.link ? (
                <Link href={m.link} style={{fontSize:26,fontWeight:800,color:m.color,textDecoration:'none'}}>{loading?'…':m.value}</Link>
              ) : (
                <div style={{fontSize:26,fontWeight:800,color:m.color}}>{loading?'…':m.value}</div>
              )}
            </div>
          ))}
        </div>

        {/* Occupancy bar */}
        {stats && (
          <div className="card" style={{padding:'16px 20px',marginBottom:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <span style={{fontSize:13,fontWeight:600,color:'#0a2240'}}>Bezettingsgraad</span>
              <span style={{fontSize:13,color:'#7090b0'}}>{stats.currentOccupancy} van {stats.totalCapacity} plaatsen bezet</span>
            </div>
            <div style={{height:12,background:'#f4f6f9',borderRadius:6,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${occupancyPct}%`,background: occupancyPct > 80 ? '#e24b4a' : occupancyPct > 60 ? '#ef9f27' : '#0a7c6e',borderRadius:6,transition:'width 0.5s'}} />
            </div>
            <div style={{fontSize:11,color:'#7090b0',marginTop:6}}>{occupancyPct}% bezet</div>
          </div>
        )}

        {/* Quick links */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14}}>
          {[
            { href:'/arrivals', title:'Aankomsten', desc:'Bekijk en check in verwachte gasten', icon:'↓', color:'#0a7c6e' },
            { href:'/calendar', title:'Agenda', desc:'Beschikbaarheid per dag bekijken', icon:'▦', color:'#0a2240' },
            { href:'/reports', title:'Rapport', desc:'Financieel overzicht en statistieken', icon:'⌁', color:'#2a7a3a' },
          ].map((l, i) => (
            <Link key={i} href={l.href} style={{textDecoration:'none'}}>
              <div className="card" style={{padding:'16px 18px',cursor:'pointer',transition:'box-shadow 0.15s'}} onMouseEnter={e=>(e.currentTarget.style.boxShadow='0 4px 16px rgba(10,34,64,0.1)')} onMouseLeave={e=>(e.currentTarget.style.boxShadow='none')}>
                <div style={{fontSize:22,marginBottom:8,color:l.color}}>{l.icon}</div>
                <div style={{fontSize:14,fontWeight:700,color:'#0a2240',marginBottom:4}}>{l.title}</div>
                <div style={{fontSize:12,color:'#7090b0'}}>{l.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
