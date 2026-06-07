'use client';
import { useState, useEffect } from 'react';
import { CheckIcon, LockClosedIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { bookingApi } from '@/lib/api';

export default function CancellationPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    bookingApi.getByToken(params.token)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.token]);

  async function cancel() {
    if (!confirm('Weet u zeker dat u wilt annuleren?')) return;
    setCancelling(true);
    try {
      await bookingApi.cancelByToken(params.token);
      setDone(true);
    } catch (e: any) { setError(e.message); }
    finally { setCancelling(false); }
  }

  const S = {
    page: { minHeight: '100vh', background: '#f4f6f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 } as const,
    card: { background: 'white', borderRadius: 14, padding: '32px 28px', maxWidth: 500, width: '100%', border: '0.5px solid rgba(10,34,64,0.1)', boxShadow: '0 4px 24px rgba(10,34,64,0.08)' } as const,
  };

  if (loading) return <div style={S.page}><div style={S.card}><p style={{ color: '#7090b0', textAlign: 'center' }}>Laden...</p></div></div>;
  if (error) return <div style={S.page}><div style={S.card}><p style={{ color: '#8a2020', textAlign: 'center' }}>{error}</p></div></div>;

  if (done) return (
    <div style={S.page}>
      <div style={{ ...S.card, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#eaf1fb', color: '#19499e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><CheckIcon className="w-7 h-7" /></div>
        <h2 style={{ margin: '0 0 8px', color: '#142440' }}>Reservering geannuleerd</h2>
        <p style={{ color: '#7090b0', fontSize: 14 }}>U ontvangt een bevestiging per e-mail met informatie over de restitutie.</p>
        {data?.refundInfo && data.refundInfo.refundAmount > 0 && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: '#f4f6f9', borderRadius: 8, fontSize: 13 }}>
            Restitutie: <strong>€ {data.refundInfo.refundAmount.toFixed(2)}</strong> ({data.refundInfo.refundPct}%) — binnen 5–10 werkdagen
          </div>
        )}
      </div>
    </div>
  );

  const res = data;

  // Geïmporteerde Umbraco-boeking — annuleren via nieuw systeem niet toegestaan
  const isImported = /^DB-\d{4}-U\d+$/.test(res?.reference || '');

  // Check if already checked in or completed — cancellation not allowed
  const isCheckedIn = res?.status === 'checked_in' || res?.status === 'completed';

  // During-stay detection
  const arrStr = res?.arrival_date?.slice(0, 10);
  const depStr = res?.departure_date?.slice(0, 10);
  const todayStr = new Date().toISOString().split('T')[0];
  const isDuringStay = arrStr && depStr && todayStr >= arrStr && todayStr < depStr;

  // Block when during stay OR already checked in
  const isLocked = isDuringStay || isCheckedIn;

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, background: '#19499e', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#ffffff', margin: '0 auto 12px' }}>AB</div>
          <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: '#142440' }}>Reservering annuleren</h2>
          <p style={{ margin: 0, color: '#7090b0', fontSize: 13 }}>Autostalling De Bazuin</p>
        </div>

        <div style={{ background: '#f4f6f9', borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
          <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 16, color: '#142440', marginBottom: 10 }}>{res.reference}</div>
          {[
            ['Naam', `${res.first_name} ${res.last_name}`],
            ['Aankomst', new Date(res.arrival_date).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })],
            ['Vertrek', new Date(res.departure_date).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })],
            ['Totaal betaald', `€ ${parseFloat(res.total_price).toFixed(2)}`],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, borderBottom: '0.5px solid rgba(10,34,64,0.07)' }}>
              <span style={{ color: '#7090b0' }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Melding originele aankomstdatum als reservering gewijzigd is */}
        {res.policy_anchor_date && res.arrival_date &&
          res.policy_anchor_date.slice(0, 10) !== res.arrival_date.slice(0, 10) && (
          <div style={{ background: '#fff8e6', border: '0.5px solid #e8a020', borderRadius: 8, padding: '12px 14px', marginBottom: 12, fontSize: 13, color: '#7a5010' }}>
            <div style={{ fontWeight: 700, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}><ExclamationTriangleIcon className="w-4 h-4" />Datum gewijzigd</div>
            <div>
              Uw reservering is eerder gewijzigd. Het annuleringsbeleid wordt bepaald op basis van uw <strong>originele aankomstdatum</strong>:{' '}
              <strong>{new Date(res.policy_anchor_date.slice(0, 10) + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong>.
            </div>
          </div>
        )}

        {res.refundInfo && !isLocked && !isImported && (
          <div style={{
            background: res.payment_status !== 'paid' ? '#f4f6f9' : res.refundInfo.refundPct > 0 ? '#eaf1fb' : '#fdeaea',
            border: `0.5px solid ${res.payment_status !== 'paid' ? 'rgba(10,34,64,0.15)' : res.refundInfo.refundPct > 0 ? '#19499e' : '#8a2020'}`,
            borderRadius: 8, padding: '12px 14px', marginBottom: 20, fontSize: 13,
          }}>
            {res.payment_status !== 'paid' ? (
              <>
                <div style={{ fontWeight: 700, marginBottom: 4, color: '#556070' }}>Restitutie: niet van toepassing</div>
                <div style={{ color: '#7090b0', fontSize: 12 }}>Uw reservering is nog niet betaald — er wordt geen restitutie verwerkt.</div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, marginBottom: 4, color: res.refundInfo.refundPct > 0 ? '#19499e' : '#8a2020' }}>
                  {res.refundInfo.refundPct > 0 ? `Restitutie: € ${res.refundInfo.refundAmount.toFixed(2)} (${res.refundInfo.refundPct}%)` : 'Geen restitutie van toepassing'}
                </div>
                <div style={{ color: '#7090b0', fontSize: 12 }}>{res.refundInfo.policyDescription}</div>
              </>
            )}
          </div>
        )}

        {/* Geblokkeerd: geïmporteerde boeking — via oud systeem annuleren */}
        {isImported ? (
          <div style={{ background: '#fff8e6', border: '1.5px solid #e8a020', borderRadius: 10, padding: '18px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 10 }}>📧</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#142440', marginBottom: 8 }}>
              Annuleer via uw originele bevestigingsmail
            </div>
            <div style={{ fontSize: 13, color: '#556070', lineHeight: 1.6 }}>
              Deze reservering is gemaakt via ons vorige boekingssysteem.<br />
              Gebruik de <strong>annuleringslink in uw originele bevestigingsmail</strong> om te annuleren — zo verloopt de eventuele restitutie correct.
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: '#9ab0c8' }}>
              Kunt u de mail niet vinden? Neem dan contact met ons op.
            </div>
          </div>
        ) : isLocked ? (
          <div style={{ background: '#f4f6f9', border: '1.5px solid rgba(10,34,64,0.15)', borderRadius: 10, padding: '16px 18px', textAlign: 'center' }}>
            <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center', color: '#142440' }}><LockClosedIcon className="w-7 h-7" /></div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#142440', marginBottom: 6 }}>Annuleren niet meer mogelijk</div>
            <div style={{ fontSize: 13, color: '#7090b0' }}>
              {isDuringStay
                ? 'Annuleren is niet mogelijk tijdens uw verblijf.'
                : 'Annuleren is niet meer mogelijk omdat uw voertuig reeds is ingecheckt bij Autostalling De Bazuin.'}
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: '#7090b0' }}>
              Heeft u een vraag? WhatsApp ons via de bevestigingsmail.
            </div>
          </div>
        ) : (
          <>
            <button onClick={cancel} disabled={cancelling}
              style={{ width: '100%', padding: '13px', borderRadius: 9, background: '#8a2020', color: 'white', border: 'none', fontSize: 15, fontWeight: 700, cursor: cancelling ? 'not-allowed' : 'pointer', opacity: cancelling ? 0.7 : 1 }}>
              {cancelling ? 'Annuleren...' : 'Bevestig annulering'}
            </button>
            <p style={{ textAlign: 'center', fontSize: 12, color: '#7090b0', marginTop: 12 }}>
              Vragen? WhatsApp ons via de bevestigingsmail.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
