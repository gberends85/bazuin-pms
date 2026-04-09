'use client';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function PlateTooltip({ plate }: { plate: string }) {
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

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
    <span style={{position:'relative',display:'inline-block'}}>
      <span className="nl-plate" onMouseEnter={handleHover} onMouseLeave={()=>setShow(false)}>
        {plate}
      </span>
      {show && (
        <div style={{position:'fixed',background:'#0a2240',color:'white',borderRadius:8,padding:'10px 14px',fontSize:12,whiteSpace:'nowrap',zIndex:9999,boxShadow:'0 4px 16px rgba(0,0,0,0.3)',minWidth:180,transform:'translateY(-110%) translateX(-4px)'}}>
          {loading && <span style={{color:'rgba(255,255,255,0.6)'}}>Opzoeken...</span>}
          {info && !info.found && <span style={{color:'rgba(255,255,255,0.5)'}}>Niet gevonden in RDW</span>}
          {info && info.found && (
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <div style={{fontWeight:700,color:'#f5c842',marginBottom:2}}>{info.make} {info.model}</div>
              <div style={{color:'rgba(255,255,255,0.7)'}}>Kleur: {info.color}</div>
              <div style={{color:'rgba(255,255,255,0.7)'}}>Brandstof: {info.fuelType}</div>
              {info.year && <div style={{color:'rgba(255,255,255,0.7)'}}>Bouwjaar: {info.year}</div>}
            </div>
          )}
          <div style={{position:'absolute',bottom:-5,left:12,width:10,height:10,background:'#0a2240',transform:'rotate(45deg)'}}/>
        </div>
      )}
    </span>
  );
}
