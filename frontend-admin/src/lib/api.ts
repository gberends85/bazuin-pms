const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

let _token: string | null = null;
export function setToken(t: string) {
  _token = t;
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('bzt', t);
    localStorage.setItem('bzt', t);
  }
}
export function getToken() {
  return _token || (typeof window !== 'undefined'
    ? (sessionStorage.getItem('bzt') || localStorage.getItem('bzt'))
    : null);
}
export function clearToken() {
  _token = null;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('bzt');
    localStorage.removeItem('bzt');
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) } as Record<string,string>;
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
  if (res.status === 401) {
    const r = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (r.ok) { const { accessToken: t2 } = await r.json(); setToken(t2); headers.Authorization = `Bearer ${t2}`; const r2 = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' }); return r2.json(); }
    clearToken(); if (typeof window !== 'undefined') window.location.href = '/login'; throw new Error('Sessie verlopen');
  }
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `Fout ${res.status}`); }
  if (res.status === 204) return {} as T;
  return res.json();
}

export const api = {
  auth: {
    login: (email: string, password: string) => req<{accessToken:string;user:any}>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    logout: () => req('/auth/logout', { method: 'POST' }),
  },
  stats: { get: () => req<any>('/admin/stats') },
  reservations: {
    list: (p?: any) => req<any>(`/admin/reservations?${new URLSearchParams(p||{})}`),
    today: (date?: string) => req<any>(`/admin/reservations/today${date ? '?date=' + date : ''}`),
    search: (q: string, includeHistory?: boolean) => req<any>(`/admin/reservations?search=${encodeURIComponent(q)}${includeHistory ? '' : '&status=booked'}&limit=50`),
    get: (id: string) => req<any>(`/admin/reservations/${id}`),
    checkin: (id: string, spot?: string) => req<any>(`/admin/reservations/${id}/checkin`, { method: 'POST', body: JSON.stringify({ parkingSpot: spot }) }),
    checkinMail: (id: string, spot?: string, msg?: string) => req<any>(`/admin/reservations/${id}/checkin-mail`, { method: 'POST', body: JSON.stringify({ parkingSpot: spot, extraMessage: msg }) }),
    checkout: (id: string) => req<any>(`/admin/reservations/${id}/checkout`, { method: 'POST' }),
    cancel: (id: string, pct: number, reason?: string) => req<any>(`/admin/reservations/${id}/cancel`, { method: 'POST', body: JSON.stringify({ refundPct: pct, reason }) }),
    whatsapp: (id: string, msg: string) => req<any>(`/admin/reservations/${id}/whatsapp?message=${encodeURIComponent(msg)}`),
    update: (id: string, data: any) => req<any>(`/admin/reservations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    modificationPreview: (id: string, newArrival: string, newDeparture: string, overrideAvailability?: boolean) =>
      req<any>(`/admin/reservations/${id}/modification-preview?newArrival=${newArrival}&newDeparture=${newDeparture}${overrideAvailability ? '&overrideAvailability=1' : ''}`),
    modify: (id: string, data: any) => req<any>(`/admin/reservations/${id}/modify`, { method: 'POST', body: JSON.stringify(data) }),
    modifications: (id: string) => req<any[]>(`/admin/reservations/${id}/modifications`),
  },
  settings: {
    get: () => req<Record<string,string>>('/admin/settings'),
    set: (key: string, value: string) => req<any>('/admin/settings', { method: 'PUT', body: JSON.stringify({ key, value }) }),
  },
  availability: {
    overview: (from: string, to: string) => req<any[]>(`/admin/availability?from=${from}&to=${to}`),
    override: (date: string, spots: number, reason?: string) => req<any>('/admin/availability/override', { method: 'PUT', body: JSON.stringify({ date, availableSpots: spots, reason }) }),
  },
  reports: { financial: (p: any) => req<any>(`/admin/reports/financial?${new URLSearchParams(p)}`) },
  rates: {
    list: () => req<any[]>('/admin/rates'),
    create: (d: any) => req<any>('/admin/rates', { method: 'POST', body: JSON.stringify(d) }),
    update: (id: string, d: any) => req<any>(`/admin/rates/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    remove: (id: string) => req<any>(`/admin/rates/${id}`, { method: 'DELETE' }),
    dayPrices: (id: string) => req<any[]>(`/admin/rates/${id}/day-prices`),
    updateDayPrices: (id: string, dp: any[]) => req<any>(`/admin/rates/${id}/day-prices`, { method: 'PUT', body: JSON.stringify({ dayPrices: dp }) }),
  },
  ferries: {
    list: () => req<any[]>('/admin/ferries'),
    schedules: (date: string, dest?: string) => req<any>(`/ferries?date=${date}${dest?'&destination='+dest:''}`),
    addSchedule: (d: any) => req<any>('/admin/ferries/schedule', { method: 'POST', body: JSON.stringify(d) }),
  },
  services: {
    list: () => req<any[]>('/admin/services'),
    update: (id: string, d: any) => req<any>(`/admin/services/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  },
  emailTemplates: {
    list: () => req<any[]>('/admin/email-templates'),
    get: (slug: string) => req<any>(`/admin/email-templates/${slug}`),
    update: (slug: string, subject: string, body_html: string) => req<any>(`/admin/email-templates/${slug}`, { method: 'PUT', body: JSON.stringify({ subject, body_html }) }),
  },
  customers: { list: (q?: string) => req<any[]>(`/admin/customers${q?'?search='+q:''}`) },
  rdw: { lookup: (plate: string) => req<any>(`/vehicles/rdw/${plate}`) },
};
