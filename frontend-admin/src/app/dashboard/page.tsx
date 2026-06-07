'use client';
import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { api } from '@/lib/api';
import Link from 'next/link';
import { ArrowDownTrayIcon, ArrowUpTrayIcon, MapIcon, PencilSquareIcon, ArrowDownCircleIcon, CalendarDaysIcon, ChartBarIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { Car, Key } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

// ─── Drukte grafiek ────────────────────────────────────────────────────────────
function TrafficForecast() {
  const _t = new Date();
  const today = `${_t.getFullYear()}-${String(_t.getMonth() + 1).padStart(2, '0')}-${String(_t.getDate()).padStart(2, '0')}`;
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(in7);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'dag'|'periode'>('periode');

  const shiftDay = (base: string, delta: number) => {
    const d = new Date(base + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    return d.toISOString().split('T')[0];
  };

  const load = useCallback(async () => {
    if (!from || !to || from > to) return;
    setLoading(true);
    try { setData(await api.traffic.forecast(from, to)); }
    catch {}
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  // Groepeer per dag voor periodeweergave, of per tijdslot voor dagweergave
  const isSingleDay = viewMode === 'dag' || from === to;

  let chartData: any[] = [];
  if (data?.slots) {
    if (isSingleDay) {
      // Tijdslots op één dag (of alle tijdslots gesommeerd)
      const slotAgg: Record<string, { slot: string; brengen: number; halen: number; brengenList: any[]; halenList: any[] }> = {};
      for (const s of data.slots) {
        if (!slotAgg[s.slot]) slotAgg[s.slot] = { slot: s.slot, brengen: 0, halen: 0, brengenList: [], halenList: [] };
        slotAgg[s.slot].brengen += s.brengen;
        slotAgg[s.slot].halen += s.halen;
        slotAgg[s.slot].brengenList.push(...s.brengenList);
        slotAgg[s.slot].halenList.push(...s.halenList);
      }
      chartData = Object.values(slotAgg).sort((a, b) => a.slot.localeCompare(b.slot));
    } else {
      // Per dag samenvatten
      const dayAgg: Record<string, { date: string; brengen: number; halen: number }> = {};
      for (const s of data.slots) {
        if (!dayAgg[s.date]) dayAgg[s.date] = { date: s.date, brengen: 0, halen: 0 };
        dayAgg[s.date].brengen += s.brengen;
        dayAgg[s.date].halen += s.halen;
      }
      // Vul ook lege dagen in het bereik aan
      const cur = new Date(from);
      const end = new Date(to);
      while (cur <= end) {
        const d = cur.toISOString().split('T')[0];
        if (!dayAgg[d]) dayAgg[d] = { date: d, brengen: 0, halen: 0 };
        cur.setDate(cur.getDate() + 1);
      }
      chartData = Object.values(dayAgg).sort((a, b) => a.date.localeCompare(b.date));
    }
  }

  const maxVal = Math.max(...chartData.map(d => d.brengen + d.halen), 1);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const brengen = payload.find((p: any) => p.dataKey === 'brengen');
    const halen = payload.find((p: any) => p.dataKey === 'halen');
    const bList = brengen?.payload?.brengenList || [];
    const hList = halen?.payload?.halenList || [];
    return (
      <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.15)', borderRadius: 10, padding: '10px 14px', fontSize: 12, boxShadow: '0 4px 16px rgba(10,34,64,0.1)', maxWidth: 260 }}>
        <div style={{ fontWeight: 800, color: '#0a2240', marginBottom: 6 }}>{label}</div>
        {brengen?.value > 0 && (
          <div style={{ marginBottom: 4 }}>
            <div style={{ color: '#0a2240', fontWeight: 700, marginBottom: 3 }}><Car size={14} style={{ display:'inline', verticalAlign:'middle', marginRight:4 }} /> Brengen: {brengen.value} auto{brengen.value !== 1 ? "'s" : ''}</div>
            {bList.slice(0, 6).map((r: any, i: number) => (
              <div key={i} style={{ color: '#556070', paddingLeft: 8, marginTop: 2, lineHeight: 1.3 }}>
                <span style={{ fontWeight: 600, color: '#0a2240' }}>{(r.plates || []).join(', ') || '—'}</span>
                <span style={{ color: '#7090b0', marginLeft: 6 }}>boot {r.ferryTime}</span>
              </div>
            ))}
            {bList.length > 6 && <div style={{ color: '#7090b0', paddingLeft: 8, marginTop: 2 }}>+{bList.length - 6} meer</div>}
          </div>
        )}
        {halen?.value > 0 && (
          <div>
            <div style={{ color: '#0a7c6e', fontWeight: 700, marginBottom: 3 }}><Key size={14} style={{ display:'inline', verticalAlign:'middle', marginRight:4 }} /> Halen: {halen.value} auto{halen.value !== 1 ? "'s" : ''}</div>
            {hList.slice(0, 6).map((r: any, i: number) => (
              <div key={i} style={{ color: '#556070', paddingLeft: 8, marginTop: 2, lineHeight: 1.3 }}>
                <span style={{ fontWeight: 600, color: '#0a2240' }}>{(r.plates || []).join(', ') || '—'}</span>
                <span style={{ color: '#7090b0', marginLeft: 6 }}>aankomst {r.arrivalTime}</span>
              </div>
            ))}
            {hList.length > 6 && <div style={{ color: '#7090b0', paddingLeft: 8, marginTop: 2 }}>+{hList.length - 6} meer</div>}
          </div>
        )}
      </div>
    );
  };

  const fmtDay = (d: string) => {
    const dt = new Date(d + 'T12:00:00');
    return dt.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  return (
    <div className="card" style={{ padding: '18px 20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0a2240', marginBottom: 2 }}>Drukteverwachting</div>
          <div style={{ fontSize: 11, color: '#7090b0' }}>
            Totaal: <strong>{data?.totalBrengen ?? '—'}</strong> brengen · <strong>{data?.totalHalen ?? '—'}</strong> halen
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '0.5px solid rgba(10,34,64,0.2)' }}>
            {(['periode','dag'] as const).map(m => (
              <button key={m} onClick={() => {
                if (m === 'dag') { setTo(from); }
                setViewMode(m);
              }}
                style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', background: viewMode === m ? '#0a2240' : 'white', color: viewMode === m ? 'white' : '#556070' }}>
                {m === 'periode' ? 'Per dag' : 'Per tijdslot'}
              </button>
            ))}
          </div>
          {viewMode === 'dag' ? (
            <>
              <button onClick={() => { const d = shiftDay(from, -1); setFrom(d); setTo(d); }}
                style={{ padding: '4px 9px', borderRadius: 6, border: '0.5px solid rgba(10,34,64,0.2)', background: 'white', cursor: 'pointer', fontSize: 15, lineHeight: 1, color: '#0a2240', fontWeight: 700 }}>‹</button>
              <input type="date" value={from} onChange={e => { setFrom(e.target.value); setTo(e.target.value); }}
                style={{ fontSize: 12, padding: '4px 8px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, color: '#0a2240' }} />
              <button onClick={() => { const d = shiftDay(from, 1); setFrom(d); setTo(d); }}
                style={{ padding: '4px 9px', borderRadius: 6, border: '0.5px solid rgba(10,34,64,0.2)', background: 'white', cursor: 'pointer', fontSize: 15, lineHeight: 1, color: '#0a2240', fontWeight: 700 }}>›</button>
            </>
          ) : (
            <>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                style={{ fontSize: 12, padding: '4px 8px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, color: '#0a2240' }} />
              <span style={{ fontSize: 12, color: '#7090b0' }}>t/m</span>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                style={{ fontSize: 12, padding: '4px 8px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, color: '#0a2240' }} />
            </>
          )}
          <button onClick={load} disabled={loading}
            style={{ padding: '4px 10px', borderRadius: 6, border: '0.5px solid rgba(10,34,64,0.2)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#0a2240' }}>
            <ArrowPathIcon className="w-3 h-3" />{loading ? 'Laden…' : 'Vernieuwen'}
          </button>
        </div>
      </div>

      {chartData.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#7090b0', fontSize: 13 }}>
          Geen reserveringen gevonden voor dit bereik
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#7090b0', fontSize: 13 }}>Laden…</div>
      )}

      {!loading && chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,34,64,0.06)" />
            <XAxis dataKey={isSingleDay ? 'slot' : 'date'}
              tick={{ fontSize: 10, fill: '#7090b0' }}
              tickFormatter={isSingleDay ? undefined : fmtDay}
              interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: '#7090b0' }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend formatter={(v) => v === 'brengen' ? '🚗 Brengen (~1u voor vertrek)' : '🔑 Halen (na aankomst Harlingen)'}
              verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />
            <Bar dataKey="brengen" stackId="a" fill="#0a2240" radius={[0,0,0,0]} name="brengen" />
            <Bar dataKey="halen" stackId="a" fill="#0a7c6e" radius={[4,4,0,0]} name="halen" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [ferries, setFerries] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const _t = new Date();
  const today = `${_t.getFullYear()}-${String(_t.getMonth() + 1).padStart(2, '0')}-${String(_t.getDate()).padStart(2, '0')}`;
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
            <Link href="/arrivals" className="btn btn-primary" style={{display:'inline-flex',alignItems:'center',gap:6}}><ArrowDownTrayIcon className="w-4 h-4" />Snel inchecken</Link>
            <Link href="/departures" className="btn btn-ghost" style={{display:'inline-flex',alignItems:'center',gap:6}}><ArrowUpTrayIcon className="w-4 h-4" />Vertrekken</Link>
          </div>
        </div>

        {/* Ferry strip */}
        <div style={{background:'#0a2240',borderRadius:12,padding:'16px 20px',marginBottom:20,color:'white'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <span style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,0.45)',textTransform:'uppercase',letterSpacing:'0.6px',display:'inline-flex',alignItems:'center',gap:5}}><MapIcon className="w-3 h-3" />Boottijden vandaag — Rederij Doeksen</span>
            <Link href="/settings/ferries" style={{fontSize:11,color:'rgba(255,255,255,0.5)',textDecoration:'none',display:'inline-flex',alignItems:'center',gap:4}}><PencilSquareIcon className="w-3 h-3" />Aanpassen</Link>
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

        {/* Drukte grafiek */}
        <TrafficForecast />

        {/* Quick links */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14}}>
          {[
            { href:'/arrivals', title:'Aankomsten', desc:'Bekijk en check in verwachte gasten', icon:ArrowDownCircleIcon, color:'#0a7c6e' },
            { href:'/calendar', title:'Agenda', desc:'Beschikbaarheid per dag bekijken', icon:CalendarDaysIcon, color:'#0a2240' },
            { href:'/reports', title:'Rapport', desc:'Financieel overzicht en statistieken', icon:ChartBarIcon, color:'#2a7a3a' },
          ].map((l, i) => (
            <Link key={i} href={l.href} style={{textDecoration:'none'}}>
              <div className="card" style={{padding:'16px 18px',cursor:'pointer',transition:'box-shadow 0.15s'}} onMouseEnter={e=>(e.currentTarget.style.boxShadow='0 4px 16px rgba(10,34,64,0.1)')} onMouseLeave={e=>(e.currentTarget.style.boxShadow='none')}>
                <div style={{marginBottom:8,color:l.color}}><l.icon className="w-6 h-6" /></div>
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
