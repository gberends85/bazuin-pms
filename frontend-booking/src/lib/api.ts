const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

async function get<T>(path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { headers });
  if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `Fout ${r.status}`); }
  return r.json();
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    // Voeg veld-specifieke Zod details toe aan de melding
    let msg = b.error || `Fout ${r.status}`;
    if (b.details?.fieldErrors) {
      const fieldMsgs = Object.entries(b.details.fieldErrors as Record<string, string[]>)
        .map(([field, errs]) => `${field}: ${errs.join(', ')}`)
        .join('; ');
      if (fieldMsgs) msg += ` (${fieldMsgs})`;
    }
    throw new Error(msg);
  }
  return r.json();
}

// ── Guest auth helpers ─────────────────────────────────────────────────────
const GUEST_TOKEN_KEY = 'bazuin_guest_token';
const GUEST_EMAIL_KEY = 'bazuin_guest_email';

export const guestAuth = {
  getToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(GUEST_TOKEN_KEY);
  },
  getEmail: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(GUEST_EMAIL_KEY);
  },
  save: (token: string, email: string) => {
    localStorage.setItem(GUEST_TOKEN_KEY, token);
    localStorage.setItem(GUEST_EMAIL_KEY, email);
  },
  clear: () => {
    localStorage.removeItem(GUEST_TOKEN_KEY);
    localStorage.removeItem(GUEST_EMAIL_KEY);
  },
  isLoggedIn: (): boolean => {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem(GUEST_TOKEN_KEY);
  },
};

export const guestApi = {
  requestPassword: (email: string) =>
    post<{ success: boolean }>('/auth/guest/request-password', { email }),

  login: (email: string, password: string) =>
    post<{ token: string; email: string }>('/auth/guest/login', { email, password }),

  getReservations: (token: string) =>
    get<{ reservations: any[] }>('/auth/guest/reservations', token),
};

