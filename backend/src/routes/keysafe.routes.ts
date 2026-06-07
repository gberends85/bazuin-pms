/**
 * Keysafe-routes — gemount onder /api/v1.
 *
 * Admin-endpoints (JWT vereist):
 *   GET  /api/v1/admin/keysafe/status
 *   GET  /api/v1/admin/keysafe/lockers
 *   POST /api/v1/admin/keysafe/lockers/:index/assign   body: { valid_hours?: number }
 *   POST /api/v1/admin/keysafe/lockers/:index/open
 *
 * Webhook van de gateway (gedeeld geheim, GEEN JWT):
 *   POST /api/v1/keysafe/events
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { timingSafeEqual } from 'crypto';
import { requireAuth } from '../middleware/auth';
import * as keysafe from '../services/keysafe.service';
import { sendSimpleEmail } from '../services/email.service';
import { query } from '../db/pool';

export const keysafeRouter = Router();

/** Constant-time vergelijking van twee geheimen (voorkomt timing-aanvallen). */
function secretsMatch(a: unknown, b: string): boolean {
  if (typeof a !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function gatewayError(res: Response, e: any) {
  console.error('[keysafe] gateway-fout:', e?.message || e);
  return res.status(502).json({ error: 'Keysafe-gateway niet bereikbaar', detail: e?.message });
}

// ── Admin: status van de kluis ────────────────────────────────────────────
keysafeRouter.get('/admin/keysafe/status', requireAuth, async (_req, res) => {
  try {
    res.json(await keysafe.getStatus());
  } catch (e) {
    gatewayError(res, e);
  }
});

// ── Admin: alle vakjes + status ───────────────────────────────────────────
keysafeRouter.get('/admin/keysafe/lockers', requireAuth, async (_req, res) => {
  try {
    res.json(await keysafe.listLockers());
  } catch (e) {
    gatewayError(res, e);
  }
});

// ── Admin: nieuwe code uitgeven voor een (nieuwe) klant ───────────────────
const assignSchema = z.object({
  valid_hours: z.number().int().positive().max(24 * 60).optional(),
});

keysafeRouter.post('/admin/keysafe/lockers/:index/assign', requireAuth, async (req, res) => {
  const index = parseInt(req.params.index, 10);
  if (Number.isNaN(index) || index < 0) {
    return res.status(400).json({ error: 'Ongeldig vaknummer' });
  }
  const parsed = assignSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ongeldige invoer' });
  }
  try {
    const result = await keysafe.assignCode(index, parsed.data.valid_hours);
    // result.code kun je hier naar de klant sturen (e-mail/sms) of teruggeven aan de UI.
    res.json(result);
  } catch (e) {
    gatewayError(res, e);
  }
});

// ── Admin: vak op afstand openen ──────────────────────────────────────────
keysafeRouter.post('/admin/keysafe/lockers/:index/open', requireAuth, async (req, res) => {
  const index = parseInt(req.params.index, 10);
  if (Number.isNaN(index) || index < 0) {
    return res.status(400).json({ error: 'Ongeldig vaknummer' });
  }
  try {
    res.json(await keysafe.openLocker(index));
  } catch (e) {
    gatewayError(res, e);
  }
});

// ── Admin: code toewijzen aan een reservering via parking_spot ───────────────
keysafeRouter.post('/admin/reservations/:id/keysafe/assign', requireAuth, async (req: Request, res: Response) => {
  const result = await query(
    `SELECT id, parking_spot FROM reservations WHERE id = $1`,
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Reservering niet gevonden' });
  const r = result.rows[0];

  if (!r.parking_spot) {
    return res.status(400).json({ error: 'Geen kluisnummer (parking_spot) ingesteld voor deze reservering' });
  }

  const lockerIndex = parseInt(r.parking_spot, 10) - 1; // parking_spot is 1-gebaseerd, index is 0-gebaseerd
  if (lockerIndex < 0 || lockerIndex > 6) {
    return res.status(400).json({ error: `Ongeldig kluisnummer: ${r.parking_spot}` });
  }

  try {
    const assigned = await keysafe.assignCode(lockerIndex, 24);
    await query(
      `UPDATE reservations SET locker_code=$1, locker_code_sent_at=NULL, locker_collected_at=NULL, updated_at=NOW() WHERE id=$2`,
      [assigned.code, r.id]
    );
    return res.json({ code: assigned.code, valid_to: assigned.valid_to });
  } catch (e: any) {
    gatewayError(res, e);
  }
});

// ── Admin: code per e-mail sturen aan de klant ────────────────────────────
keysafeRouter.post('/admin/reservations/:id/keysafe/send-email', requireAuth, async (req: Request, res: Response) => {
  const result = await query(
    `SELECT r.id, r.locker_code, r.parking_spot, r.reference,
            c.first_name, c.email
     FROM reservations r JOIN customers c ON c.id = r.customer_id
     WHERE r.id = $1`,
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Reservering niet gevonden' });
  const r = result.rows[0];

  if (!r.locker_code) {
    return res.status(400).json({ error: 'Er is nog geen code aangemaakt voor deze reservering' });
  }
  if (!r.email) {
    return res.status(400).json({ error: 'Geen e-mailadres bekend voor deze klant' });
  }

  const subject = `Uw afhaalcode voor de autosleutel — ${r.reference}`;
  const html = `
    <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff;color:#1a1814;">
      <p style="font-size:15px;color:#4a4339;">Beste ${r.first_name},</p>
      <p style="font-size:15px;color:#4a4339;line-height:1.7;">
        Uw auto staat startklaar. Gebruik de onderstaande code om uw autosleutel op te halen uit de afhaalkluis naast de intercom.
      </p>
      <div style="margin:28px 0;text-align:center;">
        <div style="display:inline-block;background:#f5f0e8;border:2px solid #c8b89e;border-radius:8px;padding:20px 40px;">
          <div style="font-size:11px;color:#b5ada3;text-transform:uppercase;letter-spacing:3px;margin-bottom:8px;">Uw code</div>
          <div style="font-size:48px;font-weight:900;letter-spacing:10px;color:#1a1814;font-family:'Courier New',monospace;">${r.locker_code}</div>
        </div>
      </div>
      <p style="font-size:14px;color:#4a4339;line-height:1.7;">
        <strong>Kluisnummer:</strong> ${r.parking_spot || '—'}<br/>
        De kluis bevindt zich naast de intercom bij de ingang van Autostalling De Bazuin.<br/>
        Toets de code in op het paneel van de kluis om de deur te openen en uw sleutel op te halen.
      </p>
      <p style="font-size:13px;color:#b5ada3;margin-top:24px;">
        Gaat er iets mis? Bel aan bij de intercom of bel ons op.
      </p>
    </div>`;

  try {
    await sendSimpleEmail(r.email, subject, html);
    await query(
      `UPDATE reservations SET locker_code_sent_at=NOW() WHERE id=$1`,
      [r.id]
    );
    return res.json({ success: true });
  } catch (e: any) {
    console.error('[keysafe] e-mail versturen mislukt:', e);
    return res.status(500).json({ error: 'E-mail versturen mislukt: ' + e.message });
  }
});

// ── Webhook van de gateway: code gebruikt / sleutel opgehaald/ingelegd ────
keysafeRouter.post('/keysafe/events', async (req: Request, res: Response) => {
  const secret = process.env.KEYSAFE_WEBHOOK_SECRET;
  // Fail-closed: zonder geconfigureerd geheim accepteren we GEEN webhooks
  // (anders zou iedereen reserveringen kunnen uitchecken / kluiscodes wissen).
  if (!secret) {
    console.error('[keysafe] KEYSAFE_WEBHOOK_SECRET is niet ingesteld — webhook geweigerd');
    return res.status(503).json({ error: 'Webhook niet geconfigureerd' });
  }
  if (!secretsMatch(req.headers['x-keysafe-secret'], secret)) {
    return res.status(401).json({ error: 'Ongeldig webhook-geheim' });
  }

  const ev = (req.body || {}) as {
    locker_number?: number; code?: string; event?: string; detail?: string; at?: string;
  };
  console.log(`[keysafe] event: ${ev.event} vak ${ev.locker_number} code ${ev.code} @ ${ev.at}`);

  // Bij key_collected: markeer de reservering als opgehaald en wis de code.
  // Match op kluisnummer + de daadwerkelijk gebruikte code (meest precies, want
  // er kunnen meerdere boekingen aan hetzelfde vak gekoppeld zijn). GEEN datum-
  // restrictie: de sleutel kan op een andere dag dan departure_date opgehaald worden.
  if (ev.event === 'key_collected' && ev.locker_number != null) {
    try {
      // Sleutel opgehaald = klant is weg → reservering ook uitchecken (mits ingecheckt).
      const upd = await query(
        `UPDATE reservations
         SET locker_collected_at = NOW(),
             locker_code         = NULL,
             locker_code_sent_at = NULL,
             status              = CASE WHEN status = 'checked_in' THEN 'completed' ELSE status END,
             updated_at          = NOW()
         WHERE parking_spot = $1
           AND locker_code IS NOT NULL
           AND locker_collected_at IS NULL
           AND ($2::text IS NULL OR locker_code = $2)
         RETURNING reference, status`,
        [String(ev.locker_number), ev.code != null ? String(ev.code) : null]
      );
      const ref = upd.rows[0]?.reference ?? '—';
      console.log(`[keysafe] key_collected → ${upd.rowCount ?? 0} reservering(en) bijgewerkt + uitgecheckt (vak ${ev.locker_number}, code ${ev.code ?? '—'}, ref ${ref})`);
    } catch (e) {
      console.error('[keysafe] locker bijwerken mislukt:', e);
    }
  }

  try {
    const notify = process.env.KEYSAFE_NOTIFY_EMAIL;
    if (notify && ev.event === 'key_collected') {
      await sendSimpleEmail(
        notify,
        `Sleutel opgehaald — vak ${ev.locker_number}`,
        `<p>${ev.detail || 'Code gebruikt'} op vak <strong>${ev.locker_number}</strong> om ${ev.at}.</p>`,
      );
    }
  } catch (e) {
    console.error('[keysafe] melding versturen mislukt:', e);
  }

  res.json({ ok: true });
});
