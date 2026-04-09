'use client';
import { useState, useEffect, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'info';
interface Toast { id: number; message: string; type: ToastType; }

let addToast: (msg: string, type?: ToastType) => void = () => {};

export function toast(msg: string, type: ToastType = 'success') { addToast(msg, type); }
export function toastError(msg: string) { addToast(msg, 'error'); }

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  addToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);
  const colors: Record<ToastType, string> = { success: '#0a7c6e', error: '#8a2020', info: '#0a2240' };
  return (
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      {toasts.map(t => (
        <div key={t.id} style={{ background: colors[t.type], color: 'white', padding: '10px 20px', borderRadius: 24, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
