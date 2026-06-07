'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  CheckIcon, ArrowRightIcon, ArrowLeftIcon, ArrowPathIcon, EnvelopeIcon,
  DocumentTextIcon, ClipboardDocumentListIcon, BoltIcon, LockClosedIcon,
  CalendarDaysIcon, TruckIcon, UserIcon, ExclamationTriangleIcon, PlusIcon,
  CreditCardIcon, HomeIcon,
} from '@heroicons/react/24/outline';
import { bookingApi } from '@/lib/api';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

type Step =
  | 'loading' | 'menu'
  | 'dates-form' | 'dates-preview' | 'dates-confirming' | 'dates-pay' | 'dates-done'
  | 'dates-pay-preStay' | 'dates-on-site-confirm'
  | 'plate' | 'plate-done'
  | 'contact' | 'phone-done' | 'email-verify-sent'
  | 'ferry' | 'ferry-done'
  | 'all-reservations'
  | 'pending' | 'error';

function fmtDate(iso: string) {
  return new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('nl-NL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ── Stripe sub-component for during-stay (must live inside Elements) ──────────
function DuringStayPaymentForm({
  token, newDeparture, amount, extraDays, dailyRate,
  onSuccess, onError,
}: {
  token: string; newDeparture: string; amount: number; extraDays: number; dailyRate: number;
  onSuccess: () => void; onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    const returnUrl = `${window.location.origin}${window.location.pathname}?pay_type=during_stay&departure=${newDeparture}`;
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: { return_url: returnUrl },
      });
      if (error) { onError(error.message || 'Betaling mislukt'); return; }
      if (paymentIntent?.status === 'succeeded') {
        await bookingApi.modifyDuringStayComplete(token, paymentIntent.id, newDeparture);
        onSuccess();
      } else {
        onError('Betaling niet succesvol. Probeer opnieuw.');
      }
    } catch (err: any) {
      onError(err.message || 'Er is een fout opgetreden');
    } finally {
      setPaying(false);
    }
  }

  return (
    <form onSubmit={handlePay}>
      <PaymentElement options={{ layout: 'tabs' }} />
      <button
        type="submit"
        disabled={paying || !stripe}
        style={{
          width: '100%', marginTop: 20, padding: '13px', borderRadius: 9,
          background: paying ? '#ccc' : '#19499e', color: 'white',
          border: 'none', fontSize: 15, fontWeight: 700,
          cursor: paying ? 'not-allowed' : 'pointer',
        }}
      >
        {paying ? 'Betaling verwerken...' : `Nu betalen — € ${amount.toFixed(2).replace('.', ',')}`}
      </button>
    </form>
  );
}

// ── Stripe sub-component for pre-stay extra payment ────────────────────────────
function PreStayPaymentForm({
  token, newArrival, newDeparture, amount,
  onSuccess, onError,
}: {
  token: string; newArrival: string; newDeparture: string; amount: number;
  onSuccess: () => void; onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    const returnUrl = `${window.location.origin}${window.location.pathname}?pay_type=pre_stay&arrival=${newArrival}&departure=${newDeparture}`;
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: { return_url: returnUrl },
      });
      if (error) { onError(error.message || 'Betaling mislukt'); return; }
      if (paymentIntent?.status === 'succeeded') {
        await bookingApi.modifyDatesStripeComplete(token, paymentIntent.id, newArrival, newDeparture);
        onSuccess();
      } else {
        onError('Betaling niet succesvol. Probeer opnieuw.');
      }
    } catch (err: any) {
      onError(err.message || 'Er is een fout opgetreden');
    } finally {
      setPaying(false);
    }
  }

  return (
    <form onSubmit={handlePay}>
      <PaymentElement options={{ layout: 'tabs' }} />
      <button
        type="submit"
        disabled={paying || !stripe}
        style={{
          width: '100%', marginTop: 20, padding: '13px', borderRadius: 9,
          background: paying ? '#ccc' : '#19499e', color: 'white',
          border: 'none', fontSize: 15, fontWeight: 700,
          cursor: paying ? 'not-allowed' : 'pointer',
        }}
      >
        {paying ? 'Betaling verwerken...' : `Nu betalen — € ${amount.toFixed(2).replace('.', ',')}`}
      </button>
    </form>
  );
}

