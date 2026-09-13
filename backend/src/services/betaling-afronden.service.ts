import { query, getClient } from '../db/pool';
import { calculatePrice } from './pricing.service';
import { lookupRdw, normalizePlate } from './rdw.service';
import { sendModificationConfirmation } from './email.service';

// Betalingen die via de wijzigpagina binnenkomen afronden: een openstaand bedrag
// alsnog online betalen, of bijbetalen voor een extra auto.
//
// Dit gebeurt vanuit twee plekken:
//  - de wijzigpagina, zodra de klant na betalen terugkomt van Stripe (bij iDEAL
//    wordt de klant altijd weggestuurd en weer teruggeleid);
//  - de Stripe-webhook, voor als de klant na het betalen het tabblad sluit.
// Wie het eerst komt verwerkt de betaling. De reservering wordt daarbij
// vergrendeld, zodat de ander ziet dat het al gedaan is en niets dubbel gebeurt.

async function haalIntent(intentId: string): Promise<any> {
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });
  return stripe.paymentIntents.retrieve(intentId, { expand: ['latest_charge'] });
}

function betaalmethode(intent: any): string {
  const soort = intent?.latest_charge?.payment_method_details?.type;
  return ['ideal', 'card', 'paypal', 'sepa', 'bancontact'].includes(soort) ? soort : 'ideal';
}

// Doorrekenen wat een wijziging in het aantal auto's kost. Staat hier en niet in
// de routes, zodat ook de webhook de prijs kan bepalen.
export async function berekenVoertuigWijzigingVoor(r: any, verwijderIds: string[], erbij: number) {
  const voertuigen = await query(
    'SELECT id, license_plate, sort_order FROM vehicles WHERE reservation_id = $1 ORDER BY sort_order',
    [r.id]
  );
  const huidig = voertuigen.rows.length;

  const teVerwijderen = voertuigen.rows.filter((v: any) => verwijderIds.includes(v.id));
  if (teVerwijderen.length !== verwijderIds.length) {
    return { fout: 'Een of meer voertuigen horen niet bij deze reservering', status: 400 } as const;
  }
  const nieuw = huidig - teVerwijderen.length + erbij;
  if (nieuw < 1) return { fout: 'Er moet minimaal één auto overblijven. Wilt u alles annuleren, gebruik dan "Reservering annuleren".', status: 400 } as const;
  if (nieuw > 5) return { fout: 'Maximaal 5 auto\'s per reservering', status: 400 } as const;

  const isoD = (d: any) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
  const arr = isoD(r.arrival_date), dep = isoD(r.departure_date);
  const lotId = r.parking_lot_id;

  // Nieuwe parkeerprijs; diensten (laden) en toeslagen blijven zoals ze zijn,
  // behalve het laden van een auto die vervalt.
  const prijsInfo = await calculatePrice(new Date(arr), new Date(dep), lotId, nieuw);
  const evVervalt = teVerwijderen.length
    ? (await query(
        `SELECT COALESCE(SUM(ev_price), 0) AS som FROM vehicles WHERE id = ANY($1::uuid[])`,
        [teVerwijderen.map((v: any) => v.id)]
      )).rows[0].som
    : 0;
  const servicesNieuw = Math.max(0, parseFloat(r.services_total || '0') - parseFloat(evVervalt || '0'));
  const toeslag = parseFloat(r.on_site_surcharge || '0');
  // Ter-plekke-toeslag is per auto (5 euro per auto bij het boeken)
  const toeslagNieuw = huidig > 0 ? Math.round((toeslag / huidig) * nieuw * 100) / 100 : toeslag;

  const huidigePrijs = parseFloat(r.total_price);
  const nieuwePrijs = Math.round((prijsInfo.totalPrice + servicesNieuw + toeslagNieuw) * 100) / 100;
  const verschil = Math.round((nieuwePrijs - huidigePrijs) * 100) / 100;

  return {
    r, voertuigen: voertuigen.rows, teVerwijderen, huidig, nieuw,
    arr, dep, lotId, huidigePrijs, nieuwePrijs, verschil,
    servicesNieuw, toeslagNieuw,
  } as const;
}

export interface AfrondUitkomst {
  verwerkt: boolean;
  reden?: string;
  reservationId?: string;
  bedrag?: number;
  methode?: string;
  newCount?: number;
  newPrice?: number;
}

