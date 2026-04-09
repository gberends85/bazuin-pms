# Autostalling De Bazuin — Parking Management System v1.0

Volledig standalone PMS ter vervanging van Umbraco.
Gebouwd op basis van live-analyse van cms.autostallingdebazuin.nl.

---

## Drie applicaties

| App | Poort | Domein |
|-----|-------|--------|
| **Klantportal** (boekingen) | 3000 | parkeren-harlingen.nl |
| **API backend** | 3001 | api.autostallingdebazuin.nl |
| **Admin dashboard** | 3002 | admin.autostallingdebazuin.nl |

---

## Projectstructuur

```
bazuin/
├── backend/                        Node.js + Express + TypeScript
│   ├── src/
│   │   ├── index.ts                Server, CORS, rate limiting, Stripe webhook
│   │   ├── routes/api.ts           40+ API endpoints
│   │   ├── services/
│   │   │   ├── pricing.service.ts  Tariefberekening (De Bazuin dag-logica)
│   │   │   ├── stripe.service.ts   Payment Intents + Refunds
│   │   │   ├── email.service.ts    Nodemailer + Handlebars templates
│   │   │   └── rdw.service.ts      Kenteken → voertuiginfo
│   │   ├── middleware/auth.ts      JWT + refresh + brute-force bescherming
│   │   └── db/pool.ts              PostgreSQL connectiepool
│   └── migrations/
│       ├── 001_initial_schema.sql  15+ tabellen, triggers, indexen
│       └── 002_seed_data.sql       Exact overgenomen uit Umbraco:
│                                   tarieven, veerboten, diensten, e-mailsjablonen
│
├── frontend-admin/                 Next.js 14 Admin Dashboard
│   └── src/app/
│       ├── login/                  Inlogpagina met brute-force beveiliging
│       ├── dashboard/              Stats + boottijdenbalk + bezettingsmeter
│       ├── arrivals/               Aankomsten: inchecken, check-in+mail, WhatsApp
│       ├── departures/             Vertrekken + uitchecken
│       ├── reservations/           Lijst met zoeken/filter
│       ├── reservations/[id]/      Volledig detailscherm per reservering
│       ├── calendar/               Maandagenda + beschikbaarheidsoverschrijving
│       ├── reports/                Financieel rapport met totalen
│       ├── customers/              Klantenlijst
│       └── settings/
│           ├── rates/              Dagprijstabel per seizoen (instelbaar)
│           ├── ferries/            Boottijden invoeren per dag
│           ├── services/           EV-laden pakketten + toeslag
│           ├── policies/           Annuleringsbeleid per tijdvenster
│           └── emails/             E-mailsjablonen met HTML-editor + preview
│
├── frontend-booking/               Next.js 14 Klantportal
│   └── src/app/
│       ├── boeken/                 5-staps boekingsproces:
│       │                           1. Datums + bestemming + beschikbaarheid
│       │                           2. Veerboot heen + terug (of eigen tijd)
│       │                           3. Kenteken + RDW-lookup
│       │                           4. EV-laden per auto
│       │                           5. Gegevens + betaling (Stripe Elements)
│       └── annuleren/[token]/      Annuleringspagina via e-maillink
│
├── migration/                      Umbraco → Nieuw PMS migratiescript
├── nginx/nginx.conf                Productie reverse proxy + SSL
├── docker-compose.yml              Alles in één commando opstarten
└── install.sh                      Volledig installatiescript (Ubuntu/Debian)
```

---

## Installatie — Productie

