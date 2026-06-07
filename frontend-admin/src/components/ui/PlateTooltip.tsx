'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatPlate } from '@/lib/plate';

// ─── Dutch plate patterns (6 alphanumeric chars) ────────────────────────────
const DUTCH_PATTERNS = [
  /^[A-Z]{2}\d{2}[A-Z]{2}$/,   // XX-99-XX
  /^[A-Z]{2}[A-Z]{2}\d{2}$/,   // XX-XX-99
  /^\d{2}[A-Z]{2}[A-Z]{2}$/,   // 99-XX-XX
  /^[A-Z]{2}\d{3}[A-Z]$/,      // XX-999-X
  /^[A-Z]\d{3}[A-Z]{2}$/,      // X-999-XX
  /^\d{2}[A-Z]{3}\d$/,         // 99-XXX-9
  /^\d[A-Z]{3}\d{2}$/,         // 9-XXX-99
  /^[A-Z][A-Z]{3}\d{2}$/,      // X-XXX-99
  /^[A-Z]{3}\d{2}[A-Z]$/,      // XXX-99-X
  /^[A-Z]\d{2}[A-Z]{3}$/,      // X-99-XXX
  /^\d\d[A-Z]{2}\d{3}$/,       // 99-XX-999
];

type PlateStyle = {
  bg: string;
  border: string;
  textColor: string;
  euBg: string | null;
  euCode: string;
  isEu: boolean;
};

function detectPlateStyle(raw: string): PlateStyle {
  const s = raw.replace(/[-\s]/g, '').toUpperCase();

  // Dutch
  if (DUTCH_PATTERNS.some(p => p.test(s))) {
    return { bg: '#f5c518', border: '#c8a010', textColor: '#0a2240', euBg: '#003399', euCode: 'NL', isEu: true };
  }

  // German: 1-3 letter city code + 1-2 letters + 1-4 digits (total 4-8 chars, not 6-char Dutch pattern)
  if (/^[A-Z]{1,3}[A-Z]{1,2}\d{1,4}$/.test(s) && s.length >= 4 && s.length <= 8 && s.length !== 6) {
    return { bg: '#ffffff', border: '#333', textColor: '#000', euBg: '#003399', euCode: 'D', isEu: true };
  }

  // Belgian new format: 1 digit + 3 letters + 3 digits
  if (/^\d[A-Z]{3}\d{3}$/.test(s)) {
    return { bg: '#ffffff', border: '#c00', textColor: '#000', euBg: '#003399', euCode: 'B', isEu: true };
  }

  // French: 2 letters + 3 digits + 2 letters (7 chars)
  if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(s)) {
    return { bg: '#ffffff', border: '#555', textColor: '#000', euBg: '#003399', euCode: 'F', isEu: true };
  }

  // UK: 2 letters + 2 digits + 3 letters
  if (/^[A-Z]{2}\d{2}[A-Z]{3}$/.test(s)) {
    return { bg: '#f0f0f0', border: '#003399', textColor: '#000', euBg: null, euCode: 'GB', isEu: false };
  }

  // Unknown / special
  return { bg: '#ffffff', border: '#aaa', textColor: '#333', euBg: null, euCode: '', isEu: false };
}

export default function PlateTooltip({ plate, small }: { plate: string; small?: boolean }) {
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  const style = detectPlateStyle(plate);

  async function handleHover() {
    setShow(true);
    if (info !== null || loading) return;
    setLoading(true);
    try {
      const result = await api.rdw.lookup(plate.replace(/[-\s]/g,'').toUpperCase());
      setInfo(result);
    } catch { setInfo({ found: false }); }
    finally { setLoading(false); }
  }

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span
        onMouseEnter={handleHover}
        onMouseLeave={() => setShow(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'stretch',
          background: style.bg,
          border: `${small ? 1.5 : 2}px solid ${style.border}`,
          borderRadius: small ? 4 : 5,
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: small ? 22 : 30,
          fontWeight: 700,
          letterSpacing: small ? 1.5 : 2,
          color: style.textColor,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          verticalAlign: 'middle',
          lineHeight: 1,
          cursor: 'default',
        }}
      >
        {/* EU / country stripe */}
        {style.euBg !== null ? (
          <span style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: style.euBg,
            width: small ? 13 : 18,
            flexShrink: 0,
            padding: '2px 1px',
            gap: 1,
          }}>
            <span style={{ fontSize: 7, color: '#FFD700', lineHeight: 1, fontFamily: 'Arial', fontWeight: 400 }}>★</span>
            <span style={{ fontSize: 6, color: 'white', fontFamily: 'Arial', fontWeight: 700, lineHeight: 1 }}>{style.euCode}</span>
          </span>
        ) : style.euCode ? (
          <span style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#003399',
            width: small ? 13 : 18,
            flexShrink: 0,
            fontSize: 6,
            color: 'white',
            fontFamily: 'Arial',
            fontWeight: 700,
          }}>{style.euCode}</span>
        ) : null}
        <span style={{ padding: small ? '2px 6px 2px 4px' : '3px 8px 3px 6px', display: 'flex', alignItems: 'center', textTransform: 'uppercase' }}>
          {formatPlate(plate)}
        </span>
      </span>

      {show && (
        <div style={{ position: 'fixed', background: '#0a2240', color: 'white', borderRadius: 8, padding: '10px 14px', fontSize: 12, whiteSpace: 'nowrap', zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', minWidth: 180, transform: 'translateY(-110%) translateX(-4px)' }}>
          {loading && <span style={{ color: 'rgba(255,255,255,0.6)' }}>Opzoeken...</span>}
          {info && !info.found && <span style={{ color: 'rgba(255,255,255,0.5)' }}>Niet gevonden in RDW</span>}
          {info && info.found && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontWeight: 700, color: '#f5c842', marginBottom: 2 }}>{info.make} {info.model}</div>
              <div style={{ color: 'rgba(255,255,255,0.7)' }}>Kleur: {info.color}</div>
              <div style={{ color: 'rgba(255,255,255,0.7)' }}>Brandstof: {info.fuelType}</div>
              {info.year && <div style={{ color: 'rgba(255,255,255,0.7)' }}>Bouwjaar: {info.year}</div>}
            </div>
          )}
          <div style={{ position: 'absolute', bottom: -5, left: 12, width: 10, height: 10, background: '#0a2240', transform: 'rotate(45deg)' }} />
        </div>
      )}
    </span>
  );
}
