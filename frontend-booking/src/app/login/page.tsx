'use client';
import { useState, useEffect, Suspense } from 'react';
import { EnvelopeIcon, CheckCircleIcon, KeyIcon } from '@heroicons/react/24/outline';
import { useRouter, useSearchParams } from 'next/navigation';
import { guestApi, guestAuth } from '@/lib/api';

type Step = 'form' | 'sending' | 'sent' | 'logging-in' | 'error';

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [errorMsg, setErrorMsg] = useState('');
  const [passwordSentTo, setPasswordSentTo] = useState('');

  // Al ingelogd of magic link? Doorsturen.
  useEffect(() => {
    const tokenParam = searchParams.get('token');
    const emailParam = searchParams.get('email');
    if (tokenParam && emailParam) {
      // Magic link: sla token op en stuur door
      guestAuth.save(tokenParam, emailParam);
      router.replace('/mijn-reserveringen');
      return;
    }
    if (guestAuth.isLoggedIn()) {
      router.replace('/mijn-reserveringen');
    }
  }, [router, searchParams]);

  async function handleRequestPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStep('sending');
    setErrorMsg('');
    try {
      await guestApi.requestPassword(email.trim());
      setPasswordSentTo(email.trim());
      setStep('sent');
    } catch (err: any) {
      setErrorMsg(err.message || 'Er is een fout opgetreden');
      setStep('form');
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setStep('logging-in');
    setErrorMsg('');
    try {
      const { token, email: confirmedEmail } = await guestApi.login(email.trim(), password.trim());
      guestAuth.save(token, confirmedEmail);
      router.replace('/mijn-reserveringen');
    } catch (err: any) {
      setErrorMsg(err.message || 'Onjuist e-mailadres of wachtwoord');
      setStep(step === 'logging-in' ? 'sent' : 'form');
    }
  }

  const busy = step === 'sending' || step === 'logging-in';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a2240 0%, #1a4080 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'Arial, sans-serif',
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
        width: '100%',
        maxWidth: '420px',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ background: '#0a2240', padding: '28px 32px 20px' }}>
          <div style={{ fontSize: '11px', color: '#7090b0', letterSpacing: '1px', marginBottom: '4px', textTransform: 'uppercase' }}>
            Autostalling De Bazuin
          </div>
          <div style={{ color: 'white', fontSize: '22px', fontWeight: '800' }}>
            Mijn reserveringen
          </div>
          <div style={{ color: '#7090b0', fontSize: '13px', marginTop: '4px' }}>
            Log in om uw reserveringen te bekijken
          </div>
        </div>

        <div style={{ padding: '32px' }}>

          {/* Stap 1: E-mailadres invullen + wachtwoord aanvragen */}
          {(step === 'form' || step === 'sending') && (
            <form onSubmit={handleRequestPassword}>
              <Label>E-mailadres</Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="u@voorbeeld.nl"
                disabled={busy}
                required
              />

              {errorMsg && <ErrorBox>{errorMsg}</ErrorBox>}

              <p style={{ fontSize: '13px', color: '#555', marginBottom: '16px', lineHeight: '1.5' }}>
                Vul uw e-mailadres in en klik op de knop. U ontvangt dan een wachtwoord in uw mailbox.
              </p>

              <Btn type="submit" disabled={busy || !email.trim()} primary>
                {step === 'sending' ? 'Versturen…' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><EnvelopeIcon className="w-4 h-4" />Stuur mij een wachtwoord</span>}
              </Btn>

              <div style={{ textAlign: 'center', margin: '16px 0 0', fontSize: '13px', color: '#888' }}>
                Al een wachtwoord ontvangen?{' '}
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#0a2240', fontWeight: '700', cursor: 'pointer', padding: 0, fontSize: '13px' }}
                  onClick={() => setStep('sent')}
                >
                  Direct inloggen
                </button>
              </div>
            </form>
          )}

          {/* Stap 2: Wachtwoord ontvangen, nu inloggen */}
          {(step === 'sent' || step === 'logging-in') && (
            <form onSubmit={handleLogin}>
              {passwordSentTo && (
                <div style={{
                  background: '#e8f5eb', border: '1px solid #a8d5b0', borderRadius: '8px',
                  padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#2a7a3a',
                }}>
                  <CheckCircleIcon className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Wachtwoord verstuurd naar <strong>{passwordSentTo}</strong>.<br />
                  Controleer ook uw spam-map.
                </div>
              )}

              <Label>E-mailadres</Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="u@voorbeeld.nl"
                disabled={busy}
                required
              />

              <Label>Wachtwoord</Label>
              <Input
                type="text"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="XXX-XXX-XXX"
                disabled={busy}
                required
                autoFocus={!!passwordSentTo}
                style={{ fontFamily: 'monospace', letterSpacing: '2px', fontSize: '18px' }}
              />

              {errorMsg && <ErrorBox>{errorMsg}</ErrorBox>}

              <Btn type="submit" disabled={busy || !email.trim() || !password.trim()} primary>
                {step === 'logging-in' ? 'Inloggen…' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><KeyIcon className="w-4 h-4" />Inloggen</span>}
              </Btn>

              <div style={{ textAlign: 'center', margin: '16px 0 0', fontSize: '13px', color: '#888' }}>
                Geen wachtwoord?{' '}
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#0a2240', fontWeight: '700', cursor: 'pointer', padding: 0, fontSize: '13px' }}
                  onClick={() => { setStep('form'); setPassword(''); setPasswordSentTo(''); setErrorMsg(''); }}
                >
                  Nieuw wachtwoord aanvragen
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '13px', fontWeight: '700', color: '#0a2240', marginBottom: '6px' }}>
      {children}
    </div>
  );
}

function Input({
  style, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { style?: React.CSSProperties }) {
  return (
    <input
      {...props}
      style={{
        width: '100%',
        border: '1.5px solid #d1d5db',
        borderRadius: '8px',
        padding: '10px 14px',
        fontSize: '15px',
        marginBottom: '16px',
        outline: 'none',
        boxSizing: 'border-box',
        background: props.disabled ? '#f9fafb' : 'white',
        color: '#111',
        ...style,
      }}
    />
  );
}

function Btn({
  children, primary, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      {...props}
      style={{
        width: '100%',
        background: props.disabled ? '#9ca3af' : primary ? '#0a2240' : '#f3f4f6',
        color: primary ? 'white' : '#374151',
        border: 'none',
        borderRadius: '8px',
        padding: '13px',
        fontSize: '15px',
        fontWeight: '700',
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        marginBottom: '4px',
      }}
    >
      {children}
    </button>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px',
      padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#dc2626',
    }}>
      {children}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}
