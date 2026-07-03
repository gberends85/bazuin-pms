const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

// Het access-token wordt ALLEEN in het geheugen bewaard (niet in localStorage/sessionStorage),
// zodat een XSS-lek het niet langdurig kan stelen. Bij een herlaad wordt het stil opnieuw
// opgehaald via de httpOnly refresh-cookie (zie useAuthGuard / req()).
let _token: string | null = null;
export function setToken(t: string) {
  _token = t;
  // Migratie: ruim eventuele oude, op schijf bewaarde tokens op.
  if (typeof window !== 'undefined') {
    try { localStorage.removeItem('bzt'); sessionStorage.removeItem('bzt'); } catch {}
  }
}
export function getToken() {
  return _token;
}
export function clearToken() {
  _token = null;
  if (typeof window !== 'undefined') {
    try { localStorage.removeItem('bzt'); sessionStorage.removeItem('bzt'); } catch {}
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

export async function fetchContractInvoicePreview(customerId: string, from: string, to: string, evLines?: { description: string; kwh: number; ratePerKwh: number }[]): Promise<Blob> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/admin/contract-customers/${customerId}/invoice-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    credentials: 'include',
    body: JSON.stringify({ from, to, evLines: evLines ?? [] }),
  });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error((b as any).error || `Fout ${res.status}`); }
  return res.blob();
}

export async function fetchContractInvoicePdf(id: string): Promise<Blob> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/admin/contract-invoices/${id}/pdf`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    credentials: 'include',
  });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error((b as any).error || `Fout ${res.status}`); }
  return res.blob();
}

export async function fetchInvoiceGroupPdf(id: string | number): Promise<Blob> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/admin/invoice-groups/${id}/pdf`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    credentials: 'include',
  });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error((b as any).error || `Fout ${res.status}`); }
  return res.blob();
}

