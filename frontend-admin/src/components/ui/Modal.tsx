'use client';
import { useEffect } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number;
}

export default function Modal({ open, onClose, title, children, width = 440 }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!open) return null;
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(10,34,64,0.5)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'white',borderRadius:12,padding:24,width,maxWidth:'95vw',border:'0.5px solid rgba(10,34,64,0.12)',boxShadow:'0 8px 32px rgba(10,34,64,0.2)',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
          <h3 style={{margin:0,fontSize:15,fontWeight:700,color:'#0a2240'}}>{title}</h3>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:18,cursor:'pointer',color:'#888',padding:'0 4px',lineHeight:1}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
