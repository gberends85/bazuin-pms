# Security Review & Remediatie — Bazuin PMS

**Datum:** 7 juni 2026
**Scope:** Volledige codebase (backend, admin-, booking- & website-frontend, SQL-migraties, infra)
**Productie:** Leaseweb VPS, bare-metal (PM2) — `booking.parkeren-harlingen.nl`

---

## Samenvatting

Een diepe multi-agent review vond **59 bevestigde findings** (na adversariële verificatie). **Alle kritieke, hoge en middelzware** findings zijn inmiddels gefixt en uitgerold naar productie, of bewust afgehandeld in overleg. Daarnaast zijn alle gelekte credentials geroteerd en is de productiecode voor het eerst netjes onder versiebeheer gebracht met een werkende deploy-pipeline.

| Ernst | Aantal | Status |
|-------|--------|--------|
| 🔴 Kritiek | 1 | ✅ gefixt + live |
| 🟠 Hoog | 12 | ✅ gefixt + live (of bewust afgehandeld) |
| 🟡 Middel | 18 | ✅ gefixt + live (1 = bewuste bedrijfsregel, 1 = bewust uit) |
| ⚪ Laag | 28 | Zinvolle items gefixt; rest marginaal/overgeslagen |

Volledig findings-rapport: `REVIEW_2026-06-07.md`.

---

## Gefixt en uitgerold

### 🔴 Kritiek
- **Betaling-bypass / replay** (`api.ts`): de during-stay- en pre-stay-wijzigingsendpoints accepteerden een willekeurige `paymentIntentId` en controleerden alleen de status. Een klant kon zo een eerdere/andere betaling hergebruiken voor een grotere wijziging zonder bij te betalen. Nu: PaymentIntent gebonden aan reservering, type én bedrag, plus idempotentie (DB-uniqueindex, migratie 023) tegen replay.

### 🟠 Hoog
- **Webhook-bug** (`index.ts`): `payment_intent.succeeded` voor een geannuleerde reservering crashte stil (ongeldige SQL-aliassen) → betaling geïnd maar niet geregistreerd. Opgelost.
- **IDOR / PII-lek** (`api.ts`): publiek `reservation-name`-endpoint gaf e-mail + telefoon terug o.b.v. alleen een UUID. Velden verwijderd.
- **Fail-closed gemaakt**: keysafe-webhook en Umbraco-import accepteerden alles zonder geconfigureerd geheim. Nu geweigerd zonder secret; constant-time vergelijking.
- **Admin-JWT in localStorage** → alleen nog in geheugen; stille refresh via httpOnly-cookie na herladen.
- **Stale JWT-rol**: `requireAuth` + `/auth/refresh` lezen rol/actief-status nu uit de database i.p.v. het (mogelijk verouderde) token.
- **Admin-JWT via Umbraco-klembordscripts**: de 8 script-generators die het admin-token in klembordscripts bakten (voor plakken in de Umbraco-console, cross-origin) zijn verwijderd. Server-side automatische sync blijft als veilige vervanger.

### 🟡 Middel
- **Over-/dubbele restitutie**: `processRefund` valideert het bedrag nu tegen wat werkelijk is geïnd/al terugbetaald.
- **Refund-webhook**: neemt het werkelijk gerestitueerde bedrag van Stripe over (volledige refund werd ten onrechte als 'partial' geregistreerd).
- **Token-scope-lek** (`all-for-email`): één reserveringstoken toonde de tokens van álle reserveringen van die klant. Nu alleen het eigen token.
- **Account-merge** (`verify-email`): voegde een reservering niet meer automatisch samen met een bestaand account.
- **Website-API-injectie**: strikte datumvalidatie + `encodeURIComponent` in de availability/price-proxy-routes.
- **UTC datum off-by-one**: kas, dashboard en boekingskalender gebruiken nu de lokale datum.
- **StripeCheckout-hang**: bleef niet meer eindeloos hangen bij `processing`/onverwachte status.
- **Wachtwoord-wijzig-functie**: nieuw endpoint + admin-UI (`Instellingen → Wachtwoord`) — voorheen alleen via directe DB-ingreep.

