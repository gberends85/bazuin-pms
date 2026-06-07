-- Migration 018: Add extra_diensten block to booking_confirmed email template
-- Adds {{#if heeft_extra_diensten}} / {{#each extra_diensten}} Handlebars block
-- with service naam, kenteken (license plate) and bedrag.

UPDATE email_templates SET
  body_html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
<div style="background:#0a2240;padding:24px;text-align:center">
  <h1 style="color:#e8a020;margin:0;font-size:22px">Autostalling De Bazuin</h1>
  <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:13px">Harlingen · Op loopafstand van de veerboten</p>
</div>
<div style="padding:32px 24px">
  <h2 style="color:#0a2240;margin:0 0 8px">Reservering bevestigd!</h2>
  <p style="color:#555;margin:0 0 24px">Beste {{voornaam}}, uw reservering is ontvangen en bevestigd.</p>

  <div style="background:#f4f6f9;border-radius:8px;padding:20px;margin-bottom:24px">
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px">Boekingsreferentie</p>
    <p style="margin:0;font-size:24px;font-weight:700;font-family:monospace;color:#0a7c6e;letter-spacing:2px">{{reference}}</p>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555;font-size:14px">Aankomst</td><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:600;font-size:14px">{{aankomst_datum}}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555;font-size:14px">Vertrek</td><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:600;font-size:14px">{{vertrek_datum}}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555;font-size:14px">Kenteken(s)</td><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:600;font-size:14px">{{kentekenlijst}}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555;font-size:14px">Veerboot heen</td><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:600;font-size:14px">{{veerboot_heen}} om {{vertrektijd_heen}}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555;font-size:14px">Veerboot terug</td><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:600;font-size:14px">{{veerboot_terug}} om {{vertrektijd_terug}}</td></tr>
    <tr><td style="padding:8px 0;color:#555;font-size:14px">Totaal betaald</td><td style="padding:8px 0;font-weight:700;font-size:16px;color:#0a7c6e">{{totaal_bedrag}}</td></tr>
  </table>

  {{#if heeft_extra_diensten}}
  <div style="background:#eaf7ee;border:1px solid #4caf50;border-radius:8px;padding:16px;margin-bottom:24px">
    <p style="margin:0 0 12px;font-weight:700;color:#1a7a3a;font-size:14px">&#9889; Gekozen extra diensten</p>
    <table style="width:100%;border-collapse:collapse">
      {{#each extra_diensten}}
      <tr>
        <td style="padding:7px 0;border-bottom:1px solid #c8e6c9;font-size:14px;color:#333">
          {{naam}}{{#if kenteken}}&nbsp;<span style="font-family:monospace;background:#FFDD00;padding:1px 6px;border-radius:3px;font-size:12px;font-weight:700;letter-spacing:1px">{{kenteken}}</span>{{/if}}
        </td>
        <td style="padding:7px 0;border-bottom:1px solid #c8e6c9;font-size:14px;font-weight:600;color:#1a7a3a;text-align:right;white-space:nowrap">{{bedrag}}</td>
      </tr>
      {{/each}}
    </table>
  </div>
  {{/if}}

  <div style="background:#fff8e6;border:1px solid #e8a020;border-radius:8px;padding:16px;margin-bottom:24px">
    <p style="margin:0 0 8px;font-weight:700;color:#7a5010">&#128273; Verplichte sleutelafgifte</p>
    <p style="margin:0;font-size:13px;color:#7a5010">Bij aankomst parkeert u uw auto op de geel gemarkeerde vakken op het buitenterrein en werpt u uw autosleutel in de beveiligde afgiftekluis. Gooi alleen de kale sleutel in de kluis — geen hoesjes, siliconen omhulsels of enveloppen.</p>
  </div>

  <div style="margin-bottom:24px">
    <a href="{{annuleringslink}}" style="display:inline-block;background:#f4f6f9;color:#0a2240;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;margin-right:8px">Reservering annuleren</a>
    <a href="{{wijzigingslink}}" style="display:inline-block;background:#f4f6f9;color:#0a2240;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600">Reservering wijzigen</a>
  </div>

  <p style="font-size:13px;color:#888">Vragen? WhatsApp ons op <a href="https://wa.me/{{whatsapp_nummer}}" style="color:#0a7c6e">+{{whatsapp_nummer}}</a></p>
</div>
<div style="background:#0a2240;padding:16px;text-align:center">
  <p style="color:rgba(255,255,255,0.5);font-size:12px;margin:0">Autostalling De Bazuin · Harlingen · autostallingdebazuin.nl</p>
</div>
</div>',
  variables = '["voornaam","reference","aankomst_datum","vertrek_datum","kentekenlijst","veerboot_heen","vertrektijd_heen","veerboot_terug","vertrektijd_terug","totaal_bedrag","annuleringslink","wijzigingslink","whatsapp_nummer","heeft_extra_diensten","extra_diensten[].naam","extra_diensten[].kenteken","extra_diensten[].bedrag","extra_diensten[].notitie"]'
WHERE slug = 'booking_confirmed';