export const bookingApi = {
  checkAvailability: (arrival: string, departure: string) =>
    get<{ available: number; total: number; lotId: string }>(
      `/availability?arrival=${arrival}&departure=${departure}`
    ),

  calculatePrice: (arrival: string, departure: string, vehicles: number) =>
    get<{
      days: number; nights: number; pricePerCar: number; totalPrice: number;
      rateName: string; seasonSurchargePct: number; breakdown: string;
    }>(`/rates/calculate?arrival=${arrival}&departure=${departure}&vehicles=${vehicles}`),

  getFerries: (date: string, destination: string, direction: string) =>
    get<{ schedules: any[] }>(`/ferries?date=${date}&destination=${destination}&direction=${direction}`),

  syncDoeksenDates: (dates: string[]) =>
    post<{ success: boolean; results: Record<string, any> }>('/ferries/sync', { dates }),

  getServices: () => get<any[]>('/services'),

  lookupPlate: (plate: string) =>
    get<any>(`/vehicles/rdw/${plate.replace(/[-\s]/g, '').toUpperCase()}`),

  createReservation: (data: any) =>
    post<{ id: string; reference: string; cancellationToken: string; totalPrice: number }>(
      '/reservations', data
    ),

  createPaymentIntent: (reservationId: string) =>
    post<{ clientSecret?: string; paymentIntentId?: string; onSite?: boolean }>(
      '/payments/create-intent', { reservationId }
    ),

  getByToken: (token: string) => get<any>(`/reservations/token/${token}`),

  cancelByToken: (token: string) => post<any>(`/reservations/token/${token}/cancel`, {}),

  modificationPreview: (token: string, newArrival: string, newDeparture: string) =>
    get<any>(`/reservations/token/${token}/modification-preview?newArrival=${newArrival}&newDeparture=${newDeparture}`),

  confirmModification: (token: string, newArrivalDate: string, newDepartureDate: string) =>
    post<any>(`/reservations/token/${token}/modify`, { newArrivalDate, newDepartureDate }),

  modifyPlate: (token: string, vehicles: { vehicleId: string; oldPlate: string; newPlate: string }[]) =>
    post<any>(`/reservations/token/${token}/modify-plate`, { vehicles }),

  modifyContact: (token: string, email: string, phone: string) =>
    post<any>(`/reservations/token/${token}/modify-contact`, { email, phone }),

  modifyPhone: (token: string, phone: string) =>
    post<{ success: boolean }>(`/reservations/token/${token}/modify-phone`, { phone }),

  requestEmailChange: (token: string, newEmail: string) =>
    post<{ success: boolean }>(`/reservations/token/${token}/request-email-change`, { newEmail }),

  getAllForEmail: (token: string) =>
    get<{ reservations: any[] }>(`/reservations/token/${token}/all-for-email`),

  modifyFerry: (token: string, newOutboundTime: string, newReturnTime: string, notes: string, outboundDestination?: string, returnDestination?: string) =>
    post<{ success: boolean; autoApplied: boolean }>(`/reservations/token/${token}/modify-ferry`, { newOutboundTime, newReturnTime, notes, outboundDestination, returnDestination }),

  modifyDuringStayPay: (token: string, newDepartureDate: string) =>
    post<{ clientSecret: string; amount: number; extraDays: number; duringStayDailyRate: number }>(
      `/reservations/token/${token}/modify-during-stay-pay`, { newDepartureDate }
    ),

  modifyDuringStayComplete: (token: string, paymentIntentId: string, newDepartureDate: string) =>
    post<{ success: boolean }>(
      `/reservations/token/${token}/modify-during-stay-complete`, { paymentIntentId, newDepartureDate }
    ),

  modifyCheckedinDeparture: (token: string, newDepartureDate: string) =>
    post<{ success: boolean; pending: boolean }>(`/reservations/token/${token}/modify-checkedin-departure`, { newDepartureDate }),

  modifyDatesStripePay: (token: string, newArrivalDate: string, newDepartureDate: string, overbooked?: boolean) =>
    post<{ clientSecret: string; amount: number }>(`/reservations/token/${token}/modify-dates-stripe-pay`, { newArrivalDate, newDepartureDate, overbooked: !!overbooked }),

  modifyDatesStripeComplete: (token: string, paymentIntentId: string, newArrivalDate: string, newDepartureDate: string) =>
    post<{ success: boolean }>(`/reservations/token/${token}/modify-dates-stripe-complete`, { paymentIntentId, newArrivalDate, newDepartureDate }),

  modifyDatesOnSite: (token: string, newArrivalDate: string, newDepartureDate: string, overbooked?: boolean) =>
    post<{ success: boolean; amount: number }>(`/reservations/token/${token}/modify-dates-on-site`, { newArrivalDate, newDepartureDate, overbooked: !!overbooked }),

  // ── Laden toevoegen/aanpassen (via token) ─────────────────────
  modifyChargingStripePay: (token: string, vehicles: { vehicleId: string; evServiceId: string | null; evKwh: number | null }[]) =>
    post<{ clientSecret: string; amount: number }>(`/reservations/token/${token}/modify-charging-stripe-pay`, { vehicles }),

  modifyChargingStripeComplete: (token: string, paymentIntentId: string, vehicles: { vehicleId: string; evServiceId: string | null; evKwh: number | null }[]) =>
    post<{ success: boolean }>(`/reservations/token/${token}/modify-charging-stripe-complete`, { paymentIntentId, vehicles }),

  modifyChargingOnSite: (token: string, vehicles: { vehicleId: string; evServiceId: string | null; evKwh: number | null }[]) =>
    post<{ success: boolean; amount: number }>(`/reservations/token/${token}/modify-charging-on-site`, { vehicles }),

  // ── Invoice group modification (public token-based) ───────────
  getInvoiceGroupByToken: (token: string) =>
    get<any>(`/invoice-group-modify/${token}`),

  groupModifyPlate: (token: string, resId: string, vehicles: { vehicleId: string; newPlate: string }[]) =>
    post<{ success: boolean }>(`/invoice-group-modify/${token}/reservation/${resId}/plate`, { vehicles }),

  groupModifyFerry: (token: string, resId: string, outboundTime?: string, returnTime?: string, outboundDestination?: string, returnDestination?: string) =>
    post<{ success: boolean }>(`/invoice-group-modify/${token}/reservation/${resId}/ferry`, { outboundTime, returnTime, outboundDestination, returnDestination }),

  groupModifyEv: (token: string, resId: string, vehicleId: string, evServiceId: string | null, evKwh?: number) =>
    post<{ success: boolean }>(`/invoice-group-modify/${token}/reservation/${resId}/ev`, { vehicleId, evServiceId, evKwh }),

  groupModifyDetails: (token: string, resId: string, firstName: string, lastName: string, phone: string, vehicles?: { vehicleId: string; newPlate: string }[]) =>
    post<{ success: boolean }>(`/invoice-group-modify/${token}/reservation/${resId}/details`, { firstName, lastName, phone, vehicles }),
};
