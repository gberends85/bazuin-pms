'use client';
import { useEffect } from 'react';
import { api } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

// This page redirects to the shared backend invoice HTML page.
// The backend is the single source of truth for the invoice layout —
// any changes to the template are immediately visible for both
// admin and customer-facing invoice links.
export default function PrintInvoicePage({ params }: { params: { id: string } }) {
  useEffect(() => {
    // Fetch the reservation to get the access token, then open the backend HTML invoice.
    // The backend /admin/invoice-html/:id endpoint requires auth (Bearer token).
    // We use the public token-based endpoint to avoid the browser auth header problem.
    api.reservations.get(params.id)
      .then(data => {
        const token = data.cancellation_token;
        if (token) {
          window.location.href = `${API_BASE}/invoice-html/${token}`;
        } else {
          document.body.innerHTML = '<p style="padding:20px;color:red">Factuur kon niet worden geladen (geen token).</p>';
        }
      })
      .catch(e => {
        document.body.innerHTML = `<p style="padding:20px;color:red">Fout: ${e.message}</p>`;
      });
  }, [params.id]);

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif', color: '#555', textAlign: 'center' }}>
      <p>Factuur laden...</p>
    </div>
  );
}
