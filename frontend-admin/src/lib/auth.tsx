'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getToken, setToken, clearToken } from './api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export function useAuthGuard(): boolean {
  const router = useRouter();
  const path = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (path === '/login') {
      setReady(true);
      return;
    }

    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }

    // Check token expiry from JWT payload
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        // Try silent refresh via httpOnly cookie
        fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'include' })
          .then(r => r.ok ? r.json() : Promise.reject(new Error('Refresh failed')))
          .then(({ accessToken }) => { setToken(accessToken); setReady(true); })
          .catch(() => { clearToken(); router.replace('/login'); });
        return;
      }
    } catch {
      clearToken();
      router.replace('/login');
      return;
    }

    setReady(true);
  }, [path, router]);

  return ready;
}