### ⚪ Laag (zinvolle)
- E-mail HTML-escaping van klantnaam (content-injectie).
- Ferry-fetch las verkeerde token-key (`Bearer null`); nu correct.
- Umbraco-import: NaN-veilige prijsparsing (geen NaN-bedragen meer in de DB).

---

## Credentials geroteerd

| Credential | Actie |
|-----------|-------|
| DB-wachtwoord (`bazuin` PG-user, productie) | Geroteerd via `ALTER USER`, `.env` bijgewerkt, app herstart |
| Admin-loginwachtwoord (`changeme123`) | Gereset naar sterk wachtwoord |
| Admin-e-mailadres | Gewijzigd naar `info@parkeren-harlingen.nl` |
| GitHub Personal Access Token (lekte in git-config) | Ingetrokken; VPS gebruikt nu een **SSH deploy key** |
| Lokale dev-Postgres superuser (`BKNq9PBh`) | Geroteerd — credential overal dood |

---

## Infrastructuur & proces

- **Productie in versiebeheer**: ~16.000 regels ongecommit productiewerk is gecommit en gepusht (commit `6432974`). VPS-werkboom is nu schoon.
- **Schone lokale clone**: `C:\Users\guido\Downloads\bazuin-pms` (de oude `bazuin_pms_v3_final` bleek een afwijkende, oudere kopie en is enkel back-up).
- **Deploy-pipeline hersteld**: bewerken → committen → pushen → op de VPS `git pull && npm run build && pm2 restart <app>`. Deze sessie ~7× veilig gebruikt met build-gate (alleen herstarten als de build slaagt).
- **Back-ups op de VPS**: `/root/bazuin_backup_*.tar.gz` en `/root/env_backups/`.

---

## Bewust niet gewijzigd

- **Pricing multi-rate**: gewogen berekening over meerdere tariefperiodes — door de eigenaar bevestigd als correct voor deze opzet. Niet gewijzigd.
- **Nginx admin IP-whitelist**: bewust uit gelaten; admin is beschermd door login + JWT + lockout (voorkomt uitsluiting bij wisselend IP).
- **Containers-as-root (Dockerfiles)**: productie draait bare-metal (PM2), Docker wordt niet gebruikt — niet relevant.

## Resterende marginale LOW-items (optioneel)

nginx security-headers met `always`-vlag op error-responses; `generateReference` recursie → lus (pas relevant bij >9000 boekingen/dag); e-mailtemplate-preview `dangerouslySetInnerHTML` (admin-only, eigen HTML); diverse triviale (ongebruikte props, deploy-script-naamverschil). Geen noemenswaardige impact.

---

## Commits (deze sessie)

| Commit | Omschrijving |
|--------|--------------|
| `6432974` | Snapshot productie + initiële security-fixes in git |
| `77c7a15` | PII/IDOR-findings dichtgezet |
| `0a8a413` | Refunds, wachtwoord-wijzigen, opschoning |
| `14e5b3e` | Wachtwoord-UI, UTC-datums, StripeCheckout-hang |
| `2136e41` | Stale JWT-rol, website-injectie, admin-token in-memory |
| `5fd9fdf` | Umbraco-import NaN-prijs |
| `3216294` | E-mail HTML-escaping + ferry-token-bug |
| `7a25a97` | Umbraco-klembordscripts verwijderd |

GitHub: `Gberends85/bazuin-pms` (branch `master`).

---

## Aanbevolen nazorg

1. Bewaar de nieuwe wachtwoorden in een wachtwoordmanager; verwijder daarna de tijdelijke bestanden (`C:\Users\guido\local_postgres_password.txt` en eventuele resten op de VPS).
2. Werk lokale dev-scripts bij die nog het oude DB-wachtwoord gebruikten.
3. Overweeg een fine-grained GitHub-token/deploy-key-rotatiebeleid.

*Rapport opgesteld door Claude Code, 7 juni 2026.*