// ── Ferry schedule picker ────────────────────────────────────────────────────
function FerryPicker({
  label, date, destination, direction, currentTime, selectedTime, onSelect,
}: {
  label: string; date: string; destination: string; direction: string;
  currentTime?: string; selectedTime: string; onSelect: (t: string) => void;
}) {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  const fetchSchedules = useCallback(() => {
    if (!date || !destination) return;
    setLoading(true);
    bookingApi.getFerries(date, destination, direction)
      .then(d => { setSchedules(d.schedules || []); })
      .catch(() => { setSchedules([]); })
      .finally(() => setLoading(false));
  }, [date, destination, direction]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const S = {
    scheduleItem: (selected: boolean): React.CSSProperties => ({
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 12px', borderRadius: 8, marginBottom: 6,
      border: selected ? '1.5px solid #19499e' : '0.5px solid rgba(10,34,64,0.18)',
      background: selected ? '#eaf1fb' : 'white',
      cursor: 'pointer',
    }),
  };

  return (
    <div style={{ background: '#f4f6f9', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      {currentTime && (
        <div style={{ fontSize: 13, color: '#142440', marginBottom: 8 }}>
          <span style={{ color: '#7090b0' }}>Huidige vertrektijd: </span><strong>{currentTime.slice(0, 5)}</strong>
        </div>
      )}

      {loading && <div style={{ fontSize: 12, color: '#7090b0', marginBottom: 8 }}>Laden...</div>}

      {!loading && schedules.length > 0 && !manualMode && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', marginBottom: 6 }}>Beschikbare tijden</div>
          {schedules.map(s => {
            const time = s.departureTime?.slice(0, 5) || '';
            const selected = selectedTime === time;
            return (
              <div key={s.id || time} style={S.scheduleItem(selected)} onClick={() => onSelect(time)}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#142440', minWidth: 40 }}>{time}</span>
                <span style={{ fontSize: 12, color: '#556070' }}>
                  {s.isFast ? <><BoltIcon className="w-3 h-3" style={{ display: 'inline', verticalAlign: 'middle' }} /> Sneldienst</> : <><ArrowRightIcon className="w-3 h-3" style={{ display: 'inline', verticalAlign: 'middle' }} /> Veerdienst</>}
                </span>
                {selected && <CheckIcon className="w-4 h-4" style={{ marginLeft: 'auto', color: '#19499e' }} />}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setManualMode(true)}
            style={{ fontSize: 12, color: '#7090b0', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginTop: 4 }}
          >
            Handmatig tijdstip invoeren
          </button>
        </>
      )}

      {(!loading && (schedules.length === 0 || manualMode)) && (
        <>
          {schedules.length === 0 && !loading && (
            <div style={{ fontSize: 12, color: '#7090b0', marginBottom: 6 }}>Geen rooster gevonden — voer handmatig in:</div>
          )}
          <input
            type="time"
            value={selectedTime}
            onChange={e => onSelect(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, fontSize: 14, color: '#142440', boxSizing: 'border-box' }}
          />
          {manualMode && schedules.length > 0 && (
            <button
              type="button"
              onClick={() => setManualMode(false)}
              style={{ fontSize: 12, color: '#7090b0', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginTop: 4 }}
            >
              Terug naar rooster
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function WijzigenPage({ params }: { params: { token: string } }) {
  const [step, setStep] = useState<Step>('loading');
  const [res, setRes] = useState<any>(null);
  const [error, setError] = useState('');

  // Dates sub-form state
  const [newArrival, setNewArrival] = useState('');
  const [newDeparture, setNewDeparture] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [doneData, setDoneData] = useState<any>(null);

  // During-stay Stripe state
  const [stripeClientSecret, setStripeClientSecret] = useState('');
  const [stripeAmount, setStripeAmount] = useState(0);
  const [stripeExtraDays, setStripeExtraDays] = useState(0);
  const [stripeDailyRate, setStripeDailyRate] = useState(0);

  // Pre-stay Stripe state
  const [stripePreStayClientSecret, setStripePreStayClientSecret] = useState('');
  const [stripePreStayAmount, setStripePreStayAmount] = useState(0);

  // On-site amount state
  const [onSiteAmount, setOnSiteAmount] = useState(0);

  // Overbooking state
  const [useOverbooked, setUseOverbooked] = useState(false);

  // Plate sub-form state
  const [plateValues, setPlateValues] = useState<{ vehicleId: string; oldPlate: string; newPlate: string }[]>([]);
  const [plateLoading, setPlateLoading] = useState(false);

  // Contact sub-form state
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactLoading, setContactLoading] = useState(false);

  // Ferry sub-form state
  const [ferryOutboundTime, setFerryOutboundTime] = useState('');
  const [ferryReturnTime, setFerryReturnTime] = useState('');
  const [ferryNotes, setFerryNotes] = useState('');
  const [ferryLoading, setFerryLoading] = useState(false);
  const [ferrySyncing, setFerrySyncing] = useState(false);
  const [ferryOutboundDest, setFerryOutboundDest] = useState<'terschelling' | 'vlieland'>('terschelling');
  const [ferryReturnDest, setFerryReturnDest] = useState<'terschelling' | 'vlieland'>('terschelling');

  // All reservations state
  const [allReservations, setAllReservations] = useState<any[]>([]);
  const [allResLoading, setAllResLoading] = useState(false);

  // Checkin-earlier validation error
  const [checkinEarlierError, setCheckinEarlierError] = useState('');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  // Compute duringStay
  const duringStay = (() => {
    if (!res) return false;
    const arr = new Date(res.arrival_date?.slice(0, 10) + 'T12:00:00');
    const dep = new Date(res.departure_date?.slice(0, 10) + 'T12:00:00');
    return today >= arr && today < dep;
  })();

  const isCheckedIn = res?.status === 'checked_in';

  useEffect(() => {
    // Detect Stripe redirect return (iDEAL / Wero / redirect-based payment methods)
    const urlParams = new URLSearchParams(window.location.search);
    const piId = urlParams.get('payment_intent');
    const redirectStatus = urlParams.get('redirect_status');
    const payType = urlParams.get('pay_type');
    const returnArrival = urlParams.get('arrival') || '';
    const returnDeparture = urlParams.get('departure') || '';

    bookingApi.getByToken(params.token)
      .then(async data => {
        setRes(data);
        setNewArrival(data.arrival_date?.slice(0, 10) || '');
        setNewDeparture(data.departure_date?.slice(0, 10) || '');
        setContactEmail(data.email || '');
        setContactPhone(data.phone || '');
        const outDest = data.ferry_outbound_destination;
        setFerryOutboundDest(outDest === 'vlieland' ? 'vlieland' : 'terschelling');
        const retDest = data.ferry_return_destination;
        setFerryReturnDest(retDest === 'vlieland' ? 'vlieland' : 'terschelling');
        if (data.vehicles && Array.isArray(data.vehicles)) {
          setPlateValues(data.vehicles.map((v: any) => ({
            vehicleId: v.id,
            oldPlate: v.license_plate,
            newPlate: v.license_plate,
          })));
        }

        // Handle Stripe redirect return
        if (piId && redirectStatus === 'succeeded') {
          try {
            if (payType === 'pre_stay' && returnArrival && returnDeparture) {
              setNewArrival(returnArrival);
              setNewDeparture(returnDeparture);
              await bookingApi.modifyDatesStripeComplete(params.token, piId, returnArrival, returnDeparture);
              setDoneData({ preStayPaid: true });
              setStep('dates-done');
            } else if (payType === 'during_stay' && returnDeparture) {
              setNewDeparture(returnDeparture);
              await bookingApi.modifyDuringStayComplete(params.token, piId, returnDeparture);
              setDoneData({ duringStayPaid: true });
              setStep('dates-done');
            } else {
              setStep('menu');
            }
          } catch (e: any) {
            setError('Betaling ontvangen maar verwerking mislukt: ' + e.message);
            setStep('error');
          }
        } else if (piId && redirectStatus === 'failed') {
          setError('Betaling mislukt of geannuleerd. Probeer opnieuw.');
          setStep('menu');
        } else {
          setStep('menu');
        }
      })
      .catch(e => { setError(e.message); setStep('error'); });
  }, [params.token]);

  // ── Dates handlers ────────────────────────────────────────────
  async function calcPreview() {
    setCheckinEarlierError('');

    // Checked-in: departure can only be set earlier
    if (isCheckedIn && !duringStay) {
      const currentDep = res.departure_date?.slice(0, 10);
      if (newDeparture >= currentDep) {
        setCheckinEarlierError('U kunt de vertrekdatum alleen vervroegen. Voor verlenging, neem contact op.');
        return;
      }
    }

    if (!newArrival || !newDeparture || newDeparture <= newArrival) {
      setError('Kies een geldige aankomst- en vertrekdatum.'); return;
    }
    if (newArrival === res.arrival_date?.slice(0, 10) && newDeparture === res.departure_date?.slice(0, 10)) {
      setError('De nieuwe datums zijn gelijk aan de huidige datums.'); return;
    }
    setError(''); setPreviewLoading(true);
    try {
      const p = await bookingApi.modificationPreview(params.token, newArrival, newDeparture);
      setPreview(p); setStep('dates-preview');
    } catch (e: any) { setError(e.message); }
    finally { setPreviewLoading(false); }
  }

  // Is this a checked-in earlier departure scenario?
  const checkedInEarlier = isCheckedIn && !duringStay && preview && newDeparture < (res?.departure_date?.slice(0, 10) || '');

  async function confirmDates() {
    // If checkedIn with earlier departure → call special endpoint
    if (checkedInEarlier) {
      setStep('dates-confirming');
      try {
        const result = await bookingApi.modifyCheckedinDeparture(params.token, newDeparture);
        setDoneData({ pending: true });
        setStep('dates-done');
      } catch (e: any) { setError(e.message); setStep('dates-preview'); }
      return;
    }

    // If duringStay and amount due > 0, go to Stripe payment step
    if (preview?.duringStay && preview?.netAmountDue > 0) {
      setError('');
      try {
        const payData = await bookingApi.modifyDuringStayPay(params.token, newDeparture);
        setStripeClientSecret(payData.clientSecret);
        setStripeAmount(payData.amount);
        setStripeExtraDays(payData.extraDays);
        setStripeDailyRate(payData.duringStayDailyRate);
        setStep('dates-pay');
      } catch (e: any) { setError(e.message); }
      return;
    }

    setStep('dates-confirming');
    try {
      const result = await bookingApi.confirmModification(params.token, newArrival, newDeparture);
      setDoneData(result); setStep('dates-done');
    } catch (e: any) { setError(e.message); setStep('dates-preview'); }
  }

  async function handlePreStayStripePay(overbooked = false) {
    setError('');
    try {
      const data = await bookingApi.modifyDatesStripePay(params.token, newArrival, newDeparture, overbooked);
      setStripePreStayClientSecret(data.clientSecret);
      setStripePreStayAmount(data.amount);
      setStep('dates-pay-preStay');
    } catch (e: any) { setError(e.message); }
  }

  async function handlePreStayOnSite(overbooked = false) {
    setError('');
    try {
      const data = await bookingApi.modifyDatesOnSite(params.token, newArrival, newDeparture, overbooked);
      setOnSiteAmount(data.amount);
      setStep('dates-on-site-confirm');
    } catch (e: any) { setError(e.message); }
  }

  // ── Plate handler ─────────────────────────────────────────────
  async function submitPlate() {
    const changed = plateValues.filter(v => v.newPlate.trim() && v.newPlate.trim().toUpperCase() !== v.oldPlate.toUpperCase());
    if (changed.length === 0) { setError('U heeft geen kentekens gewijzigd.'); return; }
    setError(''); setPlateLoading(true);
    try {
      await bookingApi.modifyPlate(params.token, changed.map(v => ({ ...v, newPlate: v.newPlate.trim().toUpperCase() })));
      setStep('plate-done');
    } catch (e: any) { setError(e.message); }
    finally { setPlateLoading(false); }
  }

  // ── Contact handlers ──────────────────────────────────────────
  async function submitPhone() {
    if (!contactPhone.trim()) { setError('Vul uw telefoonnummer in.'); return; }
    setError(''); setContactLoading(true);
    try {
      await bookingApi.modifyPhone(params.token, contactPhone.trim());
      setStep('phone-done');
    } catch (e: any) { setError(e.message); }
    finally { setContactLoading(false); }
  }

  async function submitEmailChange() {
    if (!contactEmail.trim()) { setError('Vul uw nieuwe e-mailadres in.'); return; }
    setError(''); setContactLoading(true);
    try {
      await bookingApi.requestEmailChange(params.token, contactEmail.trim());
      setStep('email-verify-sent');
    } catch (e: any) { setError(e.message); }
    finally { setContactLoading(false); }
  }

  async function submitContact() {
    if (!contactEmail && !contactPhone) { setError('Vul ten minste één veld in.'); return; }
    setError(''); setContactLoading(true);
    try {
      await bookingApi.modifyContact(params.token, contactEmail, contactPhone);
      setStep('pending');
    } catch (e: any) { setError(e.message); }
    finally { setContactLoading(false); }
  }

  // ── Ferry handler ─────────────────────────────────────────────
  async function submitFerry() {
    if (!ferryOutboundTime && !ferryReturnTime) { setError('Vul ten minste één gewenste tijd in.'); return; }
    setError(''); setFerryLoading(true);
    try {
      const result = await bookingApi.modifyFerry(
        params.token, ferryOutboundTime, ferryReturnTime, ferryNotes,
        ferryOutboundTime ? ferryOutboundDest : undefined,
        ferryReturnTime ? ferryReturnDest : undefined,
      );
      setStep(result.autoApplied ? 'ferry-done' : 'pending');
    } catch (e: any) { setError(e.message); }
    finally { setFerryLoading(false); }
  }

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

  // ── All reservations handler ──────────────────────────────────
  async function loadAllReservations() {
    setAllResLoading(true);
    try {
      const data = await bookingApi.getAllForEmail(params.token);
      setAllReservations(data.reservations || []);
      setStep('all-reservations');
    } catch (e: any) { setError(e.message); }
    finally { setAllResLoading(false); }
  }

  // ── Ferry sync handler ────────────────────────────────────────
  async function syncFerryDates() {
    if (!res) return;
    const outboundDate = res.arrival_date?.slice(0, 10) || '';
    const returnDate = res.departure_date?.slice(0, 10) || '';
    const datesRaw = [outboundDate, returnDate].filter(Boolean);
    const dates = datesRaw.filter((d, i) => datesRaw.indexOf(d) === i);
    setFerrySyncing(true);
    try {
      await bookingApi.syncDoeksenDates(dates);
    } catch {
      // ignore sync errors — ferry list will still re-fetch
    } finally {
      setFerrySyncing(false);
    }
  }

  // ── Styles ────────────────────────────────────────────────────
  const S = {
    page: { minHeight: '100vh', background: '#f4f6f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 } as const,
    card: { background: 'white', borderRadius: 14, padding: '32px 28px', maxWidth: 520, width: '100%', border: '0.5px solid rgba(10,34,64,0.1)', boxShadow: '0 4px 24px rgba(10,34,64,0.08)' } as const,
    label: { fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'block', marginBottom: 6 },
    input: { width: '100%', padding: '10px 12px', border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, fontSize: 14, color: '#142440', boxSizing: 'border-box' as const },
    inputDisabled: { width: '100%', padding: '10px 12px', border: '0.5px solid rgba(10,34,64,0.1)', borderRadius: 8, fontSize: 14, color: '#7090b0', boxSizing: 'border-box' as const, background: '#f4f6f9', cursor: 'not-allowed' as const },
    btnPrimary: { width: '100%', padding: '13px', borderRadius: 9, background: '#19499e', color: 'white', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer' } as const,
    btnGhost: { width: '100%', padding: '11px', borderRadius: 9, background: 'white', color: '#142440', border: '0.5px solid rgba(10,34,64,0.2)', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 10 } as const,
  };

  const Logo = () => (
    <div style={{ textAlign: 'center', marginBottom: 24 }}>
      <div style={{ width: 44, height: 44, background: '#19499e', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#ffffff', margin: '0 auto 12px' }}>AB</div>
      <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: '#142440' }}>Reservering wijzigen</h2>
      <p style={{ margin: 0, color: '#7090b0', fontSize: 13 }}>Autostalling De Bazuin</p>
    </div>
  );

  const ErrorBox = ({ msg }: { msg: string }) => (
    <div style={{ background: '#fdeaea', borderRadius: 8, padding: '10px 14px', color: '#8a2020', fontSize: 13, marginBottom: 14 }}>{msg}</div>
  );

  const BackBtn = ({ label = 'Terug', onClick }: { label?: string; onClick: () => void }) => (
    <button onClick={onClick} style={S.btnGhost}><ArrowLeftIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />{label}</button>
  );

  // ── Reservation info block ────────────────────────────────────
  const ReservationInfo = () => (
    <div style={{ background: '#f4f6f9', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
      <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 16, color: '#142440', marginBottom: 8 }}>{res?.reference}</div>
      {[
        ['Naam', `${res?.first_name} ${res?.last_name}`],
        ['Aankomst', res?.arrival_date ? fmtDate(res.arrival_date.slice(0, 10)) : '—'],
        ['Vertrek', res?.departure_date ? fmtDate(res.departure_date.slice(0, 10)) : '—'],
      ].map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, borderBottom: '0.5px solid rgba(10,34,64,0.07)' }}>
          <span style={{ color: '#7090b0' }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span>
        </div>
      ))}
    </div>
  );

  // ── Loading ───────────────────────────────────────────────────
  if (step === 'loading') return (
    <div style={S.page}><div style={S.card}><p style={{ color: '#7090b0', textAlign: 'center' }}>Laden...</p></div></div>
  );

  // ── Error ─────────────────────────────────────────────────────
  if (step === 'error') return (
    <div style={S.page}><div style={S.card}>
      <Logo />
      <div style={{ background: '#fdeaea', borderRadius: 8, padding: '12px 14px', color: '#8a2020', fontSize: 13, textAlign: 'center' }}>{error}</div>
    </div></div>
  );

  // ── Pending (contact / ferry / checkedin departure) ───────────
  if (step === 'pending') return (
    <div style={S.page}><div style={{ ...S.card, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fff8e6', color: '#e8a020', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <ArrowPathIcon className="w-7 h-7" />
      </div>
      <h2 style={{ margin: '0 0 8px', color: '#142440' }}>Verzoek ontvangen!</h2>
      <p style={{ color: '#7090b0', fontSize: 14, marginBottom: 20 }}>
        Uw wijzigingsverzoek is ontvangen. Wij verwerken dit zo spoedig mogelijk en sturen u een bevestiging.
      </p>
      <button onClick={() => { window.location.href = window.location.pathname; }} style={S.btnPrimary}>Terug naar wijzigingen</button>
      <button onClick={() => window.close()} style={S.btnGhost}>Sluiten</button>
    </div></div>
  );

  // ── Ferry done (auto-applied) ─────────────────────────────────
  if (step === 'ferry-done') return (
    <div style={S.page}><div style={{ ...S.card, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#eaf1fb', color: '#19499e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <CheckIcon className="w-7 h-7" />
      </div>
      <h2 style={{ margin: '0 0 8px', color: '#142440' }}>Boottijden bijgewerkt!</h2>
      <p style={{ color: '#7090b0', fontSize: 14, marginBottom: 20 }}>
        Uw gewenste boottijden zijn direct verwerkt in uw reservering. U ontvangt een bevestiging per e-mail.
      </p>
      <button onClick={() => { window.location.href = window.location.pathname; }} style={S.btnPrimary}>Terug naar wijzigingen</button>
      <button onClick={() => window.close()} style={S.btnGhost}>Sluiten</button>
    </div></div>
  );

  // ── Plate done ────────────────────────────────────────────────
  if (step === 'plate-done') return (
    <div style={S.page}><div style={{ ...S.card, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#eaf1fb', color: '#19499e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <CheckIcon className="w-7 h-7" />
      </div>
      <h2 style={{ margin: '0 0 8px', color: '#142440' }}>Kenteken bijgewerkt!</h2>
      <p style={{ color: '#7090b0', fontSize: 14, marginBottom: 20 }}>
        Uw kentekenwijziging is direct verwerkt. U ontvangt een bevestiging per e-mail.
      </p>
      <button onClick={() => { window.location.href = window.location.pathname; }} style={S.btnPrimary}>Terug naar wijzigingen</button>
      <button onClick={() => window.close()} style={S.btnGhost}>Sluiten</button>
    </div></div>
  );

  // ── Phone done ────────────────────────────────────────────────
  if (step === 'phone-done') return (
    <div style={S.page}><div style={{ ...S.card, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#eaf1fb', color: '#19499e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <CheckIcon className="w-7 h-7" />
      </div>
      <h2 style={{ margin: '0 0 8px', color: '#142440' }}>Telefoonnummer bijgewerkt!</h2>
      <p style={{ color: '#7090b0', fontSize: 14, marginBottom: 20 }}>
        Uw telefoonnummer is direct opgeslagen.
      </p>
      <button onClick={() => setStep('menu')} style={S.btnGhost}><ArrowLeftIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Terug naar menu</button>
    </div></div>
  );

  // ── Email verify sent ─────────────────────────────────────────
  if (step === 'email-verify-sent') return (
    <div style={S.page}><div style={{ ...S.card, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#e6f1fb', color: '#1a6bb5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <EnvelopeIcon className="w-7 h-7" />
      </div>
      <h2 style={{ margin: '0 0 8px', color: '#142440' }}>Verificatiemail verstuurd!</h2>
      <p style={{ color: '#7090b0', fontSize: 14, marginBottom: 20 }}>
        We hebben een verificatiemail gestuurd naar <strong>{contactEmail}</strong>.<br />
        Klik op de link in de e-mail om uw nieuwe e-mailadres te bevestigen.
      </p>
      <button onClick={() => setStep('menu')} style={S.btnGhost}><ArrowLeftIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Terug naar menu</button>
    </div></div>
  );

  // ── Dates done ────────────────────────────────────────────────
  if (step === 'dates-done') return (
    <div style={S.page}><div style={{ ...S.card, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: doneData?.pending ? '#fff8e6' : '#eaf1fb', color: doneData?.pending ? '#e8a020' : '#19499e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        {doneData?.pending ? <ArrowPathIcon className="w-7 h-7" /> : <CheckIcon className="w-7 h-7" />}
      </div>
      <h2 style={{ margin: '0 0 8px', color: '#142440' }}>
        {doneData?.duringStayPaid ? 'Verblijf verlengd! Betaling ontvangen.' : doneData?.pending ? 'Verzoek ontvangen!' : 'Wijziging bevestigd!'}
      </h2>
      <p style={{ color: '#7090b0', fontSize: 14, marginBottom: 20 }}>
        {doneData?.pending
          ? 'Uw wijzigingsverzoek is ontvangen. Wij verwerken dit zo spoedig mogelijk en sturen u een bevestiging.'
          : 'U ontvangt een bevestiging per e-mail.'}
      </p>
      {!doneData?.pending && !doneData?.duringStayPaid && (
        <div style={{ background: '#f4f6f9', borderRadius: 10, padding: '16px', fontSize: 13, textAlign: 'left', marginBottom: 20 }}>
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: '#7090b0' }}>Nieuwe aankomst: </span>
            <strong>{fmtDate(newArrival)}</strong>
          </div>
          <div>
            <span style={{ color: '#7090b0' }}>Nieuw vertrek: </span>
            <strong>{fmtDate(newDeparture)}</strong>
          </div>
        </div>
      )}
      {!doneData?.pending && doneData?.netRefundAmount > 0 && (
        <div style={{ background: '#eaf1fb', border: '0.5px solid #19499e', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#19499e', marginBottom: 16 }}>
          U ontvangt <strong>€ {doneData.netRefundAmount.toFixed(2)}</strong> restitutie binnen 5–10 werkdagen.
        </div>
      )}
      <button onClick={() => { window.location.href = window.location.pathname; }} style={S.btnPrimary}>Terug naar wijzigingen</button>
      <button onClick={() => window.close()} style={S.btnGhost}>Sluiten</button>
    </div></div>
  );

  // ── Dates on-site confirm ─────────────────────────────────────
  if (step === 'dates-on-site-confirm') return (
    <div style={S.page}><div style={{ ...S.card, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#eaf1fb', color: '#19499e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <CheckIcon className="w-7 h-7" />
      </div>
      <h2 style={{ margin: '0 0 8px', color: '#142440' }}>Wijziging bevestigd!</h2>
      <p style={{ color: '#7090b0', fontSize: 14, marginBottom: 16 }}>
        Uw reservering is direct bijgewerkt naar de nieuwe data.
      </p>
      <div style={{ background: '#fff8e6', border: '1px solid #e8a020', borderRadius: 10, padding: '14px 18px', fontSize: 13, color: '#7a5010', marginBottom: 20, textAlign: 'left' }}>
        <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><HomeIcon className="w-4 h-4" />Betalen bij aankomst</div>
        <div>Betaal <strong>€ {onSiteAmount.toFixed(2).replace('.', ',')}</strong> (incl. €5,- toeslag) ter plekke aan de medewerker bij aankomst.</div>
      </div>
    </div></div>
  );

  // ── Dates pay (Stripe — during stay) ─────────────────────────
  if (step === 'dates-pay') return (
    <div style={S.page}><div style={S.card}>
      <Logo />
      <div style={{ background: '#fff8e6', border: '1.5px solid #e8a020', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#7a5010', textTransform: 'uppercase', marginBottom: 6 }}>Verlenging tijdens verblijf</div>
        <div style={{ fontSize: 14, color: '#142440' }}>
          <strong>{stripeExtraDays} extra dag{stripeExtraDays !== 1 ? 'en' : ''}</strong>
          {' '}× € {stripeDailyRate.toFixed(2).replace('.', ',')} = <strong>€ {stripeAmount.toFixed(2).replace('.', ',')}</strong>
        </div>
        <div style={{ fontSize: 12, color: '#7a5010', marginTop: 6 }}>
          Nieuwe vertrekdatum: <strong>{fmtDate(newDeparture)}</strong>
        </div>
      </div>

      {error && <ErrorBox msg={error} />}

      {stripeClientSecret && (
        <Elements
          stripe={stripePromise}
          options={{ clientSecret: stripeClientSecret, appearance: { theme: 'stripe' } }}
        >
          <DuringStayPaymentForm
            token={params.token}
            newDeparture={newDeparture}
            amount={stripeAmount}
            extraDays={stripeExtraDays}
            dailyRate={stripeDailyRate}
            onSuccess={() => { setDoneData({ duringStayPaid: true }); setStep('dates-done'); }}
            onError={msg => setError(msg)}
          />
        </Elements>
      )}

      <button onClick={() => { setStep('dates-preview'); setError(''); }} style={S.btnGhost}><ArrowLeftIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Terug</button>
    </div></div>
  );

  // ── Dates pay pre-stay (Stripe) ───────────────────────────────
  if (step === 'dates-pay-preStay') return (
    <div style={S.page}><div style={S.card}>
      <Logo />
      <div style={{ background: '#f4f6f9', border: '1.5px solid rgba(10,34,64,0.15)', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', marginBottom: 6 }}>Bijbetaling datumwijziging</div>
        <div style={{ fontSize: 14, color: '#142440' }}>
          Totaal te betalen: <strong>€ {stripePreStayAmount.toFixed(2).replace('.', ',')}</strong>
        </div>
        <div style={{ fontSize: 12, color: '#7090b0', marginTop: 6 }}>
          Nieuwe periode: <strong>{fmtDate(newArrival)}</strong> – <strong>{fmtDate(newDeparture)}</strong>
        </div>
      </div>

      {error && <ErrorBox msg={error} />}

      {stripePreStayClientSecret && (
        <Elements
          stripe={stripePromise}
          options={{ clientSecret: stripePreStayClientSecret, appearance: { theme: 'stripe' } }}
        >
          <PreStayPaymentForm
            token={params.token}
            newArrival={newArrival}
            newDeparture={newDeparture}
            amount={stripePreStayAmount}
            onSuccess={() => { setDoneData({ preStayPaid: true }); setStep('dates-done'); }}
            onError={msg => setError(msg)}
          />
        </Elements>
      )}

      <button onClick={() => { setStep('dates-preview'); setError(''); }} style={S.btnGhost}><ArrowLeftIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Terug</button>
    </div></div>
  );

  // ── Dates preview / confirming ────────────────────────────────
  if (step === 'dates-preview' || step === 'dates-confirming') return (
    <div style={S.page}><div style={S.card}>
      <Logo />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <div style={{ background: '#f4f6f9', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Huidige boeking</div>
          <div style={{ fontSize: 12, color: '#142440', marginBottom: 4 }}><strong>Aankomst:</strong><br />{fmtDate(preview.currentArrival.slice(0, 10))}</div>
          <div style={{ fontSize: 12, color: '#142440', marginBottom: 8 }}><strong>Vertrek:</strong><br />{fmtDate(preview.currentDeparture.slice(0, 10))}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#142440' }}>€ {parseFloat(preview.currentPrice).toFixed(2)}</div>
        </div>
        <div style={{ background: '#eaf1fb', border: '1.5px solid #19499e', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#19499e', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Nieuwe boeking</div>
          <div style={{ fontSize: 12, color: '#142440', marginBottom: 4 }}><strong>Aankomst:</strong><br />{fmtDate(newArrival)}</div>
          <div style={{ fontSize: 12, color: '#142440', marginBottom: 8 }}><strong>Vertrek:</strong><br />{fmtDate(newDeparture)}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#19499e' }}>€ {parseFloat(preview.newPrice).toFixed(2)}</div>
        </div>
      </div>

      {/* Opbouw nieuw bedrag — parkeren los van extra's, zodat het herleidbaar is naar de tarieftabel */}
      {(preview.servicesTotal ?? 0) > 0 && preview.newParkingPrice != null && (
        <div style={{ background: '#f8f9fb', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Opbouw nieuw bedrag</div>
          {[
            [`Parkeren${preview.newPriceBreakdown ? ` (${preview.newPriceBreakdown})` : ''}`, `€ ${parseFloat(preview.newParkingPrice).toFixed(2)}`],
            ["Extra's (o.a. laden)", `€ ${parseFloat(preview.servicesTotal).toFixed(2)}`],
            ...(preview.surchargesTotal > 0 ? [['Toeslagen', `€ ${parseFloat(preview.surchargesTotal).toFixed(2)}`]] : []),
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12.5 }}>
              <span style={{ color: '#7090b0' }}>{k}</span>
              <span style={{ fontWeight: 600, color: '#142440' }}>{v}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, marginTop: 4, borderTop: '0.5px solid rgba(10,34,64,0.1)', fontSize: 13, fontWeight: 800 }}>
            <span style={{ color: '#142440' }}>Totaal nieuw bedrag</span>
            <span style={{ color: '#142440' }}>€ {parseFloat(preview.newPrice).toFixed(2)}</span>
          </div>
        </div>
      )}

      <div style={{ background: '#f8f9fb', borderRadius: 10, padding: '16px', marginBottom: 20 }}>
        {[
          // Bij onbetaalde boeking: toon "Nog te betalen" i.p.v. "Huidig bedrag"
          [preview.originalUnpaid ? 'Nog te betalen (oorspronkelijk)' : 'Huidig bedrag', `€ ${parseFloat(preview.currentPrice).toFixed(2)}`],
          ['Nieuw bedrag', `€ ${parseFloat(preview.newPrice).toFixed(2)}`],
          ...(preview.modificationFee > 0 ? [['Wijzigingstoeslag', `€ ${preview.modificationFee.toFixed(2)}`]] : []),
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, borderBottom: '0.5px solid rgba(10,34,64,0.06)' }}>
            <span style={{ color: '#7090b0' }}>{k}</span>
            <span style={{ fontWeight: 600 }}>{v}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, marginTop: 4, fontSize: 14, fontWeight: 800 }}>
          {preview.originalUnpaid && preview.fullAmountDue > 0 ? (
            <>
              <span style={{ color: '#8a2020' }}>Volledig te betalen</span>
              <span style={{ color: '#8a2020' }}>€ {preview.fullAmountDue.toFixed(2)}</span>
            </>
          ) : preview.netAmountDue > 0 ? (
            <>
              <span style={{ color: '#8a2020' }}>Bij te betalen</span>
              <span style={{ color: '#8a2020' }}>€ {preview.netAmountDue.toFixed(2)}</span>
            </>
          ) : preview.netRefundAmount > 0 ? (
            <>
              <span style={{ color: '#19499e' }}>Restitutie</span>
              <span style={{ color: '#19499e' }}>€ {preview.netRefundAmount.toFixed(2)}</span>
            </>
          ) : (
            <>
              <span style={{ color: '#7090b0' }}>Geen bijbetaling of restitutie</span>
              <span>—</span>
            </>
          )}
        </div>

        {preview.policyAnchorDate && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '0.5px solid rgba(10,34,64,0.08)', fontSize: 11, color: '#7090b0' }}>
            <ExclamationTriangleIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Annuleringsbeleid gebaseerd op originele aankomstdatum:{' '}
            <strong style={{ color: '#556070' }}>
              {new Date(preview.policyAnchorDate + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
            </strong>
          </div>
        )}
      </div>

      {preview.duringStay && preview.netAmountDue > 0 && (
        <div style={{ background: '#fff8e6', border: '1.5px solid #e8a020', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#7a5010', marginBottom: 12 }}>
          Verlenging van <strong>{preview.extraDays} dag{preview.extraDays !== 1 ? 'en' : ''}</strong> × € {preview.duringStayDailyRate?.toFixed(2)} = <strong>€ {preview.netAmountDue.toFixed(2)}</strong> — betaling via Stripe.
        </div>
      )}

      {preview.duringStay && preview.netAmountDue === 0 && (
        <div style={{ background: '#fff8e6', border: '1.5px solid #e8a020', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#7a5010', marginBottom: 12 }}>
          <strong>Wijziging tijdens verblijf</strong> — uw verzoek wordt ter beoordeling aangeboden aan Autostalling De Bazuin.
        </div>
      )}

      {checkedInEarlier && (
        <div style={{ background: '#fff8e6', border: '1.5px solid #e8a020', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#7a5010', marginBottom: 12 }}>
          <strong>Geen restitutie</strong> — uw afhaal datum wordt vervroegd. De wijziging wordt ter beoordeling aangeboden.
        </div>
      )}

      {!preview.duringStay && !checkedInEarlier && preview.priceDifference < 0 && preview.cancellationRefundPct < 100 && (
        <div style={{ background: '#f4f6f9', border: '0.5px solid rgba(10,34,64,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#556070', marginBottom: 12 }}>
          Op basis van het annuleringsbeleid ontvangt u <strong>{preview.cancellationRefundPct}%</strong> restitutie over het verschil ({preview.policyDescription}).
        </div>
      )}

      {/* Pre-stay extra payment: two buttons */}
      {!preview.duringStay && !checkedInEarlier && (preview.netAmountDue > 0 || preview.originalUnpaid) && (
        <div style={{ marginBottom: 16 }}>
          {/* Melding onbetaalde boeking */}
          {preview.originalUnpaid && (
            <div style={{ background: '#fff3e0', border: '1.5px solid #e8a020', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#7a5010', marginBottom: 12 }}>
              <strong>Let op:</strong> uw oorspronkelijke boeking was nog niet betaald. U betaalt nu het volledige nieuwe bedrag.
            </div>
          )}

          {/* No availability: show overbooking option */}
          {preview.overbookingOption && !useOverbooked && (
            <div style={{ background: '#fff8e6', border: '1.5px solid #e8a020', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#7a5010', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ExclamationTriangleIcon className="w-4 h-4" />Geen plaatsen beschikbaar
              </div>
              <div style={{ fontSize: 12, color: '#7a5010', marginBottom: 10 }}>
                Er zijn momenteel geen vrije plaatsen voor de gekozen periode. U kunt toch wijzigen met een overboekingstoeslag van{' '}
                <strong>€ {preview.overbookingFeePerNight?.toFixed(2).replace('.', ',')} / nacht</strong>{' '}
                (totaal € {preview.overbookingTotal?.toFixed(2).replace('.', ',')}).
              </div>
              <button
                onClick={() => setUseOverbooked(true)}
                style={{ ...S.btnPrimary, background: '#e8a020', fontSize: 13, padding: '10px' }}
              >
                Toch wijzigen met overboeking (+€ {preview.overbookingTotal?.toFixed(2).replace('.', ',')})
              </button>
            </div>
          )}

          {/* Available OR overbooked accepted: show payment buttons */}
          {(preview.available || useOverbooked) && (
            <>
              {useOverbooked && (
                <div style={{ background: '#fff8e6', border: '0.5px solid #e8a020', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#7a5010', marginBottom: 10 }}>
                  Incl. overboekingstoeslag: <strong>€ {preview.overbookingTotal?.toFixed(2).replace('.', ',')}</strong>
                </div>
              )}
              {/* Bedrag: vol bedrag voor onbetaalde boekingen, verschil voor al-betaalde */}
              {(() => {
                const stripeAmt = useOverbooked
                  ? preview.fullAmountDueOverbooked ?? preview.overbookingNetDue
                  : preview.originalUnpaid ? preview.fullAmountDue : preview.netAmountDue;
                return (
                  <button
                    onClick={() => handlePreStayStripePay(useOverbooked)}
                    disabled={step === 'dates-confirming'}
                    style={{ ...S.btnPrimary, marginBottom: 10, opacity: step === 'dates-confirming' ? 0.6 : 1 }}
                  >
                    <CreditCardIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />Nu betalen via Stripe: € {stripeAmt?.toFixed(2).replace('.', ',')} <ArrowRightIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle' }} />
                  </button>
                );
              })()}
              <button
                onClick={() => handlePreStayOnSite(useOverbooked)}
                disabled={step === 'dates-confirming'}
                style={{ ...S.btnGhost, marginTop: 0, opacity: step === 'dates-confirming' ? 0.6 : 1 }}
              >
                <HomeIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                {preview.originalUnpaid
                  ? `Betalen ter plekke — € ${((preview.fullAmountDue ?? preview.newPrice) + 5).toFixed(2).replace('.', ',')} (+€5,00 toeslag)`
                  : 'Betalen ter plekke (+€5,00)'}
              </button>
            </>
          )}
        </div>
      )}

      {/* No-extra-payment scenario with no availability: show overbooking or block */}
      {!preview.duringStay && !checkedInEarlier && preview.netAmountDue <= 0 && preview.overbookingOption && !useOverbooked && (
        <div style={{ background: '#fff8e6', border: '1.5px solid #e8a020', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#7a5010', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ExclamationTriangleIcon className="w-4 h-4" />Geen plaatsen beschikbaar
          </div>
          <div style={{ fontSize: 12, color: '#7a5010', marginBottom: 10 }}>
            Er zijn momenteel geen vrije plaatsen voor de gekozen periode. U kunt toch wijzigen met een overboekingstoeslag van{' '}
            <strong>€ {preview.overbookingFeePerNight?.toFixed(2).replace('.', ',')} / nacht</strong>{' '}
            (totaal € {preview.overbookingTotal?.toFixed(2).replace('.', ',')}).
          </div>
          <button
            onClick={() => setUseOverbooked(true)}
            style={{ ...S.btnPrimary, background: '#e8a020', fontSize: 13, padding: '10px' }}
          >
            Toch wijzigen met overboeking (+€ {preview.overbookingTotal?.toFixed(2).replace('.', ',')})
          </button>
        </div>
      )}

      {/* Overboeking geaccepteerd maar netAmountDue <= 0: toon betaalbuttons voor enkel overbookingTotal */}
      {!preview.duringStay && !checkedInEarlier && preview.netAmountDue <= 0 && preview.overbookingOption && useOverbooked && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ background: '#fff8e6', border: '0.5px solid #e8a020', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#7a5010', marginBottom: 10 }}>
            Overboekingstoeslag: <strong>€ {preview.overbookingTotal?.toFixed(2).replace('.', ',')}</strong>
          </div>
          <button
            onClick={() => handlePreStayStripePay(true)}
            disabled={step === 'dates-confirming'}
            style={{ ...S.btnPrimary, marginBottom: 10, opacity: step === 'dates-confirming' ? 0.6 : 1 }}
          >
            <CreditCardIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />Nu betalen via Stripe: € {preview.overbookingNetDue?.toFixed(2).replace('.', ',')} <ArrowRightIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle' }} />
          </button>
          <button
            onClick={() => handlePreStayOnSite(true)}
            disabled={step === 'dates-confirming'}
            style={{ ...S.btnGhost, marginTop: 0, opacity: step === 'dates-confirming' ? 0.6 : 1 }}
          >
            <HomeIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />Betalen ter plekke (+€5,00)
          </button>
        </div>
      )}

      {error && <ErrorBox msg={error} />}

      {/* Confirm button: only show when NOT pre-stay-extra-payment scenario, and not blocked by overbooking */}
      {!((!preview.duringStay && !checkedInEarlier && preview.netAmountDue > 0)) &&
       !(preview.overbookingOption && !preview.duringStay && !checkedInEarlier && !useOverbooked) && (
        <button
          onClick={confirmDates}
          disabled={step === 'dates-confirming'}
          style={{ ...S.btnPrimary, opacity: step === 'dates-confirming' ? 0.6 : 1 }}
        >
          {step === 'dates-confirming'
            ? 'Bezig...'
            : (preview.duringStay && preview.netAmountDue > 0)
              ? <span>Doorgaan naar betaling <ArrowRightIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle' }} /></span>
              : checkedInEarlier
                ? <span>Vervroegd vertrek aanvragen <ArrowRightIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle' }} /></span>
                : <span>Wijziging bevestigen <ArrowRightIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle' }} /></span>}
        </button>
      )}

      <button onClick={() => { setStep('dates-form'); setPreview(null); setError(''); setUseOverbooked(false); }} style={S.btnGhost}><ArrowLeftIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Terug aanpassen</button>
    </div></div>
  );

  // ── Dates form ────────────────────────────────────────────────
  if (step === 'dates-form') {
    const arrivalLocked = duringStay || isCheckedIn;
    return (
      <div style={S.page}><div style={S.card}>
        <Logo />
        <ReservationInfo />

        {duringStay && (
          <div style={{ background: '#fff8e6', border: '1.5px solid #e8a020', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#7a5010', marginBottom: 16 }}>
            U verblijft momenteel bij Autostalling De Bazuin. U kunt alleen de vertrekdatum verlengen.
          </div>
        )}

        {isCheckedIn && !duringStay && (
          <div style={{ background: '#e6f1fb', border: '1.5px solid #1a6bb5', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#142440', marginBottom: 16 }}>
            Uw voertuig is ingecheckt. U kunt alleen de vertrekdatum <strong>vervroegen</strong>. Voor verlenging, neem contact op.
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={S.label}>
            {arrivalLocked ? <><LockClosedIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /></> : ''}Aankomstdatum
          </label>
          <input
            type="date"
            min={todayStr}
            value={newArrival}
            onChange={e => !arrivalLocked && setNewArrival(e.target.value)}
            disabled={arrivalLocked}
            style={arrivalLocked ? S.inputDisabled : S.input}
          />
          {arrivalLocked && (
            <div style={{ fontSize: 11, color: '#7090b0', marginTop: 4 }}>Aankomstdatum kan niet worden gewijzigd.</div>
          )}
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={S.label}>Vertrekdatum</label>
          <input
            type="date"
            min={duringStay ? res.departure_date?.slice(0, 10) : (isCheckedIn ? undefined : (newArrival || todayStr))}
            max={isCheckedIn && !duringStay ? res.departure_date?.slice(0, 10) : undefined}
            value={newDeparture}
            onChange={e => { setNewDeparture(e.target.value); setCheckinEarlierError(''); }}
            style={S.input}
          />
          {isCheckedIn && !duringStay && (
            <div style={{ fontSize: 11, color: '#7090b0', marginTop: 4 }}>Alleen een eerdere datum dan de huidige vertrekdatum is toegestaan.</div>
          )}
          {checkinEarlierError && (
            <div style={{ fontSize: 12, color: '#8a2020', marginTop: 6, background: '#fdeaea', borderRadius: 6, padding: '6px 10px' }}>{checkinEarlierError}</div>
          )}
        </div>

        {error && <ErrorBox msg={error} />}

        <button onClick={calcPreview} disabled={previewLoading || !newArrival || !newDeparture} style={S.btnPrimary}>
          {previewLoading ? 'Berekenen...' : <span>Prijsverschil berekenen <ArrowRightIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle' }} /></span>}
        </button>
        {!duringStay && !isCheckedIn && (
          <p style={{ textAlign: 'center', fontSize: 12, color: '#7090b0', marginTop: 14 }}>
            Let op: bij annulering blijft het annuleringsbeleid van uw originele aankomstdatum van toepassing.
          </p>
        )}
        <BackBtn onClick={() => { setError(''); setCheckinEarlierError(''); setStep('menu'); }} />
      </div></div>
    );
  }

  // ── Plate form ────────────────────────────────────────────────
  if (step === 'plate') return (
    <div style={S.page}><div style={S.card}>
      <Logo />
      <ReservationInfo />

      <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#142440' }}>Kenteken wijzigen</h3>

      {plateValues.length === 0 && (
        <p style={{ color: '#7090b0', fontSize: 13 }}>Geen voertuigen gevonden bij deze reservering.</p>
      )}

      {plateValues.map((v, i) => (
        <div key={v.vehicleId} style={{ marginBottom: 16 }}>
          <label style={S.label}>Voertuig {i + 1} — huidig kenteken: <span style={{ color: '#142440' }}>{v.oldPlate}</span></label>
          <input
            type="text"
            value={v.newPlate}
            onChange={e => setPlateValues(prev => prev.map((p, j) => j === i ? { ...p, newPlate: e.target.value } : p))}
            placeholder={v.oldPlate}
            style={{ ...S.input, textTransform: 'uppercase' }}
          />
        </div>
      ))}

      {error && <ErrorBox msg={error} />}

      <button onClick={submitPlate} disabled={plateLoading || plateValues.length === 0} style={{ ...S.btnPrimary, opacity: plateLoading ? 0.7 : 1 }}>
        {plateLoading ? 'Bezig...' : <span>Wijziging opslaan <ArrowRightIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle' }} /></span>}
      </button>
      <BackBtn onClick={() => { setError(''); setStep('menu'); }} />
    </div></div>
  );

  // ── All reservations ─────────────────────────────────────────
  if (step === 'all-reservations') return (
    <div style={S.page}><div style={S.card}>
      <Logo />
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#142440' }}>Mijn reserveringen</h3>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: '#7090b0' }}>Alle reserveringen gekoppeld aan uw e-mailadres</p>

      {allReservations.length === 0 && (
        <p style={{ color: '#7090b0', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>Geen reserveringen gevonden.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {allReservations.map(r => {
          const isCurrentRes = r.cancellation_token === params.token;
          const statusColor: Record<string, string> = {
            booked: '#1a6bb5', checked_in: '#19499e', completed: '#7090b0', cancelled: '#c83232',
          };
          const statusLabel: Record<string, string> = {
            booked: 'Geboekt', checked_in: 'Ingecheckt', completed: 'Afgerond', cancelled: 'Geannuleerd',
          };
          return (
            <div key={r.id}
              style={{
                padding: '12px 14px', borderRadius: 10,
                border: isCurrentRes ? '1.5px solid #19499e' : '0.5px solid rgba(10,34,64,0.15)',
                background: isCurrentRes ? '#eaf1fb' : 'white',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: '#142440' }}>{r.reference}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: statusColor[r.status] || '#7090b0', background: '#f4f6f9', padding: '2px 8px', borderRadius: 20 }}>
                  {statusLabel[r.status] || r.status}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#556070', marginBottom: 6 }}>
                {fmtDate(r.arrival_date?.slice(0, 10))} → {fmtDate(r.departure_date?.slice(0, 10))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#7090b0' }}>€ {parseFloat(r.total_price).toFixed(2)}</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {r.cancellation_token && (
                    <a
                      href={`${API_BASE}/invoice-html/${r.cancellation_token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 11, color: '#556070', textDecoration: 'none', border: '0.5px solid #c0c8d4', borderRadius: 6, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <DocumentTextIcon className="w-3 h-3" />Factuur
                    </a>
                  )}
                  {isCurrentRes ? (
                    <span style={{ fontSize: 11, color: '#19499e', fontWeight: 700 }}>← huidig</span>
                  ) : (
                    r.cancellation_token && !['cancelled', 'completed'].includes(r.status) && (
                      <a href={`/boeken/wijzigen/${r.cancellation_token}`}
                        style={{ fontSize: 12, color: '#19499e', fontWeight: 700, textDecoration: 'none' }}>
                        Wijzigen <ArrowRightIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle' }} />
                      </a>
                    )
                  )}
                  {r.cancellation_token && r.status === 'cancelled' && parseFloat(r.refund_amount || 0) > 0 && (
                    <a
                      href={`${API_BASE}/creditnota-html/${r.cancellation_token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 11, color: '#c83232', textDecoration: 'none', border: '0.5px solid #f0b0b0', borderRadius: 6, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <ClipboardDocumentListIcon className="w-3 h-3" />Creditnota
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <BackBtn onClick={() => { setError(''); setStep('menu'); }} />
    </div></div>
  );

  // ── Contact form ──────────────────────────────────────────────
  if (step === 'contact') return (
    <div style={S.page}><div style={S.card}>
      <Logo />
      <ReservationInfo />

      <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#142440' }}>Persoonsgegevens wijzigen</h3>

      {/* Phone — direct save */}
      <div style={{ background: '#f4f6f9', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
          Telefoonnummer
        </div>
        <input
          type="tel"
          value={contactPhone}
          onChange={e => setContactPhone(e.target.value)}
          placeholder="+31 6 12345678"
          style={{ ...S.input, marginBottom: 10 }}
        />
        <div style={{ fontSize: 11, color: '#7090b0', marginBottom: 10 }}>Wijziging wordt direct opgeslagen, geen goedkeuring nodig.</div>
        <button onClick={submitPhone} disabled={contactLoading} style={{ ...S.btnPrimary, padding: '10px', fontSize: 14, opacity: contactLoading ? 0.7 : 1 }}>
          {contactLoading ? 'Bezig...' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><CheckIcon className="w-4 h-4" />Telefoonnummer opslaan</span>}
        </button>
      </div>

      {/* Email — verification flow */}
      <div style={{ background: '#f4f6f9', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
          E-mailadres wijzigen
        </div>
        <input
          type="email"
          value={contactEmail}
          onChange={e => setContactEmail(e.target.value)}
          placeholder="nieuw@emailadres.nl"
          style={{ ...S.input, marginBottom: 10 }}
        />
        <div style={{ fontSize: 11, color: '#7090b0', marginBottom: 10 }}>
          U ontvangt een verificatiemail op het nieuwe adres om de wijziging te bevestigen.
        </div>
        <button onClick={submitEmailChange} disabled={contactLoading} style={{ ...S.btnPrimary, padding: '10px', fontSize: 14, background: '#1a6bb5', opacity: contactLoading ? 0.7 : 1 }}>
          {contactLoading ? 'Bezig...' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><EnvelopeIcon className="w-4 h-4" />Verificatiemail versturen <ArrowRightIcon className="w-4 h-4" /></span>}
        </button>
      </div>

      {error && <ErrorBox msg={error} />}

      <BackBtn onClick={() => { setError(''); setStep('menu'); }} />
    </div></div>
  );

  // ── Ferry form ────────────────────────────────────────────────
  if (step === 'ferry') {
    const outboundDate = res?.arrival_date?.slice(0, 10) || '';
    const returnDate = res?.departure_date?.slice(0, 10) || '';
    const hideOutbound = isCheckedIn;

    const IslandToggle = ({ value, onChange }: { value: 'terschelling' | 'vlieland'; onChange: (d: 'terschelling' | 'vlieland') => void }) => (
      <div style={{ display: 'flex', gap: 8 }}>
        {(['terschelling', 'vlieland'] as const).map(dest => (
          <button
            key={dest}
            type="button"
            onClick={() => onChange(dest)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 700,
              border: value === dest ? '1.5px solid #19499e' : '0.5px solid rgba(10,34,64,0.2)',
              background: value === dest ? '#eaf1fb' : 'white',
              color: value === dest ? '#19499e' : '#7090b0',
              cursor: 'pointer',
            }}
          >
            {dest === 'terschelling' ? 'Terschelling' : 'Vlieland'}
          </button>
        ))}
      </div>
    );

    return (
      <div style={S.page}><div style={S.card}>
        <Logo />
        <ReservationInfo />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#142440' }}>Boottijden wijzigen</h3>
          <button
            type="button"
            onClick={syncFerryDates}
            disabled={ferrySyncing}
            style={{
              fontSize: 12, fontWeight: 600, color: '#19499e',
              background: '#eaf1fb', border: '1px solid #19499e',
              borderRadius: 7, padding: '6px 12px', cursor: ferrySyncing ? 'not-allowed' : 'pointer',
              opacity: ferrySyncing ? 0.6 : 1,
            }}
          >
            {ferrySyncing ? 'Ophalen...' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowPathIcon className="w-4 h-4" />Boottijden ophalen</span>}
          </button>
        </div>

        {isCheckedIn && (
          <div style={{ background: '#e6f1fb', border: '1.5px solid #1a6bb5', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#142440', marginBottom: 16 }}>
            U bent ingecheckt. Alleen de <strong>terugreis</strong> kan worden gewijzigd.
          </div>
        )}

        {!hideOutbound && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
              Eiland heenreis
            </div>
            <div style={{ marginBottom: 12 }}>
              <IslandToggle value={ferryOutboundDest} onChange={d => { setFerryOutboundDest(d); setFerryOutboundTime(''); }} />
            </div>
            <FerryPicker
              label={`Heenreis → ${ferryOutboundDest === 'terschelling' ? 'Terschelling' : 'Vlieland'}`}
              date={outboundDate}
              destination={ferryOutboundDest}
              direction="outbound"
              currentTime={res?.ferry_outbound_time}
              selectedTime={ferryOutboundTime}
              onSelect={setFerryOutboundTime}
            />
          </>
        )}

        <div style={{ fontSize: 11, fontWeight: 700, color: '#7090b0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
          Eiland terugreis
        </div>
        <div style={{ marginBottom: 12 }}>
          <IslandToggle value={ferryReturnDest} onChange={d => { setFerryReturnDest(d); setFerryReturnTime(''); }} />
        </div>
        <FerryPicker
          label={`Terugreis ← ${ferryReturnDest === 'terschelling' ? 'Terschelling' : 'Vlieland'}`}
          date={returnDate}
          destination={ferryReturnDest}
          direction="return"
          currentTime={res?.ferry_return_time}
          selectedTime={ferryReturnTime}
          onSelect={setFerryReturnTime}
        />

        <div style={{ marginBottom: 20 }}>
          <label style={S.label}>Opmerkingen (optioneel)</label>
          <textarea
            value={ferryNotes}
            onChange={e => setFerryNotes(e.target.value)}
            rows={3}
            placeholder="Bijv. flexibel in tijdstip, voorkeur voor vroege overtocht..."
            style={{ ...S.input, resize: 'vertical' as const, height: 'auto' }}
          />
        </div>

        {error && <ErrorBox msg={error} />}

        <button onClick={submitFerry} disabled={ferryLoading} style={{ ...S.btnPrimary, opacity: ferryLoading ? 0.7 : 1 }}>
          {ferryLoading ? 'Bezig...' : <span>Wijzigingsverzoek indienen <ArrowRightIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle' }} /></span>}
        </button>
        <BackBtn onClick={() => { setError(''); setStep('menu'); }} />
      </div></div>
    );
  }

  // ── Afgesloten reservering ────────────────────────────────────
  const isPast = res && (
    res.departure_date?.slice(0, 10) < todayStr ||
    res.status === 'completed' ||
    res.status === 'cancelled'
  );

  if (step === 'menu' && isPast) {
    const isCancelled = res.status === 'cancelled';
    return (
      <div style={S.page}><div style={{ ...S.card, textAlign: 'center' }}>
        <Logo />
        <div style={{ background: '#f4f6f9', borderRadius: 10, padding: '14px 18px', marginBottom: 20, textAlign: 'left' }}>
          <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 15, color: '#142440', marginBottom: 4 }}>{res?.reference}</div>
          <div style={{ fontSize: 13, color: '#7090b0' }}>{res?.first_name} {res?.last_name}</div>
          <div style={{ fontSize: 12, color: '#7090b0', marginTop: 4 }}>
            {fmtDate(res.arrival_date?.slice(0, 10))} → {fmtDate(res.departure_date?.slice(0, 10))}
          </div>
        </div>

        <div style={{ width: 56, height: 56, borderRadius: '50%', background: isCancelled ? '#fdeaea' : '#f4f6f9', color: isCancelled ? '#c83232' : '#7090b0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <LockClosedIcon className="w-7 h-7" />
        </div>
        <h2 style={{ margin: '0 0 8px', color: '#142440', fontSize: 18 }}>
          {isCancelled ? 'Reservering geannuleerd' : 'Reservering afgelopen'}
        </h2>
        <p style={{ color: '#7090b0', fontSize: 14, marginBottom: 24 }}>
          {isCancelled
            ? 'Deze reservering is geannuleerd en kan niet meer worden gewijzigd.'
            : 'Deze reservering is afgelopen en kan niet meer worden gewijzigd.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <a
            href={`${API_BASE}/invoice-html/${params.token}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '12px 14px', borderRadius: 10, textDecoration: 'none', fontSize: 14, fontWeight: 600,
              color: '#142440', border: '0.5px solid rgba(10,34,64,0.2)', background: 'white',
            }}
          >
            <DocumentTextIcon className="w-4 h-4" />Factuur bekijken
          </a>
          {isCancelled && res.refund_amount > 0 && (
            <a
              href={`${API_BASE}/creditnota-html/${params.token}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '12px 14px', borderRadius: 10, textDecoration: 'none', fontSize: 14, fontWeight: 600,
                color: '#c83232', border: '0.5px solid #f0b0b0', background: '#fef7f7',
              }}
            >
              <ClipboardDocumentListIcon className="w-4 h-4" />Creditnota bekijken
            </a>
          )}
          <a
            href={`/boeken/boeken?email=${encodeURIComponent(res?.email || '')}&telefoon=${encodeURIComponent(res?.phone || '')}&naam=${encodeURIComponent(((res?.first_name || '') + ' ' + (res?.last_name || '')).trim())}${res?.vehicles?.[0]?.license_plate ? '&kenteken=' + encodeURIComponent(res.vehicles[0].license_plate) : ''}`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '12px 14px', borderRadius: 10, textDecoration: 'none', fontSize: 14, fontWeight: 600,
              color: '#19499e', border: '0.5px solid #19499e', background: '#eaf1fb',
            }}
          >
            <PlusIcon className="w-4 h-4" />Nieuwe reservering maken
          </a>
        </div>
      </div></div>
    );
  }

  // ── Menu (default) ────────────────────────────────────────────
  const menuItems: Array<{ icon: React.ReactNode; label: string; sub: string; disabled?: boolean; onClick: () => void }> = [
    {
      icon: <ArrowRightIcon className="w-6 h-6" />,
      label: 'Boottijden',
      sub: 'Veerdienst of tijdstip aanpassen',
      onClick: () => { setError(''); setStep('ferry'); },
    },
    {
      icon: <CalendarDaysIcon className="w-6 h-6" />,
      label: 'Datum wijzigen',
      sub: 'Aankomst- of vertrekdatum aanpassen',
      onClick: () => { setError(''); setStep('dates-form'); },
    },
    {
      icon: <TruckIcon className="w-6 h-6" />,
      label: 'Kenteken wijzigen',
      sub: duringStay ? 'Niet mogelijk tijdens verblijf' : 'Uw voertuig(en) aanpassen',
      disabled: duringStay,
      onClick: () => { if (!duringStay) { setError(''); setStep('plate'); } },
    },
    {
      icon: <UserIcon className="w-6 h-6" />,
      label: 'Persoonsgegevens',
      sub: 'E-mailadres of telefoonnummer wijzigen',
      onClick: () => { setError(''); setStep('contact'); },
    },
    {
      icon: <ClipboardDocumentListIcon className="w-6 h-6" />,
      label: 'Mijn reserveringen',
      sub: 'Alle reserveringen op uw e-mailadres',
      onClick: () => { setError(''); loadAllReservations(); },
    },
  ];

  return (
    <div style={S.page}><div style={S.card}>
      <Logo />

      <div style={{ background: '#f4f6f9', borderRadius: 10, padding: '12px 18px', marginBottom: 24 }}>
        <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 15, color: '#142440', marginBottom: 4 }}>{res?.reference}</div>
        <div style={{ fontSize: 13, color: '#7090b0' }}>{res?.first_name} {res?.last_name}</div>
        {duringStay && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#7a5010', background: '#fff8e6', borderRadius: 6, padding: '4px 8px', display: 'inline-block' }}>
            Huidig verblijf actief
          </div>
        )}
        {isCheckedIn && !duringStay && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#1a6bb5', background: '#e6f1fb', borderRadius: 6, padding: '4px 8px', display: 'inline-block' }}>
            Ingecheckt
          </div>
        )}
      </div>

      <p style={{ margin: '0 0 16px', fontSize: 14, color: '#556070', fontWeight: 600 }}>Wat wilt u wijzigen?</p>

      {error && <div style={{ background: '#fdeaea', borderRadius: 8, padding: '10px 14px', color: '#8a2020', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {menuItems.map(({ icon, label, sub, disabled, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            disabled={!!disabled || allResLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 16px', borderRadius: 10,
              background: disabled ? '#f9fafb' : 'white',
              border: `0.5px solid ${disabled ? 'rgba(10,34,64,0.08)' : 'rgba(10,34,64,0.18)'}`,
              cursor: (disabled || allResLoading) ? 'not-allowed' : 'pointer',
              textAlign: 'left' as const, width: '100%',
              opacity: disabled ? 0.6 : 1,
            }}
          >
            <span style={{ flexShrink: 0, color: disabled ? '#7090b0' : '#142440' }}>{icon}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: disabled ? '#7090b0' : '#142440', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 12, color: disabled ? '#c0c8d4' : '#7090b0' }}>{sub}</div>
            </div>
            {!disabled && <ArrowRightIcon className="w-5 h-5" style={{ marginLeft: 'auto', color: '#7090b0' }} />}
          </button>
        ))}
      </div>

      {/* Quick links: invoice (current res) + new reservation */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <a
          href={`${API_BASE}/invoice-html/${params.token}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '11px 14px', borderRadius: 10, textDecoration: 'none', fontSize: 13, fontWeight: 600,
            color: '#142440', border: '0.5px solid rgba(10,34,64,0.18)', background: 'white',
          }}
        >
          <DocumentTextIcon className="w-4 h-4" />Factuur
        </a>
        <a
          href={`/boeken/boeken?email=${encodeURIComponent(res?.email || '')}&telefoon=${encodeURIComponent(res?.phone || '')}&naam=${encodeURIComponent(((res?.first_name || '') + ' ' + (res?.last_name || '')).trim())}${res?.vehicles?.[0]?.license_plate ? '&kenteken=' + encodeURIComponent(res.vehicles[0].license_plate) : ''}`}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '11px 14px', borderRadius: 10, textDecoration: 'none', fontSize: 13, fontWeight: 600,
            color: '#19499e', border: '0.5px solid #19499e', background: '#eaf1fb',
          }}
        >
          <PlusIcon className="w-4 h-4" />Nieuwe reservering
        </a>
      </div>

      <div style={{ borderTop: '0.5px solid rgba(10,34,64,0.1)', paddingTop: 16, textAlign: 'center' }}>
        <a
          href={`/boeken/annuleren/${params.token}`}
          style={{ fontSize: 13, color: '#c83232', fontWeight: 600, textDecoration: 'none', border: '1px solid #c83232', borderRadius: 8, padding: '9px 18px', display: 'inline-block' }}
        >
          Reservering annuleren
        </a>
      </div>
    </div></div>
  );
}