export const api = {
  auth: {
    login: (email: string, password: string) => req<{accessToken:string;user:any}>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    logout: () => req('/auth/logout', { method: 'POST' }),
    changePassword: (currentPassword: string, newPassword: string) => req<{success:boolean}>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  },
  stats: { get: () => req<any>('/admin/stats') },
  traffic: { forecast: (from: string, to: string) => req<any>(`/admin/dashboard/traffic?from=${from}&to=${to}`) },
  reservations: {
    list: (p?: any) => req<any>(`/admin/reservations?${new URLSearchParams(p||{})}`),
    today: (date?: string, to?: string) => req<any>(`/admin/reservations/today${date ? '?date=' + date : ''}${to ? (date ? '&to=' + to : '?to=' + to) : ''}`),
    search: (q: string, includeHistory?: boolean) => req<any>(`/admin/reservations?search=${encodeURIComponent(q)}${includeHistory ? '' : '&status=booked'}&limit=50`),
    get: (id: string) => req<any>(`/admin/reservations/${id}`),
    checkin: (id: string, spot?: string) => req<any>(`/admin/reservations/${id}/checkin`, { method: 'POST', body: JSON.stringify({ parkingSpot: spot }) }),
    checkinMail: (id: string, spot?: string, msg?: string) => req<any>(`/admin/reservations/${id}/checkin-mail`, { method: 'POST', body: JSON.stringify({ parkingSpot: spot, extraMessage: msg }) }),
    resendConfirmation: (id: string) => req<any>(`/admin/reservations/${id}/resend-confirmation`, { method: 'POST' }),
    assignLockerCode: (id: string) => req<{ code: string; valid_to: string }>(`/admin/reservations/${id}/keysafe/assign`, { method: 'POST' }),
    sendLockerEmail: (id: string) => req<any>(`/admin/reservations/${id}/keysafe/send-email`, { method: 'POST' }),
    checkout: (id: string) => req<any>(`/admin/reservations/${id}/checkout`, { method: 'POST' }),
    cancel: (id: string, pct: number, reason?: string) => req<any>(`/admin/reservations/${id}/cancel`, { method: 'POST', body: JSON.stringify({ refundPct: pct, reason }) }),
    refundPreview: (id: string) => req<{ refundPct: number; refundAmount: number; policyDescription: string; paid: boolean; anchorDate: string; arrivalDate: string; wasModified: boolean; daysUntilArrival: number }>(`/admin/reservations/${id}/refund-preview`),
    whatsapp: (id: string, msg: string) => req<any>(`/admin/reservations/${id}/whatsapp?message=${encodeURIComponent(msg)}`),
    update: (id: string, data: any) => req<any>(`/admin/reservations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    setVehicleCount: (id: string, count: number, override?: boolean) => req<{ vehicleCount: number; total_price: number; previousCount: number }>(`/admin/reservations/${id}/set-vehicle-count`, { method: 'POST', body: JSON.stringify({ count, override }) }),
    modificationPreview: (id: string, newArrival: string, newDeparture: string, overrideAvailability?: boolean) =>
      req<any>(`/admin/reservations/${id}/modification-preview?newArrival=${newArrival}&newDeparture=${newDeparture}${overrideAvailability ? '&overrideAvailability=1' : ''}`),
    modify: (id: string, data: any) => req<any>(`/admin/reservations/${id}/modify`, { method: 'POST', body: JSON.stringify(data) }),
    modifications: (id: string) => req<any[]>(`/admin/reservations/${id}/modifications`),
    createAdmin: (data: any) => req<{ id: string; reference: string; totalPrice: number }>('/admin/reservations', { method: 'POST', body: JSON.stringify(data) }),
    stripeDetails: (id: string) => req<any>(`/admin/reservations/${id}/stripe`),
    stripeSync: (id: string) => req<any>(`/admin/reservations/${id}/stripe-sync`, { method: 'POST' }),
    extraItems: (id: string, items: any[]) => req<any>(`/admin/reservations/${id}/extra-items`, { method: 'PUT', body: JSON.stringify({ items }) }),
    updatePaymentStatus: (id: string, status: string, method?: string | null) => req<any>(`/admin/reservations/${id}/payment-status`, { method: 'PUT', body: JSON.stringify({ status, method }) }),
    updateInvoiceDate: (id: string, invoice_date: string | null) => req<any>(`/admin/reservations/${id}/invoice-date`, { method: 'PUT', body: JSON.stringify({ invoice_date }) }),
    onSiteSurcharge: (id: string, remove?: boolean) => req<any>(`/admin/reservations/${id}/on-site-surcharge`, { method: 'POST', body: JSON.stringify({ remove: !!remove }) }),
  },
  settings: {
    get: () => req<Record<string,string>>('/admin/settings'),
    set: (key: string, value: string) => req<any>('/admin/settings', { method: 'PUT', body: JSON.stringify({ key, value }) }),
  },
  availability: {
    overview: (from: string, to: string) => req<any[]>(`/admin/availability?from=${from}&to=${to}`),
    override: (date: string, spots: number | null, daytimeSpots: number | null, reason?: string) => req<any>('/admin/availability/override', { method: 'PUT', body: JSON.stringify({ date, availableSpots: spots, daytimeSpots, reason }) }),
    removeOverride: (date: string) => req<any>('/admin/availability/override', { method: 'DELETE', body: JSON.stringify({ date }) }),
    capacity: () => req<{ onlineSpots: number; daytimeSpots: number }>('/admin/location-capacity'),
    setCapacity: (onlineSpots: number | null, daytimeSpots: number | null) => req<any>('/admin/location-capacity', { method: 'PUT', body: JSON.stringify({ onlineSpots, daytimeSpots }) }),
  },
  reports: {
    financial: (p: any) => req<any>(`/admin/reports/financial?${new URLSearchParams(p)}`),
    occupancy: (p: any) => req<any>(`/admin/reports/occupancy?${new URLSearchParams(p)}`),
    cash: (from: string, to?: string) => req<any>(`/admin/reports/cash?from=${from}${to && to !== from ? '&to=' + to : ''}`),
  },
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
    syncDoeksen: (days: number, fromDate?: string) => req<any>('/admin/ferries/doeksen-sync', { method: 'POST', body: JSON.stringify({ days, fromDate }) }),
    syncDate: (date: string) => req<any>(`/admin/ferries/doeksen-sync/${date}`, { method: 'POST' }),
  },
  services: {
    list: () => req<any[]>('/admin/services'),
    create: (d: any) => req<any>('/admin/services', { method: 'POST', body: JSON.stringify(d) }),
    update: (id: string, d: any) => req<any>(`/admin/services/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    remove: (id: string) => req<any>(`/admin/services/${id}`, { method: 'DELETE' }),
  },
  emailTemplates: {
    list: () => req<any[]>('/admin/email-templates'),
    get: (slug: string) => req<any>(`/admin/email-templates/${slug}`),
    update: (slug: string, subject: string, body_html: string) => req<any>(`/admin/email-templates/${slug}`, { method: 'PUT', body: JSON.stringify({ subject, body_html }) }),
    sendTest: (slug: string, to: string) => req<any>(`/admin/email-templates/${slug}/test`, { method: 'POST', body: JSON.stringify({ to }) }),
  },
  customers: {
    list: (q?: string) => req<any[]>(`/admin/customers${q?'?search='+encodeURIComponent(q):''}`),
    get: (id: string) => req<any>(`/admin/customers/${id}`),
    byRef: (ref: string) => req<{ customerId: string }>(`/admin/customers/by-ref/${encodeURIComponent(ref)}`),
    remove: (id: string) => req<any>(`/admin/customers/${id}`, { method: 'DELETE' }),
    magicLink: (id: string) => req<{ url: string; email: string; first_name: string; last_name: string }>(`/admin/customers/${id}/magic-link`),
  },
  rdw: {
    lookup: (plate: string) => req<any>(`/vehicles/rdw/${plate}`),
    bulkRefresh: () => req<{ total: number; updated: number }>('/admin/vehicles/rdw-refresh', { method: 'POST' }),
  },
  umbraco: {
    status: () => req<{ lastSyncId: string|null; lastSyncAt: string|null; hasToken: boolean; hasClientCreds: boolean; syncRunning?: boolean; syncResult?: { imported: number; cancelled: number; skipped: number; errors: number; errorIds: number[]; at: string; error?: string } | null }>('/admin/umbraco/status'),
    // Directe server-side sync: start op de achtergrond (volledige scan duurt te lang
    // voor één request) en geeft meteen { started, running } terug. Resultaat via status().
    sync: (body?: { fromId?: number; toId?: number; dryRun?: boolean }) =>
      req<{ started: boolean; running: boolean }>(
        '/admin/umbraco/sync', { method: 'POST', body: JSON.stringify(body || {}) }
      ),
    syncCancellations: () =>
      req<{ checked: number; cancelled: number; notFound: number; errors: number; cancelledRefs: string[] }>(
        '/admin/umbraco/sync-cancellations', { method: 'POST' }
      ),
    saveCredentials: (clientId: string, clientSecret: string) =>
      req<{ ok: boolean; tokenWorks: boolean }>('/admin/umbraco/save-credentials', { method: 'POST', body: JSON.stringify({ clientId, clientSecret }) }),
    saveToken: (umbracoToken: string) => req<{ ok: boolean }>('/admin/umbraco/save-token', { method: 'POST', body: JSON.stringify({ umbracoToken }) }),
    maxId: () => req<{ maxId: number }>('/admin/umbraco/max-id'),
    pendingIds: () => req<{ ids: number[]; count: number }>('/admin/umbraco/pending-ids'),
    v1NoEvIds: () => req<{ ids: number[]; count: number }>('/admin/umbraco/v1-no-ev-ids'),
    newNoEvIds: () => req<{ ids: number[]; count: number }>('/admin/umbraco/new-no-ev-ids'),
    allEvIds: () => req<{ entries: Array<{ id: number; isV1: boolean }>; count: number }>('/admin/umbraco/all-ev-ids'),
    cancelledPaidIds: () => req<{ entries: Array<{ id: number; name: string; arrival: string; departure: string; total: number }>; count: number }>('/admin/umbraco/cancelled-paid-ids'),
    gapIds: (from: number, to: number) => req<{ ids: number[]; count: number; from: number; to: number; present: number }>(`/admin/umbraco/gap-ids?from=${from}&to=${to}`),
    reactivate: (umbId: number) => req<{ reactivated: boolean; reference: string }>('/admin/umbraco/reactivate', { method: 'POST', body: JSON.stringify({ umbId }) }),
    addEvService: (records: Array<{ umbId: number; kwh: number | null; includedInPrice: boolean }>) =>
      req<{ updated: number }>('/admin/umbraco/add-ev-service', { method: 'POST', body: JSON.stringify({ records }) }),
    vehicleRepairScan: (dryRun?: boolean) =>
      req<{ dryRun: boolean; scanned: number; flaggedCount: number; repairedCount: number; flagged: any[] }>(
        '/admin/umbraco/vehicle-repair-scan', { method: 'POST', body: JSON.stringify({ dryRun: !!dryRun }) }
      ),
    evRepairCandidates: () => req<{ candidates: any[]; count: number }>('/admin/umbraco/ev-repair-candidates'),
    evRepairApply: (fixes: any[], dryRun?: boolean) =>
      req<{ dryRun: boolean; applied: number }>('/admin/umbraco/ev-repair-apply', { method: 'POST', body: JSON.stringify({ fixes, dryRun: !!dryRun }) }),
    importBatch: (records: any[], dryRun?: boolean) =>
      req<{ imported: number; cancelled: number; skipped: number; errors: number; lastId: number; dryRun: boolean }>(
        '/admin/umbraco/import-batch', { method: 'POST', body: JSON.stringify({ records, dryRun }) }
      ),
  },
  invoiceGroups: {
    list: () => req<any[]>('/admin/invoice-groups'),
    create: (d: any) => req<any>('/admin/invoice-groups', { method: 'POST', body: JSON.stringify(d) }),
    get: (id: string | number) => req<any>(`/admin/invoice-groups/${id}`),
    update: (id: string | number, d: any) => req<any>(`/admin/invoice-groups/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    remove: (id: string | number) => req<any>(`/admin/invoice-groups/${id}`, { method: 'DELETE' }),
    removeReservation: (groupId: string | number, resId: string) => req<any>(`/admin/invoice-groups/${groupId}/reservations/${resId}`, { method: 'DELETE' }),
    send: (id: string | number) => req<any>(`/admin/invoice-groups/${id}/send`, { method: 'POST' }),
  },
  contractCustomers: {
    list: () => req<any[]>('/admin/contract-customers'),
    create: (d: any) => req<any>('/admin/contract-customers', { method: 'POST', body: JSON.stringify(d) }),
    update: (id: string, d: any) => req<any>(`/admin/contract-customers/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    remove: (id: string) => req<any>(`/admin/contract-customers/${id}`, { method: 'DELETE' }),
    entries: (id: string, from: string, to: string) => req<any[]>(`/admin/contract-customers/${id}/entries?from=${from}&to=${to}`),
    saveEntries: (id: string, entries: any[]) => req<any>(`/admin/contract-customers/${id}/entries`, { method: 'PUT', body: JSON.stringify({ entries }) }),
    vehicleStays: (id: string, from: string, to: string) => req<any[]>(`/admin/contract-customers/${id}/vehicle-stays?from=${from}&to=${to}`),
    addVehicleStay: (id: string, d: any) => req<any>(`/admin/contract-customers/${id}/vehicle-stays`, { method: 'POST', body: JSON.stringify(d) }),
    finalizeInvoice: (id: string, from: string, to: string, evLines?: { description: string; kwh: number; ratePerKwh: number }[]) => req<any>(`/admin/contract-customers/${id}/invoice`, { method: 'POST', body: JSON.stringify({ from, to, evLines: evLines ?? [] }) }),
    invoicedPeriods: (id: string) => req<{ invoice_number: string; period_from: string; period_to: string }[]>(`/admin/contract-customers/${id}/invoiced-periods`),
    setAutoInvoice: (id: string, d: { enabled: boolean; intervalMonths: number; startDate: string | null }) => req<{ ok: boolean }>(`/admin/contract-customers/${id}/auto-invoice`, { method: 'PUT', body: JSON.stringify(d) }),
  },
  contractVehicleStays: {
    update: (id: string, d: any) => req<any>(`/admin/contract-vehicle-stays/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    remove: (id: string) => req<any>(`/admin/contract-vehicle-stays/${id}`, { method: 'DELETE' }),
  },
  contractInvoices: {
    list: (customerId?: string) => req<any[]>(`/admin/contract-invoices${customerId ? '?customer_id=' + customerId : ''}`),
    remove: (id: string) => req<any>(`/admin/contract-invoices/${id}`, { method: 'DELETE' }),
    sendEmail: (id: string) => req<{ ok: boolean; email: string }>(`/admin/contract-invoices/${id}/send-email`, { method: 'POST' }),
  },
  pendingContractInvoices: {
    list: () => req<any[]>('/admin/pending-contract-invoices'),
    run: () => req<{ created: number; details: string[] }>('/admin/pending-contract-invoices/run', { method: 'POST' }),
    reject: (id: string) => req<{ ok: boolean }>(`/admin/pending-contract-invoices/${id}/reject`, { method: 'POST' }),
    markApproved: (id: string, invoiceNumber: string) => req<{ ok: boolean }>(`/admin/pending-contract-invoices/${id}/mark-approved`, { method: 'POST', body: JSON.stringify({ invoiceNumber }) }),
  },
  contractEvSessions: {
    list: (customerId: string, from: string, to: string) =>
      req<any[]>(`/admin/contract-customers/${customerId}/ev-sessions?from=${from}&to=${to}`),
    add: (customerId: string, data: any) =>
      req<any>(`/admin/contract-customers/${customerId}/ev-sessions`, { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      req<any>(`/admin/contract-ev-sessions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) =>
      req<any>(`/admin/contract-ev-sessions/${id}`, { method: 'DELETE' }),
  },
  cancellationPolicies: {
    list: () => req<any[]>('/admin/cancellation-policies'),
    update: (id: string, d: any) => req<any>(`/admin/cancellation-policies/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  },
  modifications: {
    pending: () => req<any[]>('/admin/modifications/pending'),
    count: () => req<{ count: number }>('/admin/modifications/pending/count'),
    accept: (id: string, notes: string, sendEmail: boolean) =>
      req<any>(`/admin/modifications/${id}/accept`, { method: 'POST', body: JSON.stringify({ notes, sendEmail }) }),
    reject: (id: string, notes: string, sendEmail: boolean) =>
      req<any>(`/admin/modifications/${id}/reject`, { method: 'POST', body: JSON.stringify({ notes, sendEmail }) }),
    applyOnSitePayment: (id: string) =>
      req<any>(`/admin/modifications/${id}/apply-on-site-payment`, { method: 'POST', body: JSON.stringify({}) }),
    sendPaymentLink: (id: string) =>
      req<{ success: boolean; url: string }>(`/admin/modifications/${id}/send-payment-link`, { method: 'POST', body: JSON.stringify({}) }),
  },
  keysafe: {
    lockers: () => req<any[]>('/admin/keysafe/lockers'),
  },
};
