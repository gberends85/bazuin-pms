const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `Fout ${r.status}`); }
  return r.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `Fout ${r.status}`); }
  return r.json();
}

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
};
