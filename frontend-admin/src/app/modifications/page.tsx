'use client';
import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import Toaster, { toast, toastError } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { UserIcon, TruckIcon, MapIcon, HomeIcon, CalendarDaysIcon, CheckIcon, XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { Zap, Ship } from 'lucide-react';

function fmtDate(iso: string) {
  return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('nl-NL', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtMoney(n: number) {
  return `€ ${n.toFixed(2).replace('.', ',')}`;
}

// ── Type-specific card body ────────────────────────────────────
function ModCardBody({ m, details, priceDiff, isDuringStay }: { m: any; details: any; priceDiff: number; isDuringStay: boolean }) {
  const modType = m.modification_type || 'dates';

  if (modType === 'contact') {
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 8 }}>Contactwijziging</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'start' }}>
          <div style={{ background: '#f4f6f9', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', marginBottom: 6 }}>HUIDIG</div>
            <div style={{ fontSize: 12, color: '#0a2240', marginBottom: 3 }}>
              <span style={{ color: '#7090b0' }}>E-mail: </span>{details.oldEmail || '—'}
            </div>
            <div style={{ fontSize: 12, color: '#0a2240' }}>
              <span style={{ color: '#7090b0' }}>Telefoon: </span>{details.oldPhone || '—'}
            </div>
          </div>
          <div style={{ fontSize: 20, color: '#0a7c6e', fontWeight: 700, alignSelf: 'center' }}>→</div>
          <div style={{ background: '#e6f7f5', borderRadius: 8, padding: '10px 14px', border: '1.5px solid #0a7c6e' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#0a7c6e', marginBottom: 6 }}>NIEUW GEVRAAGD</div>
            <div style={{ fontSize: 12, color: '#0a2240', marginBottom: 3 }}>
              <span style={{ color: '#7090b0' }}>E-mail: </span>{details.newEmail || '—'}
            </div>
            <div style={{ fontSize: 12, color: '#0a2240' }}>
              <span style={{ color: '#7090b0' }}>Telefoon: </span>{details.newPhone || '—'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (modType === 'plate') {
    const vehicles: { vehicleId: string; oldPlate: string; newPlate: string }[] = details.vehicles || [];
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 8 }}>Kentekenwijziging</div>
        {vehicles.map((v, i) => (
          <div key={v.vehicleId} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: '#7090b0', minWidth: 60 }}>Voertuig {i + 1}</span>
            <span style={{ background: '#0a2240', color: 'white', borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>{v.oldPlate}</span>
            <span style={{ fontSize: 16, color: '#0a7c6e', fontWeight: 700 }}>→</span>
            <span style={{ background: '#0a7c6e', color: 'white', borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>{v.newPlate}</span>
          </div>
        ))}
        {vehicles.length === 0 && <p style={{ color: '#7090b0', fontSize: 12 }}>Geen voertuiggegevens.</p>}
      </div>
    );
  }

  if (modType === 'ferry') {
    const dest = details.requestedDestination
      ? details.requestedDestination.charAt(0).toUpperCase() + details.requestedDestination.slice(1)
      : null;

    const shipLabel = (isFast: boolean | null) =>
      isFast === true ? <><Zap size={11} style={{ display:'inline', verticalAlign:'middle', marginRight:3 }} />Sneldienst</> : isFast === false ? <><Ship size={11} style={{ display:'inline', verticalAlign:'middle', marginRight:3 }} />Veerdienst</> : null;

    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 8 }}>
          Boottijdenwijziging{dest ? ` — ${dest}` : ''}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'start', marginBottom: 10 }}>

          {/* Huidig */}
          <div style={{ background: '#f4f6f9', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', marginBottom: 8 }}>HUIDIG</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', marginBottom: 3 }}>HEENREIS</div>
            <div style={{ fontSize: 12, color: '#0a2240', marginBottom: 8 }}>
              Vertrek: <strong>{details.currentOutboundTime?.slice(0, 5) || '—'}</strong>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', marginBottom: 3 }}>TERUGREIS</div>
            <div style={{ fontSize: 12, color: '#0a2240' }}>
              Vertrek: <strong>{details.currentReturnTime?.slice(0, 5) || '—'}</strong>
            </div>
          </div>

          <div style={{ fontSize: 20, color: '#0a7c6e', fontWeight: 700, alignSelf: 'center' }}>→</div>

          {/* Gewenst */}
          <div style={{ background: '#e6f7f5', borderRadius: 8, padding: '10px 14px', border: '1.5px solid #0a7c6e' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#0a7c6e', marginBottom: 8 }}>GEWENST</div>

            {details.newOutboundTime ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', marginBottom: 3 }}>HEENREIS</div>
                <div style={{ fontSize: 12, color: '#0a2240' }}>
                  Vertrek Harlingen: <strong>{details.newOutboundTime.slice(0, 5)}</strong>
                </div>
                {details.newOutboundArrivalTime && (
                  <div style={{ fontSize: 12, color: '#0a2240' }}>
                    Aankomst eiland: <strong>{details.newOutboundArrivalTime}</strong>
                  </div>
                )}
                {shipLabel(details.newOutboundIsFast) && (
                  <div style={{ fontSize: 11, color: '#556070', marginTop: 2, marginBottom: 6 }}>
                    {shipLabel(details.newOutboundIsFast)}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#7090b0', marginBottom: 8 }}>Heenreis: ongewijzigd</div>
            )}

            {details.newReturnTime ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', marginBottom: 3 }}>TERUGREIS</div>
                <div style={{ fontSize: 12, color: '#0a2240' }}>
                  Vertrek eiland: <strong>{details.newReturnTime.slice(0, 5)}</strong>
                </div>
                {details.newReturnArrivalHarlingen && (
                  <div style={{ fontSize: 12, color: '#0a2240' }}>
                    Aankomst Harlingen: <strong>{details.newReturnArrivalHarlingen}</strong>
                  </div>
                )}
                {shipLabel(details.newReturnIsFast) && (
                  <div style={{ fontSize: 11, color: '#556070', marginTop: 2 }}>
                    {shipLabel(details.newReturnIsFast)}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#7090b0' }}>Terugreis: ongewijzigd</div>
            )}
          </div>
        </div>

        {details.notes && (
          <div style={{ background: '#f8f9fb', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#556070' }}>
            <span style={{ fontWeight: 700 }}>Opmerking klant: </span>{details.notes}
          </div>
        )}
      </div>
    );
  }

  if (modType === 'checkedin_departure') {
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#1a6bb5', textTransform: 'uppercase', marginBottom: 8 }}>Vervroegd vertrek</div>
        <div style={{ fontSize: 13, color: '#0a2240', marginBottom: 10 }}>Klant wil eerder ophalen</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center' }}>
          <div style={{ background: '#f4f6f9', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', marginBottom: 4 }}>HUIDIG VERTREK</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0a2240' }}>{fmtDate(m.old_departure_date)}</div>
          </div>
          <div style={{ fontSize: 20, color: '#1a6bb5', fontWeight: 700 }}>→</div>
          <div style={{ background: '#e6f1fb', borderRadius: 8, padding: '10px 14px', border: '1.5px solid #1a6bb5' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#1a6bb5', marginBottom: 4 }}>NIEUW VERTREK</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a6bb5' }}>{fmtDate(m.new_departure_date)}</div>
          </div>
        </div>
        <div style={{ marginTop: 10, background: '#f4f6f9', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#556070' }}>
          Geen restitutie — prijs blijft ongewijzigd op {fmtMoney(parseFloat(m.old_total_price))}.
        </div>
      </div>
    );
  }

  // Default: 'dates'
  return (
    <>
      {/* Datumwijziging grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <div style={{ background: '#f4f6f9', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', marginBottom: 4 }}>HUIDIG</div>
          <div style={{ fontSize: 12, color: '#0a2240' }}>{fmtDate(m.old_arrival_date)} →</div>
          <div style={{ fontSize: 12, color: '#0a2240' }}>{fmtDate(m.old_departure_date)}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0a2240', marginTop: 4 }}>{fmtMoney(parseFloat(m.old_total_price))}</div>
        </div>
        <div style={{ fontSize: 20, color: '#0a7c6e', fontWeight: 700 }}>→</div>
        <div style={{ background: isDuringStay ? '#fff8e6' : '#e6f7f5', borderRadius: 8, padding: '10px 14px', border: `1.5px solid ${isDuringStay ? '#e8a020' : '#0a7c6e'}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: isDuringStay ? '#7a5010' : '#0a7c6e', marginBottom: 4 }}>
            {isDuringStay ? 'VERLENGD TOT' : 'NIEUW GEVRAAGD'}
          </div>
          <div style={{ fontSize: 12, color: '#0a2240' }}>{fmtDate(m.new_arrival_date)} →</div>
          <div style={{ fontSize: 12, color: '#0a2240' }}>{fmtDate(m.new_departure_date)}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: isDuringStay ? '#7a5010' : '#0a7c6e', marginTop: 4 }}>{fmtMoney(parseFloat(m.new_total_price))}</div>
        </div>
      </div>

      {/* Prijsverschil */}
      {priceDiff !== 0 && (
        <div style={{ background: isDuringStay ? '#fff8e6' : priceDiff > 0 ? '#fff8e6' : '#e6f7f5', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>
          {isDuringStay ? (
            <span>
              Betaald door klant: <strong>{details.extraDays} extra dag{details.extraDays !== 1 ? 'en' : ''}</strong>
              {details.duringStayDailyRate ? ` × ${fmtMoney(details.duringStayDailyRate)}` : ''}
              {' '}= <strong>{fmtMoney(priceDiff)}</strong>
              {details.paymentIntentId && (
                <span style={{ color: '#7090b0', fontSize: 11, marginLeft: 8 }}>PI: {details.paymentIntentId.slice(0, 20)}...</span>
              )}
            </span>
          ) : priceDiff > 0 ? (
            <span>Bij te betalen: <strong>{fmtMoney(priceDiff)}</strong></span>
          ) : (
            <span>Restitutie na acceptatie: <strong>{fmtMoney(Math.abs(priceDiff))}</strong></span>
          )}
        </div>
      )}

      {/* During-stay info */}
      {isDuringStay && (
        <div style={{ background: '#e6f7f5', border: '0.5px solid #0a7c6e', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#0a7c6e' }}>
          Reservering is reeds bijgewerkt na betaling — klik bevestigen om de melding te sluiten.
        </div>
      )}
    </>
  );
}

export default function ModificationsPage() {
  const [mods, setMods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [sendEmail, setSendEmail] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    setLoading(true);
    api.modifications.pending()
      .then(setMods)
      .catch(e => toastError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function accept(id: string) {
    setProcessing(id);
    try {
      await api.modifications.accept(id, notes[id] || '', sendEmail[id] ?? true);
      toast('Wijziging bevestigd ✓');
      load();
    } catch (e: any) { toastError(e.message); }
    finally { setProcessing(null); }
  }

  async function reject(id: string) {
    setProcessing(id);
    try {
      await api.modifications.reject(id, notes[id] || '', sendEmail[id] ?? false);
      toast('Wijziging afgewezen');
      load();
    } catch (e: any) { toastError(e.message); }
    finally { setProcessing(null); }
  }

  // Label shown in card header per modification type
  function modTypeLabel(modType: string): { icon: React.ReactNode; text: string } {
    switch (modType) {
      case 'contact':             return { icon: <UserIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle'}} />, text: 'Persoonsgegevens' };
      case 'plate':               return { icon: <TruckIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle'}} />, text: 'Kenteken' };
      case 'ferry':               return { icon: <MapIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle'}} />, text: 'Boottijden' };
      case 'checkedin_departure': return { icon: <HomeIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle'}} />, text: 'Vervroegd vertrek' };
      default:                    return { icon: <CalendarDaysIcon className="w-3 h-3" style={{display:'inline',verticalAlign:'middle'}} />, text: 'Data' };
    }
  }

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '24px 28px', maxWidth: 900 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>
            Wijzigingsverzoeken
            {mods.length > 0 && (
              <span style={{ marginLeft: 10, background: '#e8a020', color: '#0a2240', borderRadius: 12, padding: '2px 10px', fontSize: 13, fontWeight: 800 }}>
                {mods.length}
              </span>
            )}
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: '#7090b0' }}>
            Klantwijzigingen die goedkeuring vereisen — accepteer of wijs af met optionele bevestigingsmail.
          </p>
        </div>

        {loading && <p style={{ color: '#7090b0' }}>Laden...</p>}

        {!loading && mods.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#7090b0' }}>
            <CheckCircleIcon className="w-10 h-10" style={{ marginBottom: 12, color: '#7090b0' }} />
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Geen openstaande wijzigingen</div>
            <div style={{ fontSize: 13 }}>Alle klantwijzigingen zijn verwerkt.</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {mods.map(m => {
            const details = m.change_details ? (typeof m.change_details === 'string' ? JSON.parse(m.change_details) : m.change_details) : {};
            const isDuringStay = m.during_stay;
            const isAutoApplied = isDuringStay && details.autoApplied;
            const priceDiff = parseFloat(m.price_difference || 0);
            const busy = processing === m.id;
            const modType = m.modification_type || 'dates';
            const typeLabel = modTypeLabel(modType);

            return (
              <div key={m.id} style={{
                background: 'white',
                border: isDuringStay ? '2px solid #e8a020' : '1px solid rgba(10,34,64,0.1)',
                borderRadius: 12,
                overflow: 'hidden',
              }}>
                {/* Header */}
                <div style={{
                  background: isDuringStay ? '#fff8e6' : '#f4f6f9',
                  padding: '12px 18px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {isDuringStay && isAutoApplied && (
                      <span style={{ background: '#e8a020', color: '#0a2240', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 800 }}>
                        TIJDENS VERBLIJF
                      </span>
                    )}
                    {isDuringStay && !isAutoApplied && (
                      <span style={{ background: '#e8a020', color: '#0a2240', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 800 }}>TIJDENS VERBLIJF</span>
                    )}
                    {modType === 'checkedin_departure' && (
                      <span style={{ background: '#1a6bb5', color: 'white', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 800 }}>
                        VERVROEGD VERTREK
                      </span>
                    )}
                    <span style={{ background: '#e8f0fa', color: '#0a2240', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                      {typeLabel.icon} {typeLabel.text}
                    </span>
                    <span style={{ fontWeight: 800, fontSize: 15, color: '#0a2240' }}>{m.reference}</span>
                    <span style={{ fontSize: 13, color: '#7090b0' }}>{m.first_name} {m.last_name}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#7090b0' }}>Ontvangen: {fmtDateTime(m.created_at)}</div>
                </div>

                <div style={{ padding: '16px 18px' }}>

                  {/* ── Vaste inforegel: kenteken(s) + reserveringsdata ── */}
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
                    background: '#f8f9fb', borderRadius: 8, padding: '8px 12px', marginBottom: 14,
                    fontSize: 12, color: '#556070',
                  }}>
                    {m.plates && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <TruckIcon className="w-4 h-4" style={{ color: '#7090b0' }} />
                        {m.plates.split(', ').map((p: string) => (
                          <span key={p} style={{
                            background: '#0a2240', color: 'white', borderRadius: 4,
                            padding: '2px 9px', fontSize: 12, fontWeight: 700, letterSpacing: 1,
                          }}>{p}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ width: 1, height: 16, background: 'rgba(10,34,64,0.12)', flexShrink: 0 }} />
                    <div style={{ display: 'flex', gap: 14 }}>
                      <span>
                        <span style={{ color: '#7090b0', fontWeight: 700 }}>Aankomst: </span>
                        <strong style={{ color: '#0a2240' }}>{fmtDate(m.arrival_date)}</strong>
                      </span>
                      <span>
                        <span style={{ color: '#7090b0', fontWeight: 700 }}>Vertrek: </span>
                        <strong style={{ color: '#0a2240' }}>{fmtDate(m.departure_date)}</strong>
                      </span>
                    </div>
                  </div>

                  <ModCardBody m={m} details={details} priceDiff={priceDiff} isDuringStay={isDuringStay} />

                  {/* Notitie + email */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                      Opmerking aan klant (optioneel)
                    </label>
                    <textarea
                      value={notes[m.id] || ''}
                      onChange={e => setNotes(n => ({ ...n, [m.id]: e.target.value }))}
                      rows={2} placeholder="Bijv. uw auto staat op vak A12, de nieuwe afhaaldag is aangemeld bij de veerboot..."
                      style={{ width: '100%', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 7, padding: '7px 10px', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }}
                    />
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#556070', marginBottom: 14, cursor: 'pointer' }}>
                    <input type="checkbox"
                      checked={sendEmail[m.id] !== undefined ? sendEmail[m.id] : true}
                      onChange={e => setSendEmail(s => ({ ...s, [m.id]: e.target.checked }))} />
                    Stuur bevestigingsmail naar klant ({m.email})
                  </label>

                  {/* Knoppen */}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => accept(m.id)}
                      disabled={!!busy}
                      style={{
                        flex: 1, padding: '11px', borderRadius: 8,
                        background: busy ? '#ccc' : (isDuringStay ? '#e8a020' : '#0a7c6e'),
                        color: isDuringStay ? '#0a2240' : 'white',
                        border: 'none', fontWeight: 700, fontSize: 14,
                        cursor: busy ? 'not-allowed' : 'pointer',
                      }}>
                      {busy ? 'Bezig...' : isDuringStay ? <><CheckIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Bevestigen</> : <><CheckIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Accepteren</>}
                    </button>
                    {!isDuringStay && (
                      <button
                        onClick={() => reject(m.id)}
                        disabled={!!busy}
                        style={{ flex: 1, padding: '11px', borderRadius: 8, background: 'white', color: '#c83232', border: '1.5px solid #c83232', fontWeight: 700, fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer' }}>
                        <XMarkIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Afwijzen
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}
