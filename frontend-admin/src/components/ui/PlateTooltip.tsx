'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatPlate, detectPlateStyle } from '@/lib/plate';

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