### Optie A: Automatisch (aanbevolen)
```bash
git clone <repo> /opt/bazuin
cd /opt/bazuin
bash install.sh
```
Het script installeert Node.js 20, PostgreSQL, Nginx, PM2, SSL (Let's Encrypt)
en configureert alles automatisch.

### Optie B: Docker
```bash
cp backend/.env.example .env
# Vul Stripe, SMTP en JWT secrets in
docker-compose up -d
```

### Optie C: Handmatig
```bash
# 1. Database
createdb bazuin_pms
psql -d bazuin_pms -f backend/migrations/001_initial_schema.sql
psql -d bazuin_pms -f backend/migrations/002_seed_data.sql

# 2. Backend
cd backend && cp .env.example .env   # vul in
npm install && npm run build
node dist/index.js &

# 3. Admin
cd ../frontend-admin
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1 npm run build
npm start &

# 4. Klantportal
cd ../frontend-booking
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1 npm run build
npm start &
```

---

## Development opstarten

```bash
# Terminal 1 — Backend
cd backend && npm install
cp .env.example .env              # Vul DATABASE_URL minimaal in
createdb bazuin_pms
psql -d bazuin_pms -f migrations/001_initial_schema.sql
psql -d bazuin_pms -f migrations/002_seed_data.sql
npm run dev                        # :3001

# Terminal 2 — Admin dashboard
cd frontend-admin && npm install
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1 npm run dev   # :3002

# Terminal 3 — Klantportal
cd frontend-booking && npm install
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1 \
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... \
npm run dev                        # :3000
```

---

## Eerste inlog admin

- **URL:** http://localhost:3002/login (of https://admin.autostallingdebazuin.nl)
- **E-mail:** admin@autostallingdebazuin.nl
- **Wachtwoord:** `changeme123`

⚠️ **Wijzig dit direct via de database of maak een nieuw account aan.**

---

## Verplichte configuratie na installatie

### 1. Stripe webhook instellen
In het Stripe Dashboard:
- Ga naar Developers → Webhooks → Add endpoint
- URL: `https://api.autostallingdebazuin.nl/api/v1/payments/webhook`
- Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
- Kopieer de webhook signing secret naar `.env` als `STRIPE_WEBHOOK_SECRET`

### 2. E-mailprovider
Vul in `.env`:
```
SMTP_HOST=smtp.uwprovider.nl
SMTP_PORT=587
SMTP_USER=info@autostallingdebazuin.nl
SMTP_PASS=uw-wachtwoord
```
Aanbevolen providers: Mailgun, Brevo (Sendinblue), of uw eigen SMTP-server.

### 3. Boottijden invoeren
Na installatie: ga naar **Admin → Instellingen → Veerboten** en voer de dagelijkse
vertrektijden in voor Terschelling en Vlieland. Terugkerende tijden hoeven maar
eenmalig ingesteld te worden via de template-functionaliteit.

---

## Umbraco datamigratie

```bash
cd migration
# Exporteer reserveringen uit Umbraco als CSV
# Sla op als migration/umbraco_export.csv
npm install
DATABASE_URL=postgresql://bazuin:password@localhost/bazuin_pms npm run migrate
```

Zie `migration/README.md` voor gedetailleerde instructies.

---

## Tarieven (uit Umbraco overgenomen)

| Dagen | Voorjaar/Najaar | Zomer |
|-------|----------------|-------|
| 1 dag | € 35 | € 40 |
| 2 dagen | € 45 | € 50 |
| 3 dagen | € 55 | € 60 |
| 4 dagen | € 65 | € 70 |
| 7 dagen | € 80 | € 89 |
| 14 dagen | € 140 | € 160 |
| Extra dag (>14) | + € 8/dag | + € 10/dag |

Alle tarieven zijn aanpasbaar via Admin → Instellingen → Tarieven.

---

## EV-laden (uit Umbraco overgenomen)

| Pakket | kWh | Prijs | Bereik |
|--------|-----|-------|--------|
| S | 10 kWh | € 10 | ~30-50 km |
| M | 20 kWh | € 15 | ~75-125 km |
| L | 30 kWh | € 20 | ~100-150 km |
| XL | 40 kWh | € 25 | ~125-200 km |
| XXL | 60 kWh | € 40 | ~175-300 km |

---

## Technische stack

| Component | Technologie |
|-----------|-------------|
| Backend API | Node.js 20 + Express 4 + TypeScript |
| Database | PostgreSQL 15 |
| Query | pg (native driver, directe SQL) |
| Authenticatie | JWT (access 15m + refresh 7d, httpOnly cookie) |
| Betaling | Stripe (iDEAL, card, Bancontact, PayPal, SEPA) |
| E-mail | Nodemailer + Handlebars |
| Frontend | Next.js 14 (App Router) |
| Styling | Tailwind CSS + inline styles |
| RDW koppeling | opendata.rdw.nl (gratis, geen API-sleutel) |
| WhatsApp | wa.me deeplinks (geen Business API nodig) |
| Process manager | PM2 |
| Reverse proxy | Nginx |
| SSL | Let's Encrypt (Certbot) |
| Container | Docker + Docker Compose |

---

## Licentie

Eigendom van Autostalling De Bazuin, Harlingen.
Ontwikkeld met Claude — Anthropic.