// Openstaand bedrag alsnog online betaald. De reservering komt op betaald te
// staan en de admin krijgt een melding, want bij het ophalen hoeft er dan niets
// meer afgerekend te worden.
export async function rondOpenstaandeBetalingAf(intentId: string, opties: { mail?: boolean } = {}): Promise<AfrondUitkomst> {
  const intent = await haalIntent(intentId);
  const rid = intent.metadata?.reservationId;
  if (intent.status !== 'succeeded' || intent.metadata?.type !== 'outstanding_payment' || !rid) {
    return { verwerkt: false, reden: 'geen geslaagde betaling van een openstaand bedrag' };
  }
  const bedrag = intent.amount / 100;
  const methode = betaalmethode(intent);

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const cur = await client.query(
      `SELECT status, payment_status, payment_method, arrival_date, departure_date, total_price
         FROM reservations WHERE id = $1 FOR UPDATE`,
      [rid]
    );
    const r = cur.rows[0];
    if (!r) { await client.query('ROLLBACK'); return { verwerkt: false, reden: 'reservering niet gevonden' }; }
    if (r.payment_status === 'paid') {
      await client.query('ROLLBACK');
      return { verwerkt: false, reden: 'al verwerkt', reservationId: rid, bedrag, methode };
    }

    await client.query(
      `UPDATE reservations
          SET payment_status = 'paid',
              payment_method = $1,
              paid_at = COALESCE(paid_at, to_timestamp($2)),
              prepaid_amount = COALESCE(prepaid_amount, 0) + $3,
              stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $4),
              updated_at = NOW()
        WHERE id = $5`,
      [methode, intent.created, bedrag, intent.id, rid]
    );

    const tijdensVerblijf = r.status === 'checked_in';
    await client.query(
      `INSERT INTO reservation_modifications
         (reservation_id, modified_by, old_arrival_date, old_departure_date, new_arrival_date, new_departure_date,
          old_total_price, new_total_price, price_difference, modification_fee,
          status, modification_type, during_stay, stripe_payment_intent_id, change_details)
       VALUES ($1,'customer',$2,$3,$2,$3,$4,$4,0,0,'pending_review','payment',$5,$6,$7)`,
      [rid, r.arrival_date, r.departure_date, parseFloat(r.total_price), tijdensVerblijf, intent.id,
       JSON.stringify({
         paidOnline: bedrag, method: methode, wasOnSite: r.payment_method === 'on_site',
         duringStay: tijdensVerblijf, paidAt: new Date(intent.created * 1000).toISOString(),
       })]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  if (opties.mail !== false) {
    sendModificationConfirmation(rid).catch(err =>
      console.error('Bevestigingsmail na online betaling mislukt:', err));
  }
  return { verwerkt: true, reservationId: rid, bedrag, methode };
}

// Bijbetaald voor een of meer extra auto's. De kentekens staan in de betaling
// zelf, zodat de webhook ze ook kent.
export async function rondExtraAutosAf(intentId: string, opties: { mail?: boolean } = {}): Promise<AfrondUitkomst> {
  const intent = await haalIntent(intentId);
  const rid = intent.metadata?.reservationId;
  const platen = String(intent.metadata?.plates || '').split(',').map((p: string) => p.trim()).filter(Boolean);
  if (intent.status !== 'succeeded' || intent.metadata?.type !== 'add_vehicles' || !rid || platen.length === 0) {
    return { verwerkt: false, reden: 'geen geslaagde betaling voor een extra auto' };
  }
  const bedrag = intent.amount / 100;

  const nieuweVoertuigen: { id: string; plaat: string }[] = [];
  let b: any;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT * FROM reservations WHERE id = $1 FOR UPDATE', [rid]);
    const r = cur.rows[0];
    if (!r) { await client.query('ROLLBACK'); return { verwerkt: false, reden: 'reservering niet gevonden' }; }

    const al = await client.query(
      `SELECT 1 FROM reservation_modifications
        WHERE reservation_id = $1 AND modification_type = 'vehicles'
          AND (stripe_payment_intent_id = $2 OR change_details::jsonb->>'paymentIntentId' = $2)
        LIMIT 1`,
      [rid, intent.id]
    );
    if (al.rows.length > 0) { await client.query('ROLLBACK'); return { verwerkt: false, reden: 'al verwerkt', reservationId: rid }; }

    b = await berekenVoertuigWijzigingVoor(r, [], platen.length);
    if ('fout' in b) {
      await client.query('ROLLBACK');
      console.error(`[extra auto] Betaling ${intent.id} ontvangen maar niet te verwerken: ${b.fout}`);
      return { verwerkt: false, reden: b.fout, reservationId: rid };
    }

    let volgorde = b.huidig;
    for (const plaat of platen) {
      const genormaliseerd = normalizePlate(plaat) || '';
      const ins = await client.query(
        `INSERT INTO vehicles (reservation_id, license_plate, sort_order) VALUES ($1,$2,$3) RETURNING id`,
        [rid, genormaliseerd, volgorde++]
      );
      nieuweVoertuigen.push({ id: ins.rows[0].id, plaat: genormaliseerd });
    }

    await client.query(
      `UPDATE reservations
          SET total_price = $1, base_price = $2, services_total = $3, on_site_surcharge = $4,
              prepaid_amount = COALESCE(prepaid_amount,0) + $5, updated_at = NOW()
        WHERE id = $6`,
      [b.nieuwePrijs, b.nieuwePrijs - b.servicesNieuw - b.toeslagNieuw, b.servicesNieuw, b.toeslagNieuw, bedrag, rid]
    );

    await client.query(
      `INSERT INTO reservation_modifications
         (reservation_id, modified_by, old_arrival_date, old_departure_date, new_arrival_date, new_departure_date,
          old_total_price, new_total_price, price_difference, modification_fee,
          status, modification_type, stripe_payment_intent_id, change_details)
       VALUES ($1,'customer',$2,$3,$2,$3,$4,$5,$6,0,'completed','vehicles',$7,$8)`,
      [rid, r.arrival_date, r.departure_date, b.huidigePrijs, b.nieuwePrijs, b.verschil, intent.id,
       JSON.stringify({ addedPlates: platen, oldCount: b.huidig, newCount: b.nieuw, paymentIntentId: intent.id })]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  // RDW-gegevens na afloop ophalen; een trage RDW mag de betaling niet ophouden.
  for (const v of nieuweVoertuigen) {
    if (!v.plaat) continue;
    lookupRdw(v.plaat).then(info => {
      if (info) {
        query(
          `UPDATE vehicles SET rdw_make=$1, rdw_model=$2, rdw_color=$3, rdw_fuel_type=$4, rdw_year=$5, rdw_fetched_at=NOW() WHERE id=$6`,
          [info.make, info.model, info.color, info.fuelType, info.year, v.id]
        ).catch(console.error);
      }
    }).catch(console.error);
  }

  if (opties.mail !== false) {
    sendModificationConfirmation(rid).catch(err =>
      console.error('Bevestigingsmail na toevoegen auto mislukt:', err));
  }
  return { verwerkt: true, reservationId: rid, bedrag, newCount: b.nieuw, newPrice: b.nieuwePrijs };
}
