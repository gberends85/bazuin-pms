'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api, fetchContractInvoicePreview, fetchContractInvoicePdf } from '@/lib/api';
import { Zap, CalendarDays, Flag, Trash2, X, Check, Pencil, Eye, FileText, Minus, Plus, PackageCheck } from 'lucide-react';

const DAY_LABELS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
const MONTHS_NL = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
const LS_KEY = 'contract_last_customer_ids';

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function startOfWeek(d: Date): Date {
  const r = new Date(d); r.setHours(12,0,0,0);
  const dow = r.getDay();
  r.setDate(r.getDate() + (dow === 0 ? -6 : 1 - dow));
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function fmtLong(d: Date): string {
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtShort(iso: string): string {
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDayShort(iso: string): string {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}
// Kalenderdagen: aankomst + vertrekdag tellen mee = nachten + 1
function calDays(arrival: string, departure: string): number {
  if (!arrival || !departure || departure < arrival) return 0;
  return Math.max(1, Math.round(
    (new Date(departure + 'T12:00:00').getTime() - new Date(arrival + 'T12:00:00').getTime()) / 86400000
  ) + 1);
}
function addIsoDay(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n);
  return isoDate(d);
}

// localStorage helpers
function getRecentIds(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function pushRecentId(id: string) {
  const arr = [id, ...getRecentIds().filter((x: string) => x !== id)].slice(0, 10);
  localStorage.setItem(LS_KEY, JSON.stringify(arr));
}

// ── Inline calendar range picker ─────────────────────────────────
function CalendarRangePicker({
  arrival, departure, onChange,
}: {
  arrival: string; departure: string;
  onChange: (arrival: string, departure: string) => void;
}) {
  const todayIso = isoDate(new Date());
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = arrival || todayIso;
    const d = new Date(base + 'T12:00:00');
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [stage, setStage] = useState<'arrival' | 'departure'>('arrival');
  const [hover, setHover] = useState('');

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  const cells: (string | null)[] = [];
  const firstDow = new Date(year, month, 1).getDay();
  const blanks = firstDow === 0 ? 6 : firstDow - 1;
  for (let i = 0; i < blanks; i++) cells.push(null);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  function handleClick(iso: string) {
    if (stage === 'arrival' || iso < arrival) {
      onChange(iso, addIsoDay(iso, 1));
      setStage('departure');
    } else {
      onChange(arrival, iso);
      setStage('arrival');
    }
  }

  const displayEnd = stage === 'departure' && hover ? hover : departure;

  function cellStyle(iso: string): React.CSSProperties {
    const isArr = iso === arrival;
    const isDep = iso === departure;
    const inRange = arrival && displayEnd && iso > arrival && iso < displayEnd;
    const isToday = iso === todayIso;
    const isHoverEnd = iso === displayEnd && stage === 'departure' && hover === iso;
    return {
      textAlign: 'center' as const, padding: '5px 2px', cursor: 'pointer',
      borderRadius: (isArr || isDep || isHoverEnd) ? 20 : 0,
      background: isArr ? '#0a2240' : (isDep || isHoverEnd) ? '#0a7c6e' : inRange ? '#d6f0eb' : 'transparent',
      color: (isArr || isDep || isHoverEnd) ? 'white' : inRange ? '#0a5c50' : isToday ? '#0a7c6e' : '#0a2240',
      fontWeight: (isArr || isDep) ? 700 : 400, fontSize: 12,
      outline: isToday && !isArr && !isDep ? '1px solid #0a7c6e80' : 'none', outlineOffset: '-2px',
    };
  }

  const nights = arrival && departure ? Math.round(
    (new Date(departure+'T12:00:00').getTime() - new Date(arrival+'T12:00:00').getTime()) / 86400000
  ) : 0;
  const days = calDays(arrival, departure);

  return (
    <div style={{ background: 'white', border: '1px solid rgba(10,34,64,0.2)', borderRadius: 10, padding: 14, width: 260, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={() => setViewMonth(new Date(year, month-1, 1))} style={calNavSt}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#0a2240' }}>{MONTHS_NL[month]} {year}</span>
        <button onClick={() => setViewMonth(new Date(year, month+1, 1))} style={calNavSt}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {['Ma','Di','Wo','Do','Vr','Za','Zo'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#aab8cc', padding: '2px 0' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((iso, i) => iso
          ? <div key={i} style={cellStyle(iso)} onClick={() => handleClick(iso)}
              onMouseEnter={() => { if (stage === 'departure') setHover(iso); }}
              onMouseLeave={() => setHover('')}>
              {parseInt(iso.slice(8))}
            </div>
          : <div key={i} />
        )}
      </div>
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid rgba(10,34,64,0.1)', fontSize: 11 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#556070', marginBottom: 3 }}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:3 }}><CalendarDays size={12} />Aankomst:</span>
          <strong style={{ color: '#0a2240' }}>{arrival ? fmtShort(arrival) : '—'}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#556070', marginBottom: 3 }}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:3 }}><Flag size={12} />Vertrek:</span>
          <strong style={{ color: '#0a2240' }}>{departure ? fmtShort(departure) : '—'}</strong>
        </div>
        {days > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#556070', marginTop: 6, paddingTop: 6, borderTop: '0.5px solid rgba(10,34,64,0.08)' }}>
            <span>Duur</span>
            <strong style={{ color: '#0a2240' }}>{days} dag{days !== 1 ? 'en' : ''}</strong>
          </div>
        )}
        <div style={{ fontSize: 10, color: '#aab8cc', marginTop: 6, textAlign: 'center' }}>
          {stage === 'arrival' ? 'Klik op aankomstdatum' : 'Klik op vertrekdatum'}
        </div>
      </div>
    </div>
  );
}

