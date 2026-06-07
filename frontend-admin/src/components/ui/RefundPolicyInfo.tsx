'use client';

// Toont welke annuleringsregel van toepassing is + (indien verzet) de oorspronkelijke aankomstdatum.
function fmtDate(iso: string) {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default function RefundPolicyInfo({ info }: { info: any }) {
  if (!info) return null;
  return (
    <div style={{ background: '#f4f6f9', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#556070', lineHeight: 1.5 }}>
      <div style={{ fontWeight: 700, color: '#0a2240', marginBottom: 2 }}>
        Annuleringsbeleid: {info.refundPct}% restitutie
      </div>
      <div>{info.policyDescription}</div>
      <div style={{ marginTop: 3, color: '#7090b0' }}>
        {info.daysUntilArrival >= 0
          ? `Nog ${info.daysUntilArrival} dag${info.daysUntilArrival === 1 ? '' : 'en'} tot aankomst`
          : 'Aankomstdatum is verstreken'}
      </div>
      {info.wasModified && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '0.5px solid rgba(10,34,64,0.1)', color: '#a06010' }}>
          ⚠ Reservering is verzet. Beleid op basis van de <strong>oorspronkelijke</strong> aankomstdatum:<br />
          <strong>{fmtDate(info.anchorDate)}</strong>
        </div>
      )}
    </div>
  );
}
