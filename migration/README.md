# Umbraco → Nieuw PMS Migratie

## Stappen

### 1. CSV exporteren uit Umbraco
1. Open uw huidige Umbraco admin
2. Ga naar **Parkeer Beheer → Financieel Rapport**
3. Stel datum in van **ver in het verleden** tot **vandaag**
4. Klik **Tabel** weergave
5. Selecteer alle rijen en kopieer naar een spreadsheet
6. Sla op als `umbraco_export.csv` in deze map

### 2. Migratie uitvoeren
```bash
cd migration
cp ../backend/.env .env    # kopieer database configuratie
npm install
npm run migrate
```

### 3. Controleren
Na de migratie:
- Login op het admin dashboard
- Ga naar **Alle reserveringen**
- Controleer of de gegevens kloppen

## Opmerkingen
- E-mailadressen worden als tijdelijke placeholders aangemaakt
- Kentekens worden overgenomen als ze beschikbaar zijn in de CSV
- Geannuleerde reserveringen worden als 'cancelled' gemarkeerd
- Betaalmethoden zijn onbekend (staan niet in de CSV), worden als 'on_site' aangemaakt
- Voer de migratie altijd eerst uit op een **testomgeving**

## CSV formaat
Het script verwacht kolommen zoals ze in Umbraco verschijnen:
`REF, Plaatsen, Naam, Aankomstdatum, Vertrekdatum, Totale Kosten, Status, Betaald`