// ── Add stay form with calendar ─────────────────────────────────
function AddStayForm({ onAdd, defaultArrival }: { onAdd: (d: any) => void; defaultArrival: string }) {
  const [plate, setPlate] = useState('');
  const [arrival, setArrival] = useState(defaultArrival);
  const [departure, setDeparture] = useState(addIsoDay(defaultArrival, 1));

  function handleAdd() {
    if (!plate.trim()) { alert('Vul een kenteken in'); return; }
    if (!arrival || !departure) { alert('Selecteer een periode'); return; }
    if (departure < arrival) { alert('Vertrekdatum moet na aankomstdatum zijn'); return; }
    onAdd({ license_plate: plate.trim().toUpperCase().replace(/\s/g, '-'), arrival_date: arrival, departure_date: departure });
    setPlate(''); setArrival(defaultArrival); setDeparture(addIsoDay(defaultArrival, 1));
  }

  const days = calDays(arrival, departure);

  return (
    <div style={{ background: '#f4f8fd', borderRadius: 10, border: '1px dashed #aac8e8', padding: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#185fa5', marginBottom: 10 }}>+ Verblijf toevoegen</div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Kenteken</span>
          <input value={plate} onChange={e => setPlate(e.target.value.toUpperCase())}
            placeholder="AB-123-C" onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            style={{ padding: '7px 10px', border: '1.5px solid #aac8e8', borderRadius: 7, fontSize: 15, fontWeight: 700, width: 130, color: '#0a2240', textTransform: 'uppercase', letterSpacing: '1px' }} />
          <span style={{ fontSize: 10, color: '#aab8cc' }}>{days > 0 ? `${days} dag${days !== 1 ? 'en' : ''}` : ' '}</span>
          <button onClick={handleAdd} disabled={!plate.trim() || !arrival || !departure}
            style={{ marginTop: 4, padding: '8px 0', background: plate.trim() && arrival && departure ? '#0a7c6e' : '#b0c8c0', color: 'white', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: plate.trim() ? 'pointer' : 'not-allowed', width: 130 }}>
            + Toevoegen
          </button>
        </div>
        <CalendarRangePicker arrival={arrival} departure={departure} onChange={(a, d) => { setArrival(a); setDeparture(d); }} />
      </div>
    </div>
  );
}

// ── EV Session inline form ────────────────────────────────────
function EvSessionForm({
  date, existing, defaultRate, defaultStartFee, onSave, onDelete, onClose,
}: {
  date: string; existing?: any; defaultRate: number; defaultStartFee: number;
  onSave: (data: any) => Promise<void>; onDelete?: () => Promise<void>; onClose: () => void;
}) {
  const [kwh, setKwh] = useState(existing ? String(existing.kwh) : '');
  const [ratePerKwh, setRatePerKwh] = useState(existing ? String(existing.rate_per_kwh) : String(defaultRate));
  const [startFee, setStartFee] = useState(existing ? String(existing.start_fee) : String(defaultStartFee));
  const [notes, setNotes] = useState(existing?.notes || '');
  const [saving, setSaving] = useState(false);

  const total = (parseFloat(kwh) || 0) * (parseFloat(ratePerKwh) || 0) + (parseFloat(startFee) || 0);

  async function handleSave() {
    if (!kwh) return;
    setSaving(true);
    try {
      await onSave({ kwh: parseFloat(kwh) || 0, rate_per_kwh: parseFloat(ratePerKwh) || 0, start_fee: parseFloat(startFee) || 0, notes });
      onClose();
    } catch (e: any) { toastError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 8, padding: 10, marginTop: 4, width: 220 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', marginBottom: 6 }}><><Zap size={11} style={{ display:'inline', verticalAlign:'middle', marginRight:3 }} />{fmtDayShort(date)}</></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label style={{ fontSize: 11, color: '#7090b0', display: 'flex', flexDirection: 'column', gap: 2 }}>
          kWh
          <input type="number" step="0.1" min="0" value={kwh} onChange={e => setKwh(e.target.value)} autoFocus
            style={{ padding: '5px 7px', border: '1px solid #f59e0b', borderRadius: 5, fontSize: 13, fontWeight: 700, width: '100%' }} />
        </label>
        <label style={{ fontSize: 11, color: '#7090b0', display: 'flex', flexDirection: 'column', gap: 2 }}>
          €/kWh
          <input type="number" step="0.01" min="0" value={ratePerKwh} onChange={e => setRatePerKwh(e.target.value)}
            style={{ padding: '5px 7px', border: '1px solid rgba(10,34,64,0.15)', borderRadius: 5, fontSize: 12, width: '100%' }} />
        </label>
        <label style={{ fontSize: 11, color: '#7090b0', display: 'flex', flexDirection: 'column', gap: 2 }}>
          Starttarief €
          <input type="number" step="0.01" min="0" value={startFee} onChange={e => setStartFee(e.target.value)}
            style={{ padding: '5px 7px', border: '1px solid rgba(10,34,64,0.15)', borderRadius: 5, fontSize: 12, width: '100%' }} />
        </label>
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notitie (optioneel)"
          style={{ padding: '5px 7px', border: '1px solid rgba(10,34,64,0.15)', borderRadius: 5, fontSize: 11, width: '100%' }} />
        <div style={{ fontSize: 11, color: '#0a2240', fontWeight: 700, textAlign: 'right' }}>
          Totaal: € {total.toFixed(2).replace('.', ',')}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={handleSave} disabled={saving || !kwh}
            style={{ flex: 1, padding: '6px 0', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {saving ? '…' : '✓ Opslaan'}
          </button>
          {onDelete && (
            <button onClick={async () => { if (confirm('Sessie verwijderen?')) { setSaving(true); try { await onDelete(); onClose(); } catch(e:any){toastError(e.message);} finally {setSaving(false);} } }}
              style={{ padding: '6px 8px', background: 'none', border: '0.5px solid rgba(200,50,50,0.3)', color: '#c83232', borderRadius: 5, fontSize: 12, cursor: 'pointer' }}>
              <Trash2 size={13} style={{ display:'inline', verticalAlign:'middle' }} />
            </button>
          )}
          <button onClick={onClose} style={{ padding: '6px 8px', background: '#f4f6f9', border: '0.5px solid rgba(10,34,64,0.15)', color: '#556070', borderRadius: 5, fontSize: 12, cursor: 'pointer' }}><X size={13} /></button>
        </div>
      </div>
    </div>
  );
}

// ── EV Calendar (seasonal: full day grid, non-seasonal: per-cell button) ────
function EvCalendar({
  customerId, days, evSessions, defaultRate, defaultStartFee, onSessionsChange, invoicedDates,
}: {
  customerId: string; days: Date[]; evSessions: Record<string, any>;
  defaultRate: number; defaultStartFee: number;
  onSessionsChange: () => void;
  invoicedDates?: Set<string>;
}) {
  const [openDate, setOpenDate] = useState<string | null>(null);

  async function handleSave(date: string, existing: any | undefined, data: any) {
    try {
      if (existing) {
        await api.contractEvSessions.update(existing.id, data);
        toast(`EV sessie bijgewerkt ✓`);
      } else {
        await api.contractEvSessions.add(customerId, { session_date: date, ...data });
        toast(`EV sessie opgeslagen ✓`);
      }
      onSessionsChange();
    } catch (e: any) { toastError(e.message); throw e; }
  }

  async function handleDelete(id: string) {
    await api.contractEvSessions.remove(id);
    toast('EV sessie verwijderd');
    onSessionsChange();
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
      {days.map((d, i) => {
        const iso = isoDate(d);
        const session = evSessions[iso];
        const isToday = iso === isoDate(new Date());
        const isOpen = openDate === iso;
        const isInvoiced = invoicedDates?.has(iso) ?? false;

        return (
          <div key={iso} style={{ position: 'relative' }}>
            <div style={{
              border: isToday ? '1.5px solid #f59e0b' : isInvoiced ? '0.5px solid rgba(10,34,64,0.15)' : '0.5px solid rgba(10,34,64,0.15)',
              borderRadius: 8, padding: '8px 6px',
              background: isInvoiced ? 'repeating-linear-gradient(45deg,#f0f0f0,#f0f0f0 4px,#e8e8e8 4px,#e8e8e8 8px)' : session ? '#fffbeb' : i >= 5 ? '#f8fafc' : 'white',
              minHeight: 64, opacity: isInvoiced ? 0.75 : 1,
            }}>
              <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: isToday ? '#f59e0b' : isInvoiced ? '#b0b8c4' : '#7090b0', textTransform: 'uppercase' }}>{DAY_LABELS[i].slice(0,3)}</div>
              <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: isInvoiced ? '#b0b8c4' : '#0a2240', marginTop: 2 }}>{d.getDate()}/{d.getMonth()+1}</div>
              {isInvoiced && <div style={{ textAlign: 'center', fontSize: 9, color: '#b0b8c4', marginTop: 2 }}>✓ gefact.</div>}
              <div style={{ marginTop: 6, textAlign: 'center' }}>
                {session ? (
                  <button onClick={() => setOpenDate(isOpen ? null : iso)}
                    style={{ background: '#f59e0b', color: 'white', border: 'none', borderRadius: 5, padding: '3px 6px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'block', width: '100%' }}>
                    <><Zap size={11} style={{ display:'inline', verticalAlign:'middle', marginRight:2 }} />{Number(session.kwh).toFixed(1)} kWh</>
                  </button>
                ) : (
                  <button onClick={() => setOpenDate(isOpen ? null : iso)}
                    style={{ background: 'none', border: '0.5px dashed rgba(245,158,11,0.4)', color: '#d97706', borderRadius: 5, padding: '3px 6px', fontSize: 11, cursor: 'pointer', display: 'block', width: '100%' }}>
                    <><span>+</span><Zap size={11} style={{ display:'inline', verticalAlign:'middle', marginLeft:2 }} /></>
                  </button>
                )}
              </div>
            </div>
            {isOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, minWidth: 220 }}>
                <EvSessionForm
                  date={iso} existing={session} defaultRate={defaultRate} defaultStartFee={defaultStartFee}
                  onSave={(data) => handleSave(iso, session, data)}
                  onDelete={session ? () => handleDelete(session.id) : undefined}
                  onClose={() => setOpenDate(null)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Seasonal calendar: no car count, just EV ──────────────────
function SeasonalEvCalendar({
  customerId, days, evSessions, defaultRate, defaultStartFee, onSessionsChange, invoicedDates,
}: {
  customerId: string; days: Date[]; evSessions: Record<string, any>;
  defaultRate: number; defaultStartFee: number;
  onSessionsChange: () => void;
  invoicedDates?: Set<string>;
}) {
  return (
    <div>
      <div style={{ marginBottom: 8, fontSize: 12, color: '#7090b0' }}>
        Seizoensklant — auto staat altijd aanwezig. Registreer EV laadsessies per dag.
        {invoicedDates && invoicedDates.size > 0 && (
          <span style={{ marginLeft: 10, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ display: 'inline-block', width: 14, height: 10, borderRadius: 2, background: 'repeating-linear-gradient(45deg,#f0f0f0,#f0f0f0 3px,#e0e0e0 3px,#e0e0e0 6px)', border: '0.5px solid #ccc' }} />
            = al gefactureerd
          </span>
        )}
      </div>
      <EvCalendar
        customerId={customerId} days={days} evSessions={evSessions}
        defaultRate={defaultRate} defaultStartFee={defaultStartFee}
        onSessionsChange={onSessionsChange} invoicedDates={invoicedDates}
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function ContractInvoicesPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState<string>('');
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));

  // Daily entries
  const [entries, setEntries] = useState<Record<string, number>>({});
  const [originalEntries, setOriginalEntries] = useState<Record<string, number>>({});
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [saving, setSaving] = useState(false);

  // Vehicle stays
  const [stays, setStays] = useState<any[]>([]);
  const [loadingStays, setLoadingStays] = useState(false);
  const [editingStay, setEditingStay] = useState<string | null>(null);
  const [editStayData, setEditStayData] = useState<any>(null);

  // EV sessions
  const [evSessions, setEvSessions] = useState<Record<string, any>>({});
  const [loadingEv, setLoadingEv] = useState(false);

  const [periodFrom, setPeriodFrom] = useState<string>('');
  const [periodTo, setPeriodTo] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>('');
  const [paymentTermDays, setPaymentTermDays] = useState<string>('30');
  const [generating, setGenerating] = useState(false);

  const [invoices, setInvoices] = useState<any[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // EV charging lines (manual)
  const [evLines, setEvLines] = useState<{ id: string; description: string; kwh: string; ratePerKwh: string }[]>([]);

  // Invoiced periods (for calendar marking + auto-suggest)
  const [invoicedPeriods, setInvoicedPeriods] = useState<{ invoice_number: string; period_from: string; period_to: string }[]>([]);

  const entriesRef = useRef<Record<string, number>>({});
  const originalRef = useRef<Record<string, number>>({});
  const customerIdRef = useRef<string>('');
  useEffect(() => { entriesRef.current = entries; }, [entries]);
  useEffect(() => { originalRef.current = originalEntries; }, [originalEntries]);
  useEffect(() => { customerIdRef.current = customerId; }, [customerId]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const selectedCustomer = customers.find(c => c.id === customerId);
  const isFixedPeriod = (selectedCustomer?.rate_type || 'daily') === 'fixed_period';
  const isSeasonal = (selectedCustomer?.rate_type || 'daily') === 'seasonal';
  const evEnabled = !!selectedCustomer?.ev_enabled;

  useEffect(() => {
    setRecentIds(getRecentIds());
    loadCustomers();
    setInvoiceDate(isoDate(new Date()));
  }, []);

  useEffect(() => {
    if (!customerId) { setEntries({}); setOriginalEntries({}); setStays([]); setEvLines([]); setEvSessions({}); setInvoicedPeriods([]); return; }
    if (isFixedPeriod) { loadStays(); }
    else if (!isSeasonal) { loadEntries(); }
    if (evEnabled || isSeasonal) { loadEvSessions(); }
    loadInvoices();
    loadInvoicedPeriods();
    setPeriodFrom(isoDate(days[0]));
    setPeriodTo(isoDate(days[6]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  useEffect(() => {
    if (!customerId) return;
    if (isFixedPeriod) { loadStays(); }
    else if (!isSeasonal) { loadEntries(); }
    if (evEnabled || isSeasonal) { loadEvSessions(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  async function loadCustomers() {
    try {
      const list = await api.contractCustomers.list();
      const active = list.filter((c: any) => c.is_active);
      setCustomers(active);
      // Auto-select: use recent id if available, else first
      const recent = getRecentIds();
      const firstPick = recent.find((id: string) => active.some((c: any) => c.id === id)) || (active.length > 0 ? active[0].id : '');
      if (firstPick && !customerId) setCustomerId(firstPick);
    } catch (e: any) { toastError(e.message); }
  }

  async function loadEntries() {
    if (!customerId) return;
    setLoadingEntries(true);
    try {
      const from = isoDate(days[0]), to = isoDate(days[6]);
      const rows = await api.contractCustomers.entries(customerId, from, to);
      const map: Record<string, number> = {};
      rows.forEach((r: any) => { map[String(r.entry_date).slice(0, 10)] = Number(r.car_count); });
      setEntries(map); setOriginalEntries({ ...map });
    } catch (e: any) { toastError(e.message); }
    finally { setLoadingEntries(false); }
  }

  async function loadStays() {
    if (!customerId) return;
    setLoadingStays(true);
    try {
      const from = isoDate(addDays(weekStart, -30));
      const to = isoDate(addDays(weekStart, 30));
      const rows = await api.contractCustomers.vehicleStays(customerId, from, to);
      setStays(rows);
    } catch (e: any) { toastError(e.message); }
    finally { setLoadingStays(false); }
  }

  async function loadEvSessions() {
    if (!customerId) return;
    setLoadingEv(true);
    try {
      const from = isoDate(days[0]), to = isoDate(days[6]);
      const rows = await api.contractEvSessions.list(customerId, from, to);
      const map: Record<string, any> = {};
      rows.forEach((r: any) => { map[String(r.session_date).slice(0,10)] = r; });
      setEvSessions(map);
    } catch (e: any) { toastError(e.message); }
    finally { setLoadingEv(false); }
  }

  async function loadInvoices() {
    if (!customerId) return;
    setLoadingInvoices(true);
    try { setInvoices(await api.contractInvoices.list(customerId)); }
    catch (e: any) { toastError(e.message); }
    finally { setLoadingInvoices(false); }
  }

  async function loadInvoicedPeriods() {
    if (!customerId) return;
    try {
      const periods = await api.contractCustomers.invoicedPeriods(customerId);
      setInvoicedPeriods(periods);
      // Auto-suggest periodFrom for seasonal customers: day after last invoice's period_to
      if (isSeasonal && periods.length > 0) {
        const lastTo = periods.reduce((max, p) => p.period_to > max ? p.period_to : max, periods[0].period_to);
        const nextDay = addIsoDay(lastTo, 1);
        setPeriodFrom(nextDay);
        setPeriodTo(isoDate(new Date())); // default to today
      } else if (isSeasonal) {
        // No invoices yet — suggest season_start_date or today
        const ssd = selectedCustomer?.season_start_date ? String(selectedCustomer.season_start_date).slice(0, 10) : null;
        if (ssd) setPeriodFrom(ssd);
        setPeriodTo(isoDate(new Date()));
      }
    } catch (e: any) { /* silently ignore */ }
  }

  // Customer selection with recent tracking
  function selectCustomer(id: string) {
    setCustomerId(id);
    pushRecentId(id);
    setRecentIds(getRecentIds());
  }

  // Daily entries
  function setCars(date: string, value: string) {
    const n = Math.max(0, Math.round(parseInt(value || '0', 10) || 0));
    setEntries(prev => {
      const next = { ...prev, [date]: n };
      const monIso = isoDate(days[0]);
      if (date === monIso && n > 0) {
        for (let i = 1; i <= 3; i++) { const dIso = isoDate(days[i]); if (!prev[dIso]) next[dIso] = n; }
      }
      return next;
    });
  }

  useEffect(() => {
    if (!customerId || loadingEntries || isFixedPeriod || isSeasonal) return;
    let hasDiff = false;
    for (const d of days) { const iso = isoDate(d); if ((entries[iso]??0) !== (originalEntries[iso]??0)) { hasDiff = true; break; } }
    if (!hasDiff) return;
    const t = setTimeout(() => saveEntries(), 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  async function saveEntries() {
    const cid = customerIdRef.current; if (!cid) return;
    const cur = entriesRef.current, orig = originalRef.current;
    const payload: any[] = [];
    days.forEach(d => {
      const iso = isoDate(d), c = cur[iso]??0, o = orig[iso]??0;
      if (c !== o) payload.push({ date: iso, car_count: c });
    });
    if (payload.length === 0) return;
    setSaving(true);
    try { await api.contractCustomers.saveEntries(cid, payload); setOriginalEntries({ ...cur }); }
    catch (e: any) { toastError(e.message); }
    finally { setSaving(false); }
  }

  // Vehicle stays
  async function addStay(data: any) {
    if (!customerId) return;
    try {
      await api.contractCustomers.addVehicleStay(customerId, data);
      toast(`${data.license_plate} toegevoegd ✓`);
      await loadStays();
    } catch (e: any) { toastError(e.message); }
  }

  async function removeStay(id: string, plate: string) {
    if (!confirm(`${plate} verwijderen?`)) return;
    try {
      await api.contractVehicleStays.remove(id);
      setStays(prev => prev.filter(s => s.id !== id));
      toast('Verwijderd');
    } catch (e: any) { toastError(e.message); }
  }

  function startEdit(stay: any) { setEditingStay(stay.id); setEditStayData({ ...stay }); }

  async function saveStay() {
    if (!editStayData) return;
    try {
      await api.contractVehicleStays.update(editStayData.id, {
        license_plate: editStayData.license_plate,
        arrival_date: editStayData.arrival_date,
        departure_date: editStayData.departure_date,
      });
      toast('Opgeslagen ✓');
      setEditingStay(null); setEditStayData(null);
      await loadStays();
    } catch (e: any) { toastError(e.message); }
  }

  // Quick date adjust (±1 dag) en afgehaald
  async function adjustStayDate(id: string, field: 'arrival_date' | 'departure_date', delta: number) {
    const stay = stays.find(s => s.id === id);
    if (!stay) return;
    const newDate = addIsoDay(stay[field], delta);
    // Prevent departure before arrival
    if (field === 'departure_date' && newDate < stay.arrival_date) return;
    if (field === 'arrival_date' && newDate > stay.departure_date) return;
    try {
      await api.contractVehicleStays.update(id, { [field]: newDate });
      setStays(prev => prev.map(s => s.id === id ? { ...s, [field]: newDate } : s));
    } catch (e: any) { toastError(e.message); }
  }

  async function markPickedUp(id: string, clear = false) {
    try {
      const row = await api.contractVehicleStays.update(id, { picked_up_at: clear ? false : true });
      setStays(prev => prev.map(s => s.id === id ? { ...s, picked_up_at: row.picked_up_at ?? null } : s));
      toast(clear ? 'Afgehaald ongedaan gemaakt' : 'Afgehaald geregistreerd ✓');
    } catch (e: any) { toastError(e.message); }
  }

  // EV helpers (manual lines)
  function addEvLine() {
    setEvLines(prev => [...prev, { id: Math.random().toString(36).slice(2), description: '', kwh: '', ratePerKwh: String(selectedCustomer?.ev_rate_per_kwh || '0.35') }]);
  }
  function updateEvLine(id: string, field: string, value: string) {
    setEvLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  }
  function removeEvLine(id: string) {
    setEvLines(prev => prev.filter(l => l.id !== id));
  }
  function parsedEvLines() {
    return evLines.map(l => ({ description: l.description, kwh: parseFloat(l.kwh) || 0, ratePerKwh: parseFloat(l.ratePerKwh) || 0 }));
  }

  // Invoice
  async function showPreview() {
    if (!customerId || !periodFrom || !periodTo) { toastError('Klant + periode kiezen'); return; }
    setGenerating(true);
    try {
      if (!isFixedPeriod && !isSeasonal) await saveEntries();
      const blob = await fetchContractInvoicePreview(customerId, periodFrom, periodTo, parsedEvLines(), invoiceDate || undefined, Number(paymentTermDays) || 30);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e: any) { toastError(e.message); }
    finally { setGenerating(false); }
  }

  async function finalizeInvoice() {
    if (!customerId || !periodFrom || !periodTo) { toastError('Klant + periode kiezen'); return; }
    if (!confirm(`Definitieve factuur maken van ${periodFrom} t/m ${periodTo}?`)) return;
    setGenerating(true);
    try {
      if (!isFixedPeriod && !isSeasonal) await saveEntries();
      const r = await api.contractCustomers.finalizeInvoice(customerId, periodFrom, periodTo, parsedEvLines(), invoiceDate || undefined, Number(paymentTermDays) || 30);
      toast(`Factuur ${r.invoice_number} aangemaakt ✓`);
      await loadInvoices();
      await loadInvoicedPeriods();
    } catch (e: any) { toastError(e.message); }
    finally { setGenerating(false); }
  }

  async function openInvoice(id: string) {
    try {
      const blob = await fetchContractInvoicePdf(id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e: any) { toastError(e.message); }
  }

  async function deleteInvoice(id: string, nr: string) {
    if (!confirm(`Factuur ${nr} verwijderen?`)) return;
    try { await api.contractInvoices.remove(id); await loadInvoices(); toast('Factuur verwijderd'); }
    catch (e: any) { toastError(e.message); }
  }

  const [sendingInvoice, setSendingInvoice] = useState<string | null>(null);
  async function sendInvoice(id: string, nr: string) {
    if (!confirm(`Factuur ${nr} per e-mail versturen naar de klant?`)) return;
    setSendingInvoice(id);
    try {
      const r = await api.contractInvoices.sendEmail(id);
      toast(`Factuur verstuurd naar ${r.email} ✓`);
      await loadInvoices();
    } catch (e: any) { toastError(e?.message || 'Versturen mislukt'); }
    finally { setSendingInvoice(null); }
  }

  const weekTotal = days.reduce((s, d) => s + (entries[isoDate(d)] || 0), 0);
  const weekStays = stays.filter(s => s.arrival_date <= isoDate(days[6]) && s.departure_date >= isoDate(days[0]));

  // Set of all invoiced ISO date strings (for calendar marking)
  const invoicedDates = useMemo(() => {
    const set = new Set<string>();
    for (const p of invoicedPeriods) {
      let cur = new Date(p.period_from + 'T12:00:00');
      const end = new Date(p.period_to + 'T12:00:00');
      while (cur <= end) {
        set.add(isoDate(cur));
        cur = addDays(cur, 1);
      }
    }
    return set;
  }, [invoicedPeriods]);

  // Last invoiced date for the "Al gefactureerd t/m" indicator
  const lastInvoicedTo = useMemo(() => {
    if (invoicedPeriods.length === 0) return null;
    return invoicedPeriods.reduce((max, p) => p.period_to > max ? p.period_to : max, invoicedPeriods[0].period_to);
  }, [invoicedPeriods]);

  // Stay price helper
  function stayPrice(s: any): number {
    const d = calDays(s.arrival_date, s.departure_date);
    const fpd = parseInt(selectedCustomer?.fixed_period_days || 2);
    const fpr = parseFloat(selectedCustomer?.fixed_period_rate || 0);
    const edr = parseFloat(selectedCustomer?.extra_day_rate || 0);
    return d <= fpd ? fpr : fpr + (d - fpd) * edr;
  }

  // Build sorted customer list for quick buttons
  const sortedCustomers = useMemo(() => {
    if (customers.length === 0) return [];
    const recent = getRecentIds();
    const withOrder = customers.map(c => ({ ...c, _order: recent.indexOf(c.id) }));
    return [...withOrder].sort((a, b) => {
      const oa = a._order === -1 ? 999 : a._order;
      const ob = b._order === -1 ? 999 : b._order;
      if (oa !== ob) return oa - ob;
      return a.name.localeCompare(b.name);
    });
  }, [customers, recentIds]);

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 1100 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Contractfacturatie</h1>
        <p style={{ margin: '0 0 22px', fontSize: 13, color: '#7090b0' }}>
          {isFixedPeriod
            ? 'Registreer kentekens per verblijf en maak facturen op basis van het vaste tarief per periode.'
            : isSeasonal
            ? 'Seizoensklant — auto staat doorlopend gestald. Registreer EV laadsessies en maak facturen.'
            : 'Registreer per dag het aantal auto\'s en maak facturen op basis van het dagtarief.'}
        </p>

        {/* Klant + tarief — Quick buttons */}
        <div className="card" style={{ padding: 16, marginBottom: 18 }}>
          <span style={labelSt}>Klant kiezen</span>
          {customers.length === 0 ? (
            <span style={{ fontSize: 13, color: '#c83232', display: 'block', marginTop: 6 }}>
              Geen contractklanten. Voeg ze toe via <a href="/settings/contract-customers" style={{ color: '#0a7c6e', fontWeight: 700 }}>Instellingen → Contractklanten</a>.
            </span>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {sortedCustomers.map(c => {
                const isSelected = c.id === customerId;
                return (
                  <button key={c.id} onClick={() => selectCustomer(c.id)}
                    style={{
                      padding: '7px 14px', borderRadius: 20, border: isSelected ? 'none' : '1px solid rgba(10,34,64,0.2)',
                      background: isSelected ? '#0a2240' : 'white', color: isSelected ? 'white' : '#0a2240',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                      fontWeight: isSelected ? 700 : 500, transition: 'all 0.15s',
                    }}>
                    <span style={{ fontSize: 13 }}>{c.name}</span>
                    {c.company && <span style={{ fontSize: 10, opacity: 0.7 }}>{c.company}</span>}
                  </button>
                );
              })}
            </div>
          )}
          {selectedCustomer && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '0.5px solid rgba(10,34,64,0.08)', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={labelSt}>Tarief</span>
              {isFixedPeriod ? (
                <span style={{ fontSize: 13, fontWeight: 700, color: '#185fa5' }}>
                  € {parseFloat(selectedCustomer.fixed_period_rate||0).toFixed(2).replace('.',',')} / {selectedCustomer.fixed_period_days||2} dag(en)
                  {parseFloat(selectedCustomer.extra_day_rate||0) > 0 && (
                    <span style={{ fontWeight: 400, color: '#7090b0' }}> + € {parseFloat(selectedCustomer.extra_day_rate).toFixed(2).replace('.',',')} extra/dag</span>
                  )}
                </span>
              ) : isSeasonal ? (
                <span style={{ fontSize: 13, fontWeight: 700, color: '#8b5cf6' }}>
                  Hoog: € {parseFloat(selectedCustomer.high_season_rate||0).toFixed(2).replace('.',',')} · Laag: € {parseFloat(selectedCustomer.low_season_rate||0).toFixed(2).replace('.',',')}
                  <span style={{ fontWeight: 400, color: '#7090b0' }}> ({selectedCustomer.high_season_from||'04-01'}–{selectedCustomer.high_season_until||'09-30'})</span>
                  {selectedCustomer.license_plate && (
                    <span style={{ marginLeft: 10, fontFamily: 'monospace', letterSpacing: '1px', background: '#f4f8fd', padding: '2px 8px', borderRadius: 5, border: '1px solid #aac8e8', fontSize: 12 }}>
                      {selectedCustomer.license_plate}
                    </span>
                  )}
                </span>
              ) : (
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0a7c6e' }}>
                  € {parseFloat(selectedCustomer.daily_rate||0).toFixed(2).replace('.',',')} per auto/dag
                </span>
              )}
              {selectedCustomer.ev_enabled && (
                <span style={{ fontSize: 12, color: '#d97706', fontWeight: 600 }}>
                  <><Zap size={11} style={{ display:'inline', verticalAlign:'middle', marginRight:3 }} />EV: € {parseFloat(selectedCustomer.ev_rate_per_kwh||0.35).toFixed(4).replace('.',',')}/kWh</>
                  {parseFloat(selectedCustomer.ev_start_fee||0) > 0 && (
                    <span style={{ fontWeight: 400 }}> + € {parseFloat(selectedCustomer.ev_start_fee).toFixed(2).replace('.',',')} start</span>
                  )}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Dagregistratie (daily only, not seasonal) ── */}
        {customerId && !isFixedPeriod && !isSeasonal && (
          <div className="card" style={{ padding: 18, marginBottom: 18 }}>
            <WeekNav days={days} weekStart={weekStart} setWeekStart={setWeekStart} saving={saving} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: evEnabled ? 16 : 0 }}>
              {days.map((d, i) => {
                const iso = isoDate(d);
                const isToday = iso === isoDate(new Date());
                const session = evSessions[iso];
                return (
                  <div key={iso} style={{ border: isToday ? '1.5px solid #0a7c6e' : '0.5px solid rgba(10,34,64,0.15)', borderRadius: 8, padding: '10px 8px', background: i >= 5 ? '#f8fafc' : 'white' }}>
                    <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: isToday ? '#0a7c6e' : '#7090b0', textTransform: 'uppercase' }}>{DAY_LABELS[i].slice(0,3)}</div>
                    <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#0a2240', marginTop: 2 }}>{d.getDate()}/{d.getMonth()+1}</div>
                    <input type="number" min="0" value={entries[iso]??''} onChange={e => setCars(iso, e.target.value)} onBlur={saveEntries} placeholder="0" disabled={loadingEntries}
                      style={{ width: '100%', marginTop: 8, padding: '7px 6px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, textAlign: 'center', fontSize: 18, fontWeight: 700, color: '#0a2240', background: (entries[iso]||0) > 0 ? '#e6f7f5' : 'white', boxSizing: 'border-box' }} />
                    <div style={{ textAlign: 'center', fontSize: 10, color: '#aab8cc', marginTop: 3 }}>auto&apos;s</div>
                    {evEnabled && session && (
                      <div style={{ marginTop: 4, textAlign: 'center', fontSize: 10, color: '#d97706', fontWeight: 700 }}><><Zap size={11} style={{ display:'inline', verticalAlign:'middle', marginRight:2 }} />{Number(session.kwh).toFixed(1)} kWh</></div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* EV calendar for daily+ev customers */}
            {evEnabled && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid rgba(10,34,64,0.08)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#d97706', marginBottom: 8 }}><><Zap size={12} style={{ display:'inline', verticalAlign:'middle', marginRight:4 }} />EV laadsessies</></div>
                {loadingEv ? <div style={{ fontSize: 12, color: '#aab8cc' }}>Laden…</div> : (
                  <EvCalendar
                    customerId={customerId} days={days} evSessions={evSessions}
                    defaultRate={parseFloat(selectedCustomer?.ev_rate_per_kwh || 0.35)}
                    defaultStartFee={parseFloat(selectedCustomer?.ev_start_fee || 0)}
                    onSessionsChange={loadEvSessions}
                  />
                )}
              </div>
            )}

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '0.5px solid rgba(10,34,64,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, color: '#556070' }}>
                <strong>Weektotaal:</strong> {weekTotal} auto-dagen
                {selectedCustomer && <> · € {(weekTotal * parseFloat(selectedCustomer.daily_rate||0)).toFixed(2).replace('.',',')} incl. BTW</>}
              </div>
              <button onClick={saveEntries} disabled={saving} style={navBtnSt}>{saving ? 'Opslaan…' : 'Direct opslaan'}</button>
            </div>
          </div>
        )}

        {/* ── Seizoensklant: EV kalender ── */}
        {customerId && isSeasonal && (
          <div className="card" style={{ padding: 18, marginBottom: 18 }}>
            <WeekNav days={days} weekStart={weekStart} setWeekStart={setWeekStart} saving={false} />
            {loadingEv ? <div style={{ fontSize: 12, color: '#aab8cc' }}>Laden…</div> : (
              <SeasonalEvCalendar
                customerId={customerId} days={days} evSessions={evSessions}
                defaultRate={parseFloat(selectedCustomer?.ev_rate_per_kwh || 0.35)}
                defaultStartFee={parseFloat(selectedCustomer?.ev_start_fee || 0)}
                onSessionsChange={loadEvSessions}
                invoicedDates={invoicedDates}
              />
            )}
          </div>
        )}

        {/* ── Kenteken-verblijven (fixed_period) ── */}
        {customerId && isFixedPeriod && (
          <div className="card" style={{ padding: 18, marginBottom: 18 }}>
            <WeekNav days={days} weekStart={weekStart} setWeekStart={setWeekStart} saving={false} />
            <div style={{ marginBottom: 16 }}>
              <AddStayForm onAdd={addStay} defaultArrival={isoDate(new Date())} />
            </div>
            {loadingStays && <div style={{ color: '#7090b0', fontSize: 13, padding: '8px 0' }}>Laden…</div>}
            {!loadingStays && weekStays.length === 0 && (
              <div style={{ color: '#aab8cc', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>Geen kentekens rondom deze week.</div>
            )}
            {weekStays.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f4f6f9' }}>
                    <th style={thSt}>Kenteken</th>
                    <th style={thSt}>Aankomst</th>
                    <th style={thSt}>Vertrek</th>
                    <th style={thSt}>Afgehaald</th>
                    <th style={{ ...thSt, textAlign: 'right' }}>Dagen</th>
                    <th style={{ ...thSt, textAlign: 'right' }}>Bedrag</th>
                    <th style={{ ...thSt, textAlign: 'right' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {weekStays.map((s, i) => {
                    const fpd = parseInt(selectedCustomer?.fixed_period_days||2);
                    const isEditing = editingStay === s.id;
                    const displayStay = isEditing ? editStayData : s;
                    const days_ = calDays(displayStay.arrival_date, displayStay.departure_date);
                    const price = stayPrice(displayStay);
                    const hasExtra = days_ > fpd;
                    const pickedUp = s.picked_up_at ? new Date(s.picked_up_at) : null;
                    return (
                      <tr key={s.id} style={{ borderBottom: '0.5px solid rgba(10,34,64,0.06)', background: pickedUp ? '#f0faf8' : i % 2 === 0 ? 'white' : '#f8f9fb' }}>
                        <td style={tdSt}>
                          {isEditing
                            ? <input value={editStayData.license_plate} onChange={e => setEditStayData((p:any) => ({...p, license_plate: e.target.value.toUpperCase()}))}
                                style={{ padding: '4px 7px', border: '1px solid #aac8e8', borderRadius: 5, fontSize: 13, fontWeight: 700, width: 110, letterSpacing: '1px' }} />
                            : <strong style={{ fontFamily: 'monospace', letterSpacing: '1px' }}>{s.license_plate}</strong>
                          }
                        </td>
                        {/* Aankomst met ±1 dag knoppen */}
                        <td style={tdSt}>
                          {isEditing
                            ? <input type="date" value={editStayData.arrival_date} onChange={e => setEditStayData((p:any) => ({...p, arrival_date: e.target.value}))}
                                style={{ padding: '4px 7px', border: '1px solid #aac8e8', borderRadius: 5, fontSize: 12 }} />
                            : <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <button onClick={() => adjustStayDate(s.id, 'arrival_date', -1)} style={nudgeBtnSt} title="1 dag eerder"><Minus size={10} /></button>
                                <span>{fmtShort(s.arrival_date)}</span>
                                <button onClick={() => adjustStayDate(s.id, 'arrival_date', 1)} style={nudgeBtnSt} title="1 dag later"><Plus size={10} /></button>
                              </div>
                          }
                        </td>
                        {/* Vertrek met ±1 dag knoppen */}
                        <td style={tdSt}>
                          {isEditing
                            ? <input type="date" value={editStayData.departure_date} min={editStayData.arrival_date} onChange={e => setEditStayData((p:any) => ({...p, departure_date: e.target.value}))}
                                style={{ padding: '4px 7px', border: '1px solid #aac8e8', borderRadius: 5, fontSize: 12 }} />
                            : <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <button onClick={() => adjustStayDate(s.id, 'departure_date', -1)} style={nudgeBtnSt} title="1 dag eerder"><Minus size={10} /></button>
                                <span>{fmtShort(s.departure_date)}</span>
                                <button onClick={() => adjustStayDate(s.id, 'departure_date', 1)} style={nudgeBtnSt} title="1 dag later"><Plus size={10} /></button>
                              </div>
                          }
                        </td>
                        {/* Afgehaald */}
                        <td style={tdSt}>
                          {pickedUp ? (
                            <span style={{ fontSize: 12, color: '#0a7c6e', fontWeight: 700 }}>
                              afgehaald om: {pickedUp.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ) : (
                            <button onClick={() => markPickedUp(s.id)} style={{ padding: '4px 10px', background: '#f0faf8', border: '1px solid #0a7c6e', color: '#0a7c6e', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <PackageCheck size={12} />Afgehaald
                            </button>
                          )}
                        </td>
                        <td style={{ ...tdSt, textAlign: 'right' }}>
                          <span style={{ color: hasExtra ? '#e8a020' : '#0a2240', fontWeight: hasExtra ? 700 : 400 }}>{days_}</span>
                          {hasExtra && <span style={{ fontSize: 10, color: '#e8a020', marginLeft: 3 }}>(+{days_-fpd} extra)</span>}
                        </td>
                        <td style={{ ...tdSt, textAlign: 'right', fontWeight: 700 }}>€ {price.toFixed(2).replace('.',',')}</td>
                        <td style={{ ...tdSt, textAlign: 'right' }}>
                          {isEditing
                            ? <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                <button onClick={() => { setEditingStay(null); setEditStayData(null); }}
                                  style={{ ...actBtnSt, color: '#556070', border: '0.5px solid rgba(10,34,64,0.2)' }}><X size={13} /></button>
                                <button onClick={saveStay}
                                  style={{ ...actBtnSt, background: '#0a7c6e', color: 'white', border: 'none' }}><Check size={13} /></button>
                              </div>
                            : <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                <button onClick={() => startEdit(s)} style={{ ...actBtnSt, color: '#3a80c0', border: '0.5px solid #aac8e8' }}><Pencil size={13} /></button>
                                <button onClick={() => removeStay(s.id, s.license_plate)} style={{ ...actBtnSt, color: '#c83232', border: '0.5px solid rgba(200,50,50,0.3)' }}><Trash2 size={13} /></button>
                              </div>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '1px solid #0a2240' }}>
                    <td colSpan={4} style={{ ...tdSt, fontWeight: 700, fontSize: 12, color: '#556070' }}>Totaal zichtbare periode</td>
                    <td style={{ ...tdSt, textAlign: 'right', fontWeight: 700 }}>{weekStays.length}</td>
                    <td style={{ ...tdSt, textAlign: 'right', fontWeight: 900, color: '#0a2240' }}>
                      € {weekStays.reduce((s, stay) => s + stayPrice(stay), 0).toFixed(2).replace('.',',')}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}

        {/* Factuur genereren */}
        {customerId && (
          <div className="card" style={{ padding: 18, marginBottom: 18 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#0a2240' }}>Factuur maken</h2>

            {/* Seasonal status indicators */}
            {isSeasonal && (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, padding: '8px 12px', background: '#f4f8fd', borderRadius: 8, border: '0.5px solid rgba(10,34,64,0.1)', fontSize: 12 }}>
                {selectedCustomer?.season_start_date && (
                  <span style={{ color: '#185fa5' }}>
                    <CalendarDays size={12} style={{ display:'inline', verticalAlign:'middle', marginRight:4 }} /> Seizoenstart: <strong>{fmtShort(String(selectedCustomer.season_start_date).slice(0, 10))}</strong>
                  </span>
                )}
                {lastInvoicedTo ? (
                  <span style={{ color: '#0a7c6e' }}>
                    ✓ Al gefactureerd t/m: <strong>{fmtShort(lastInvoicedTo)}</strong>
                    <span style={{ color: '#aab8cc', marginLeft: 6 }}>— volgende periode begint {fmtShort(addIsoDay(lastInvoicedTo, 1))}</span>
                  </span>
                ) : selectedCustomer?.season_start_date ? (
                  <span style={{ color: '#7090b0' }}>Nog geen facturen — eerste periode begint op seizoenstart</span>
                ) : (
                  <span style={{ color: '#7090b0' }}>Nog geen facturen</span>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={labelSt}>Van</span>
                <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)}
                  style={{ padding: '7px 10px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, fontSize: 13 }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={labelSt}>Tot en met</span>
                <input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)}
                  style={{ padding: '7px 10px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, fontSize: 13 }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={labelSt}>Factuurdatum</span>
                <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)}
                  style={{ padding: '7px 10px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, fontSize: 13 }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={labelSt}>Betaaltermijn (dagen)</span>
                <input type="number" min={0} value={paymentTermDays} onChange={e => setPaymentTermDays(e.target.value)}
                  style={{ padding: '7px 10px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, fontSize: 13, width: 130 }} />
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => { setPeriodFrom(isoDate(days[0])); setPeriodTo(isoDate(days[6])); }} style={{ ...navBtnSt, fontSize: 11 }}>Deze week</button>
                <button onClick={() => {
                  const now = new Date();
                  setPeriodFrom(isoDate(new Date(now.getFullYear(), now.getMonth(), 1)));
                  setPeriodTo(isoDate(new Date(now.getFullYear(), now.getMonth()+1, 0)));
                }} style={{ ...navBtnSt, fontSize: 11 }}>Deze maand</button>
                <button onClick={() => {
                  const now = new Date();
                  setPeriodFrom(isoDate(new Date(now.getFullYear(), now.getMonth()-1, 1)));
                  setPeriodTo(isoDate(new Date(now.getFullYear(), now.getMonth(), 0)));
                }} style={{ ...navBtnSt, fontSize: 11 }}>Vorige maand</button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <button onClick={showPreview} disabled={generating}
                  style={{ padding: '8px 14px', background: 'white', border: '1px solid #0a7c6e', color: '#0a7c6e', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {generating ? '…' : <><Eye size={14} style={{ display:'inline', verticalAlign:'middle', marginRight:4 }} />Voorbeeld</>}
                </button>
                <button className="btn btn-primary btn-sm" onClick={finalizeInvoice} disabled={generating}
                  style={{ padding: '8px 14px', fontSize: 13 }}>
                  {generating ? '…' : <><FileText size={14} style={{ display:'inline', verticalAlign:'middle', marginRight:4 }} />Definitieve factuur</>}
                </button>
              </div>
            </div>

            {/* EV opladen — handmatige regels */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '0.5px solid rgba(10,34,64,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: evLines.length > 0 ? 10 : 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#556070' }}><><Zap size={12} style={{ display:'inline', verticalAlign:'middle', marginRight:4 }} />EV opladen (extra)</></span>
                <button onClick={addEvLine}
                  style={{ padding: '4px 10px', background: '#f0faf8', border: '1px solid #0a7c6e', color: '#0a7c6e', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  + EV lijn toevoegen
                </button>
                {(evEnabled || isSeasonal) && (
                  <span style={{ fontSize: 11, color: '#d97706' }}>EV sessies uit kalender worden automatisch meegenomen</span>
                )}
                {evLines.length > 0 && (
                  <span style={{ fontSize: 12, color: '#7090b0', marginLeft: 'auto' }}>
                    EV totaal: <strong style={{ color: '#0a2240' }}>€ {evLines.reduce((s, l) => s + (parseFloat(l.kwh)||0) * (parseFloat(l.ratePerKwh)||0), 0).toFixed(2).replace('.',',')}</strong>
                  </span>
                )}
              </div>
              {evLines.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {evLines.map(l => {
                    const lineTotal = (parseFloat(l.kwh)||0) * (parseFloat(l.ratePerKwh)||0);
                    return (
                      <div key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: '#f8fafc', borderRadius: 6, padding: '6px 10px', border: '0.5px solid rgba(10,34,64,0.1)' }}>
                        <input value={l.description} onChange={e => updateEvLine(l.id, 'description', e.target.value)}
                          placeholder="Kenteken / omschrijving"
                          style={{ flex: '1 1 160px', minWidth: 120, padding: '5px 8px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 5, fontSize: 12 }} />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                          <span style={{ color: '#7090b0' }}>kWh</span>
                          <input type="number" step="0.1" min="0" value={l.kwh} onChange={e => updateEvLine(l.id, 'kwh', e.target.value)}
                            style={{ width: 80, padding: '5px 7px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 5, fontSize: 12, textAlign: 'right' }} />
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                          <span style={{ color: '#7090b0' }}>€/kWh</span>
                          <input type="number" step="0.01" min="0" value={l.ratePerKwh} onChange={e => updateEvLine(l.id, 'ratePerKwh', e.target.value)}
                            style={{ width: 70, padding: '5px 7px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 5, fontSize: 12, textAlign: 'right' }} />
                        </label>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#0a2240', minWidth: 70, textAlign: 'right' }}>€ {lineTotal.toFixed(2).replace('.',',')}</span>
                        <button onClick={() => removeEvLine(l.id)}
                          style={{ background: 'none', border: '0.5px solid rgba(200,50,50,0.3)', color: '#c83232', borderRadius: 5, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}><Trash2 size={13} /></button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Eerdere facturen */}
        {customerId && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '0.5px solid rgba(10,34,64,0.08)' }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0a2240' }}>Eerdere facturen</h2>
            </div>
            {loadingInvoices && <div style={{ padding: 20, color: '#7090b0' }}>Laden…</div>}
            {!loadingInvoices && invoices.length === 0 && (
              <div style={{ padding: 20, color: '#7090b0', fontSize: 13, textAlign: 'center' }}>Nog geen facturen voor deze klant.</div>
            )}
            {invoices.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f4f6f9', color: '#556070' }}>
                    <th style={thSt}>Factuurnr.</th>
                    <th style={thSt}>Periode</th>
                    <th style={{ ...thSt, textAlign: 'right' }}>Auto&apos;s</th>
                    <th style={{ ...thSt, textAlign: 'right' }}>Totaal</th>
                    <th style={thSt}>Aangemaakt</th>
                    <th style={{ ...thSt, textAlign: 'right' }}>Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv, i) => (
                    <tr key={inv.id} style={{ borderBottom: '0.5px solid rgba(10,34,64,0.06)', background: i%2===0 ? 'white' : '#f8f9fb' }}>
                      <td style={{ ...tdSt, fontWeight: 700, color: '#0a2240' }}>{inv.invoice_number}</td>
                      <td style={tdSt}>{new Date(inv.period_from).toLocaleDateString('nl-NL',{day:'numeric',month:'short'})} – {new Date(inv.period_to).toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'})}</td>
                      <td style={{ ...tdSt, textAlign: 'right' }}>{inv.total_cars}</td>
                      <td style={{ ...tdSt, textAlign: 'right', fontWeight: 700 }}>€ {parseFloat(inv.total_incl_vat).toFixed(2).replace('.',',')}</td>
                      <td style={{ ...tdSt, color: '#7090b0', fontSize: 12 }}>{new Date(inv.created_at).toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'})}</td>
                      <td style={{ ...tdSt, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {inv.sent_at && <span title={`Verstuurd op ${new Date(inv.sent_at).toLocaleString('nl-NL')}`} style={{ fontSize: 10, fontWeight: 700, color: '#2a7a3a', marginRight: 6 }}>✓ verstuurd</span>}
                        <button onClick={() => openInvoice(inv.id)} style={{ background: '#0a7c6e', color: 'white', border: 'none', borderRadius: 5, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', marginRight: 4 }}>PDF</button>
                        <button onClick={() => sendInvoice(inv.id, inv.invoice_number)} disabled={sendingInvoice === inv.id} style={{ background: '#0a2240', color: 'white', border: 'none', borderRadius: 5, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: sendingInvoice === inv.id ? 'default' : 'pointer', marginRight: 4, opacity: sendingInvoice === inv.id ? 0.6 : 1 }}>{sendingInvoice === inv.id ? 'Versturen…' : (inv.sent_at ? 'Opnieuw mailen' : 'Mailen')}</button>
                        <button onClick={() => deleteInvoice(inv.id, inv.invoice_number)} style={{ background: 'none', border: '0.5px solid rgba(200,50,50,0.3)', color: '#c83232', borderRadius: 5, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

// ── WeekNav ───────────────────────────────────────────────────
// ISO-weeknummer (maandag = start van de week)
function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // donderdag van deze week
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}

function WeekNav({ days, weekStart, setWeekStart, saving }: { days: Date[]; weekStart: Date; setWeekStart: (d: Date) => void; saving: boolean }) {
  function sw(d: Date): Date {
    const r = new Date(d); r.setHours(12,0,0,0);
    const dow = r.getDay(); r.setDate(r.getDate() + (dow===0 ? -6 : 1-dow)); return r;
  }
  function ad(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 10 }}>
        <button onClick={() => setWeekStart(ad(weekStart,-7))} style={navBtnSt}>← Vorige week</button>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Week {isoWeekNumber(days[0])}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0a2240' }}>{fmtLong(days[0])} – {fmtLong(days[6])}</div>
        </div>
        <button onClick={() => setWeekStart(ad(weekStart, 7))} style={navBtnSt}>Volgende week →</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
        <button onClick={() => setWeekStart(sw(new Date()))} style={{ ...navBtnSt, fontSize: 11 }}>Vandaag</button>
        <input type="date" onChange={e => { if (e.target.value) setWeekStart(sw(new Date(e.target.value+'T12:00:00'))); }}
          style={{ padding: '5px 8px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, fontSize: 12 }} />
        {saving && <span style={{ fontSize: 11, color: '#7090b0' }}>opslaan…</span>}
      </div>
    </div>
  );
}

const labelSt: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px' };
const navBtnSt: React.CSSProperties = { padding: '6px 12px', background: 'white', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, fontSize: 13, color: '#0a2240', cursor: 'pointer', fontWeight: 600 };
const thSt: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase' };
const tdSt: React.CSSProperties = { padding: '9px 14px' };
const actBtnSt: React.CSSProperties = { padding: '4px 8px', borderRadius: 5, fontSize: 12, cursor: 'pointer', background: 'white' };
const nudgeBtnSt: React.CSSProperties = { padding: '2px 5px', borderRadius: 4, fontSize: 11, cursor: 'pointer', background: 'white', border: '0.5px solid rgba(10,34,64,0.25)', color: '#3a6090', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 };
const calNavSt: React.CSSProperties = { background: 'none', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a2240' };
