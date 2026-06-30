'use client';
import { useState, useEffect, useRef } from 'react';

/**
 * Tijdelijke site-brede melding-balk (Tall Ship Races, t/m 6 juli 2026).
 * Verschijnt bovenaan elke pagina en verdwijnt automatisch na de einddatum.
 *
 * De balk staat fixed bovenaan (boven de header). Hij meet zijn eigen hoogte
 * en zet de CSS-variabele --tsr-h, die zowel de header-top als de body
 * padding-top aanstuurt — zo schuift alle content netjes naar beneden.
 */
export default function NoticeBanner() {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Datum-check pas op de client, zodat SSR/CSR overeenkomen (geen hydration-mismatch).
  useEffect(() => {
    setShow(new Date() < new Date('2026-07-07T00:00:00'));
  }, []);

  // Hoogte van de balk doorgeven aan de layout via --tsr-h.
  useEffect(() => {
    const root = document.documentElement;
    if (!show) {
      root.style.setProperty('--tsr-h', '0px');
      return;
    }
    const apply = () => {
      const h = ref.current ? ref.current.offsetHeight : 0;
      root.style.setProperty('--tsr-h', h + 'px');
    };
    apply();
    window.addEventListener('resize', apply);
    return () => {
      window.removeEventListener('resize', apply);
      root.style.setProperty('--tsr-h', '0px');
    };
  }, [show]);

  if (!show) return null;

  return (
    <div
      ref={ref}
      role="status"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 101,
        background: 'rgba(10,34,64,0.97)', color: '#fff',
        padding: '10px 18px', textAlign: 'center', fontSize: 13.5, lineHeight: 1.5,
        borderBottom: '2px solid #e8a020',
      }}
    >
      <div className="container" style={{ maxWidth: 960, margin: '0 auto' }}>
        ⚓ <strong>Tall Ship Races Harlingen (3 t/m 6 juli):</strong> niet alle routes naar de stalling zijn dan bereikbaar. Wij zijn <strong>altijd bereikbaar vanaf de noordkant</strong> via de <strong>A31/N31, afrit Harlingen-havens</strong>. Houd rekening met mogelijk <strong>extra reistijd</strong> in en rond Harlingen.
      </div>
    </div>
  );
}
