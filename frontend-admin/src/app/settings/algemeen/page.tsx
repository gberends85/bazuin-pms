'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { toast, toastError } from '@/components/ui/Toast';
import Toaster from '@/components/ui/Toast';
import { api, getToken } from '@/lib/api';
import { PencilSquareIcon, ArrowPathIcon, MagnifyingGlassIcon, BoltIcon, ArrowPathRoundedSquareIcon, ClipboardDocumentIcon, CheckCircleIcon, TruckIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';

interface SettingField {
  key: string;
  label: string;
  description: string;
  type: 'number' | 'text' | 'euro';
  unit?: string;
}

const FIELDS: SettingField[] = [
  {
    key: 'modification_fee',
    label: 'Wijzigingstoeslag',
    description: 'Vaste toeslag per wijziging, ongeacht de prijsverandering. Bij restitutie wordt dit bedrag eerst afgetrokken.',
    type: 'euro',
    unit: '€',
  },
  {
    key: 'modification_min_days_before',
    label: 'Minimale wijzigingstermijn',
    description: 'Aantal dagen voor aankomst dat een klant nog zelf kan wijzigen (0 = altijd toegestaan). De admin kan altijd wijzigen.',
    type: 'number',
    unit: 'dagen',
  },
];

export default function AlgemeenSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Umbraco sync state
  const [umbStatus, setUmbStatus]   = useState<{ lastSyncId: string|null; lastSyncAt: string|null; hasToken: boolean; hasClientCreds?: boolean } | null>(null);
  const [umbResult, setUmbResult]   = useState<any>(null);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState(false);

  // Verificatiescan state
  const [verifyCopied, setVerifyCopied] = useState(false);
  const [generatingVerify, setGeneratingVerify] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  // EV-scan v1 state
  const [evCopied, setEvCopied] = useState(false);
  const [generatingEv, setGeneratingEv] = useState(false);
  const [evNoServiceCount, setEvNoServiceCount] = useState<number | null>(null);

  // EV-scan nieuwe boekingen state
  const [evNewCopied, setEvNewCopied] = useState(false);
  const [generatingEvNew, setGeneratingEvNew] = useState(false);
  const [evNewCount, setEvNewCount] = useState<number | null>(null);

  // EV-scan gecombineerd (alles) state
  const [evAllCopied, setEvAllCopied] = useState(false);
  const [generatingEvAll, setGeneratingEvAll] = useState(false);
  const [evAllCount, setEvAllCount] = useState<number | null>(null);

  // Herstelverificatie geannuleerd+betaald state
  const [restoreCopied, setRestoreCopied] = useState(false);
  const [generatingRestore, setGeneratingRestore] = useState(false);
  const [restoreCount, setRestoreCount] = useState<number | null>(null);
  const [restoreEntries, setRestoreEntries] = useState<Array<{ id: number; name: string; arrival: string; total: number }>>([]);

  // Gaten-scan state
  const [gapCopied, setGapCopied] = useState(false);
  const [generatingGap, setGeneratingGap] = useState(false);
  const [gapFromId, setGapFromId] = useState('24284');
  const [gapToId, setGapToId] = useState('24515');
  const [gapResult, setGapResult] = useState<{ count: number; present: number } | null>(null);

  // Voertuig-herstel-scan state
  const [vehicleScanRunning, setVehicleScanRunning] = useState(false);
  const [vehicleScanResult, setVehicleScanResult] = useState<{
    dryRun: boolean; scanned: number; flaggedCount: number; repairedCount: number;
    flagged: { reference: string; arrival: string; currentVehicles: number; detectedVehicles: number; toAdd: number; reason: string; totalPrice: number }[];
  } | null>(null);

  // Umbraco token opslaan state
  const [umbTokenInput, setUmbTokenInput] = useState('');
  const [umbTokenSaving, setUmbTokenSaving] = useState(false);
  const [umbTokenSaved, setUmbTokenSaved] = useState(false);

  // EV-prijs reparatiescan state
  const [evRepairCopied, setEvRepairCopied] = useState(false);
  const [generatingEvRepair, setGeneratingEvRepair] = useState(false);
  const [directSyncing, setDirectSyncing] = useState(false);
  const [directSyncResult, setDirectSyncResult] = useState<{ imported: number; cancelled: number; skipped: number; errors: number; errorIds: number[] } | null>(null);

  async function runDirectSync() {
    setDirectSyncing(true);
    setDirectSyncResult(null);
    try {
      const r = await api.umbraco.sync();
      setDirectSyncResult(r);
      const parts = [`${r.imported} nieuw`];
      if (r.cancelled) parts.push(`${r.cancelled} geannuleerd`);
      if (r.errors) parts.push(`${r.errors} fout`);
      toast(`Sync klaar: ${parts.join(', ')}`);
      refreshStatus();
    } catch (e: any) {
      toastError('Sync mislukt: ' + (e?.message || 'onbekende fout'));
    } finally {
      setDirectSyncing(false);
    }
  }

  useEffect(() => {
    api.settings.get()
      .then(data => { setValues(data); setOriginal(data); })
      .catch(e => toastError(e.message))
      .finally(() => setLoading(false));
    api.umbraco.status().then(setUmbStatus).catch(() => {});
  }, []);

  async function refreshStatus() {
    setRefreshing(true);
    setRefreshed(false);
    try {
      const s = await api.umbraco.status();
      setUmbStatus(s);
      setRefreshed(true);
      setTimeout(() => setRefreshed(false), 3000);
    } catch (e: any) {
      toastError('Vernieuwen mislukt: ' + (e.message || 'onbekende fout'));
    } finally {
      setRefreshing(false);
    }
  }

  async function generateAndCopyScript() {
    setGeneratingScript(true);
    try {
      // Gebruik lastSyncId (laatste gescande ID) als startpunt — valt terug op maxId als fallback
      const status = await api.umbraco.status();
      const lastSyncId = status?.lastSyncId ? parseInt(status.lastSyncId) : null;
      const { maxId } = await api.umbraco.maxId();
      // lastSyncId is het einde van de vorige scan (incl. lege IDs) — start dus 1 verder.
      // maxId is het hoogste ID in de DB — alleen als fallback als lastSyncId er niet is.
      const fromId = lastSyncId ? lastSyncId + 1 : maxId + 1;
      const adminToken = getToken() || '';
      // Resolve relative API URLs to absolute using the admin frontend's own origin,
      // because the script runs from the Umbraco tab (different domain).
      const rawBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
      const apiBase = rawBase.startsWith('/') ? window.location.origin + rawBase : rawBase;

      const script = `(async()=>{
/* ── Umbraco → Bazuin sync ── */
const ADMIN_TOKEN = ${JSON.stringify(adminToken)};
const API = ${JSON.stringify(apiBase)};
const FROM_ID = ${fromId};
const MAX_SCAN = 500;

// Diagnostiek
console.log('%c── Bazuin sync gestart ──', 'font-weight:bold;color:#0a7c6e');
console.log('API:', API);
console.log('Admin-token aanwezig:', !!ADMIN_TOKEN && ADMIN_TOKEN.length > 10);
console.log('Scannen vanaf ID:', FROM_ID);

if(!ADMIN_TOKEN || ADMIN_TOKEN.length < 10){
  console.error('❌ ADMIN_TOKEN ontbreekt of is ongeldig. Genereer het script opnieuw vanuit de admin (je moet ingelogd zijn).');
  return;
}

// 1. Ververs Umbraco-token
const raw=JSON.parse(localStorage.getItem('umb:userAuthTokenResponse')||'{}');
const rr=await fetch('/umbraco/management/api/v1/security/back-office/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(raw.refresh_token||'')+'&client_id=umbraco-back-office'});
const fr=await rr.json(); const tok=fr.access_token||raw.access_token;
if(!tok){console.error('❌ Geen Umbraco-token — ben je ingelogd in Umbraco?');return;}
console.log('✓ Umbraco-token vernieuwd');

// 1b. Token wordt meegestuurd bij de import-batch zodat de backend het kan opslaan

// 2. Scan nieuwe reserveringen
const records=[]; let empty=0;
for(let id=FROM_ID;id<=FROM_ID+MAX_SCAN&&empty<50;id++){
  const r=await fetch('/umbraco/management/api/v1/reservation/get?id='+id,{headers:{Authorization:'Bearer '+tok,Accept:'application/json'}});
  if(r.status===404){empty++;continue;}
  if(!r.ok){console.warn('  ID',id,'gaf HTTP',r.status,'— overgeslagen');continue;}
  const d=await r.json();
  if(!d?.reservationId){empty++;continue;}
  empty=0;
  if(d.ferryDepartureHour===0&&d.ferryDepartureMinutes===0&&!d.isPaid)continue;
  records.push({id:d.reservationId,name:d.customer?.name||d.customerName||'',email:d.customer?.emailAddress||'',phone:d.customer?.telephone||'',plate:d.licensePlate||'',arrival:d.startDate?.slice(0,10),departure:d.endDate?.slice(0,10),depH:d.ferryDepartureHour,depM:d.ferryDepartureMinutes,retH:d.ferryReturnHour,retM:d.ferryReturnMinutes,fast:d.isFastFerry||false,price:d.price||0,paid:d.isPaid||false,stripe:d.paymentIntentId||null,method:d.paymentMethod||null,note:(d.description||'').trim(),cancelled:d.reservationStatus===8||!!(d.cancelledAt||d.isDeleted),items:d.items||[]});
  console.log('  Gevonden:',d.reservationId,d.customerName||d.customer?.name||'—');
}
console.log('Totaal gevonden:', records.length, 'reserveringen');

// 3. Importeer naar Bazuin
if(records.length===0){console.log('Niets te importeren — alles al up-to-date.');return{imported:0,cancelled:0,skipped:0,errors:0};}
console.log('Importeren naar',API,'...');
let sr, result;
try {
  sr = await fetch(API+'/admin/umbraco/import-batch',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+ADMIN_TOKEN},body:JSON.stringify({records,umbracoToken:tok}),credentials:'include'});
} catch(netErr) {
  console.error('❌ NETWERKFOUT bij import-batch:', netErr.message);
  console.error('   Controleer of de backend bereikbaar is op:', API);
  return;
}
if(!sr.ok){
  const errText = await sr.text().catch(()=>'(geen body)');
  console.error('❌ Import mislukt — HTTP', sr.status, sr.statusText);
  console.error('   Response:', errText);
  if(sr.status===401) console.error('   → Admin-token verlopen. Genereer het script opnieuw vanuit de admin.');
  if(sr.status===403) console.error('   → Geen toegang. Ben je ingelogd als admin?');
  return;
}
try {
  result = await sr.json();
} catch(jsonErr) {
  console.error('❌ Kon response niet lezen als JSON:', jsonErr.message);
  return;
}
console.log('%c✅ SYNC KLAAR', 'font-weight:bold;color:#0a7c6e', result);
return result;
})()`;

      await navigator.clipboard.writeText(script);
      setScriptCopied(true);
      setTimeout(() => setScriptCopied(false), 4000);
      toast(`Script gekopieerd (scan vanaf ID ${fromId}${lastSyncId ? ' — op basis van laatste scan' : ' — op basis van max DB-id'})`);
    } catch (e: any) {
      toastError('Kon script niet genereren: ' + e.message);
    } finally {
      setGeneratingScript(false);
    }
  }

  async function generateAndCopyVerificationScript() {
    setGeneratingVerify(true);
    try {
      const { ids, count } = await api.umbraco.pendingIds();
      setPendingCount(count);
      if (count === 0) {
        toast('Geen openstaande boekingen om te verifiëren.');
        return;
      }
      const adminToken = getToken() || '';
      const rawBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
      const apiBase = rawBase.startsWith('/') ? window.location.origin + rawBase : rawBase;

      const script = `(async()=>{
/* ── Bazuin verificatiescan: controleert ${count} openstaande boekingen in Umbraco ── */
const ADMIN_TOKEN = ${JSON.stringify(adminToken)};
const API = ${JSON.stringify(apiBase)};
const PENDING_IDS = ${JSON.stringify(ids)};

console.log('%c── Bazuin verificatiescan gestart ──', 'font-weight:bold;color:#7c3a0a');
console.log('Controleren:', PENDING_IDS.length, 'openstaande boekingen');
console.log('API:', API);

if(!ADMIN_TOKEN || ADMIN_TOKEN.length < 10){
  console.error('❌ ADMIN_TOKEN ontbreekt. Genereer het script opnieuw vanuit de admin.');
  return;
}

// 1. Ververs Umbraco-token
const raw=JSON.parse(localStorage.getItem('umb:userAuthTokenResponse')||'{}');
const rr=await fetch('/umbraco/management/api/v1/security/back-office/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(raw.refresh_token||'')+'&client_id=umbraco-back-office'});
const fr=await rr.json(); const tok=fr.access_token||raw.access_token;
if(!tok){console.error('❌ Geen Umbraco-token — ben je ingelogd in Umbraco?');return;}
console.log('✓ Umbraco-token vernieuwd');

// 2. Controleer elk ID
const cancelled=[]; let checked=0, notFound=0;
for(const id of PENDING_IDS){
  const r=await fetch('/umbraco/management/api/v1/reservation/get?id='+id,{headers:{Authorization:'Bearer '+tok,Accept:'application/json'}});
  checked++;
  if(r.status===404){notFound++;continue;}
  if(!r.ok){console.warn('  ID',id,'HTTP',r.status,'— overgeslagen');continue;}
  const d=await r.json();
  if(!d?.reservationId){notFound++;continue;}
  const isCancelled=d.reservationStatus===8||!!(d.cancelledAt||d.isDeleted);
  if(isCancelled){
    cancelled.push({id,name:d.customer?.name||d.customerName||'',email:d.customer?.emailAddress||'',phone:d.customer?.telephone||'',plate:d.licensePlate||'',arrival:d.startDate?.slice(0,10),departure:d.endDate?.slice(0,10),depH:d.ferryDepartureHour,depM:d.ferryDepartureMinutes,retH:d.ferryReturnHour,retM:d.ferryReturnMinutes,fast:d.isFastFerry||false,price:d.price||0,paid:d.isPaid||false,stripe:d.paymentIntentId||null,method:d.paymentMethod||null,note:(d.description||'').trim(),cancelled:true});
    console.log('  ❌ GEANNULEERD:', id, d.customer?.name||d.customerName||'—');
  }
  if(checked%50===0) console.log('  Voortgang:', checked, '/', PENDING_IDS.length, '—', cancelled.length, 'geannuleerd gevonden');
}
console.log('Controleren klaar:', checked, 'gecontroleerd,', notFound, 'niet gevonden,', cancelled.length, 'geannuleerd');

// 3. Update gecancelde boekingen
if(cancelled.length===0){
  console.log('%c✅ Alles in orde — geen extra annuleringen gevonden.', 'font-weight:bold;color:#0a7c6e');
  return {checked, notFound, cancelled: 0};
}
console.log('Verwerken:', cancelled.length, 'annuleringen...');
let sr, result;
try {
  sr = await fetch(API+'/admin/umbraco/import-batch',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+ADMIN_TOKEN},body:JSON.stringify({records:cancelled}),credentials:'include'});
} catch(netErr) {
  console.error('❌ NETWERKFOUT:', netErr.message);
  return;
}
if(!sr.ok){
  const errText=await sr.text().catch(()=>'(geen body)');
  console.error('❌ Update mislukt — HTTP', sr.status, errText);
  return;
}
result=await sr.json();
console.log('%c✅ VERIFICATIE KLAAR', 'font-weight:bold;color:#0a7c6e', {checked, notFound, cancellationsFound: cancelled.length, ...result});
return result;
})()`;

      await navigator.clipboard.writeText(script);
      setVerifyCopied(true);
      setTimeout(() => setVerifyCopied(false), 4000);
      toast(`Verificatiescript gekopieerd (${count} boekingen te controleren)`);
    } catch (e: any) {
      toastError('Kon script niet genereren: ' + e.message);
    } finally {
      setGeneratingVerify(false);
    }
  }

  async function generateAndCopyEvScript() {
    setGeneratingEv(true);
    try {
      const { ids, count } = await api.umbraco.v1NoEvIds();
      setEvNoServiceCount(count);
      if (count === 0) {
        toast('Alle v1-imports zijn al gecontroleerd met kWh-detectie — niets meer te doen.');
        return;
      }
      const adminToken = getToken() || '';
      const rawBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
      const apiBase = rawBase.startsWith('/') ? window.location.origin + rawBase : rawBase;

      const script = `(async()=>{
/* ── Bazuin EV-scan v2: detecteert kWh + v1 vs nieuw (${count} records) ── */
const ADMIN_TOKEN = ${JSON.stringify(adminToken)};
const API = ${JSON.stringify(apiBase)};
const CHECK_IDS = ${JSON.stringify(ids)};

console.log('%c── Bazuin EV-laadscan v2 gestart ──', 'font-weight:bold;color:#1a5276');
console.log('Te controleren:', CHECK_IDS.length, 'reserveringen op laadwens + kWh');

if(!ADMIN_TOKEN || ADMIN_TOKEN.length < 10){
  console.error('❌ ADMIN_TOKEN ontbreekt. Genereer het script opnieuw vanuit de admin.');
  return;
}

// 1. Ververs Umbraco-token
const raw=JSON.parse(localStorage.getItem('umb:userAuthTokenResponse')||'{}');
const rr=await fetch('/umbraco/management/api/v1/security/back-office/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(raw.refresh_token||'')+'&client_id=umbraco-back-office'});
const fr=await rr.json(); const tok=fr.access_token||raw.access_token;
if(!tok){console.error('❌ Geen Umbraco-token — ben je ingelogd in Umbraco?');return;}
console.log('✓ Umbraco-token vernieuwd');

// 2. Helpers
function extractAllStrings(obj,out=[]){if(!obj)return out;if(typeof obj==='string'){out.push(obj);return out;}if(Array.isArray(obj)){obj.forEach(v=>extractAllStrings(v,out));return out;}if(typeof obj==='object'){Object.values(obj).forEach(v=>extractAllStrings(v,out));return out;}return out;}
function detectKwh(d){const s=extractAllStrings(d).join(' ');const m=s.match(/\\b(15|20|30|40|60)\\s*k[wW][hH]?\\b/);return m?parseInt(m[1]):null;}
function hasEvCharging(d){return /oplad|laten laden|wil laden|auto oplad|charging|laadkabel|kwh/i.test(extractAllStrings(d).join(' '));}
function isV1Import(d){return /imported from v1|original id:/i.test(extractAllStrings(d).join(' '));}

// 3. Controleer elk ID
const evRecords=[]; let checked=0, notFound=0, errors=0;
for(const id of CHECK_IDS){
  try{
    const r=await fetch('/umbraco/management/api/v1/reservation/get?id='+id,{headers:{Authorization:'Bearer '+tok,Accept:'application/json'}});
    checked++;
    if(r.status===404){notFound++;continue;}
    if(!r.ok){errors++;continue;}
    const d=await r.json();
    if(!d?.reservationId){notFound++;continue;}
    if(checked===1) console.log('  Umbraco velden:', Object.keys(d).join(', '));
    if(!hasEvCharging(d)) continue;
    const kwh=detectKwh(d);
    const v1=isV1Import(d);
    evRecords.push({umbId:id, kwh, includedInPrice:!v1});
    console.log('  ⚡',id,'| kWh:', kwh||'vol', '| v1:',v1);
    if(checked%50===0) console.log('  Voortgang:',checked,'/',CHECK_IDS.length,'— laadwens:',evRecords.length);
  }catch(e){errors++;}
}
console.log('Scan klaar:',checked,'gecontroleerd,',notFound,'niet gevonden,',evRecords.length,'willen laden');

if(evRecords.length===0){
  console.log('%c✅ Geen extra laadwensen gevonden.','font-weight:bold;color:#0a7c6e');
  return{checked,notFound,evFound:0};
}

// 4. Stuur naar backend
console.log('Verwerken:',evRecords.length,'laadwensen...');
let sr;
try{
  sr=await fetch(API+'/admin/umbraco/add-ev-service',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+ADMIN_TOKEN},body:JSON.stringify({records:evRecords}),credentials:'include'});
}catch(e){console.error('❌ Netwerkfout:',e.message);return;}
if(!sr.ok){const t=await sr.text().catch(()=>'');console.error('❌ HTTP',sr.status,t);return;}
const result=await sr.json();
console.log('%c✅ EV-SCAN KLAAR','font-weight:bold;color:#0a7c6e',{checked,notFound,evFound:evRecords.length,...result});
return result;
})()`;

      await navigator.clipboard.writeText(script);
      setEvCopied(true);
      setTimeout(() => setEvCopied(false), 4000);
      toast(`EV-script gekopieerd (${count} records te controleren)`);
    } catch (e: any) {
      toastError('Kon script niet genereren: ' + e.message);
    } finally {
      setGeneratingEv(false);
    }
  }

  async function generateAndCopyEvNewScript() {
    setGeneratingEvNew(true);
    try {
      const { ids, count } = await api.umbraco.newNoEvIds();
      setEvNewCount(count);
      if (count === 0) {
        toast('Alle nieuwe boekingen hebben al een correcte laaddienst.');
        return;
      }
      const adminToken = getToken() || '';
      const rawBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
      const apiBase = rawBase.startsWith('/') ? window.location.origin + rawBase : rawBase;

      const script = `(async()=>{
/* ── Bazuin EV-scan nieuwe boekingen (${count} records) ── */
/* includedInPrice=true: EV zit al in Umbraco-prijs, splits af van base_price */
const ADMIN_TOKEN = ${JSON.stringify(adminToken)};
const API = ${JSON.stringify(apiBase)};
const CHECK_IDS = ${JSON.stringify(ids)};

console.log('%c── Bazuin EV-scan nieuwe boekingen ──', 'font-weight:bold;color:#1a5276');
console.log('Te controleren:', CHECK_IDS.length, 'boekingen op laadwens + kWh');

if(!ADMIN_TOKEN || ADMIN_TOKEN.length < 10){
  console.error('❌ ADMIN_TOKEN ontbreekt. Genereer het script opnieuw.');
  return;
}

const raw=JSON.parse(localStorage.getItem('umb:userAuthTokenResponse')||'{}');
const rr=await fetch('/umbraco/management/api/v1/security/back-office/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(raw.refresh_token||'')+'&client_id=umbraco-back-office'});
const fr=await rr.json(); const tok=fr.access_token||raw.access_token;
if(!tok){console.error('❌ Geen Umbraco-token — ben je ingelogd in Umbraco?');return;}
console.log('✓ Umbraco-token vernieuwd');

function extractAllStrings(obj,out=[]){if(!obj)return out;if(typeof obj==='string'){out.push(obj);return out;}if(Array.isArray(obj)){obj.forEach(v=>extractAllStrings(v,out));return out;}if(typeof obj==='object'){Object.values(obj).forEach(v=>extractAllStrings(v,out));return out;}return out;}
function detectKwh(d){const s=extractAllStrings(d).join(' ');const m=s.match(/\\b(15|20|30|40|60)\\s*k[wW][hH]?\\b/);return m?parseInt(m[1]):null;}
function hasEvCharging(d){return /oplad|laten laden|wil laden|auto oplad|charging|laadkabel|kwh/i.test(extractAllStrings(d).join(' '));}

const evRecords=[]; let checked=0, notFound=0, errors=0;
for(const id of CHECK_IDS){
  try{
    const r=await fetch('/umbraco/management/api/v1/reservation/get?id='+id,{headers:{Authorization:'Bearer '+tok,Accept:'application/json'}});
    checked++;
    if(r.status===404){notFound++;continue;}
    if(!r.ok){errors++;continue;}
    const d=await r.json();
    if(!d?.reservationId){notFound++;continue;}
    if(!hasEvCharging(d)) continue;
    const kwh=detectKwh(d);
    evRecords.push({umbId:id, kwh, includedInPrice:true});
    console.log('  ⚡',id,'| kWh:', kwh||'vol', '| (in prijs inbegrepen)');
    if(checked%50===0) console.log('  Voortgang:',checked,'/',CHECK_IDS.length,'— laadwens:',evRecords.length);
  }catch(e){errors++;}
}
console.log('Scan klaar:',checked,'gecontroleerd,',notFound,'niet gevonden,',evRecords.length,'willen laden');

if(evRecords.length===0){
  console.log('%c✅ Geen laadwensen gevonden.','font-weight:bold;color:#0a7c6e');
  return{checked,notFound,evFound:0};
}

console.log('Verwerken:',evRecords.length,'laadwensen...');
let sr;
try{
  sr=await fetch(API+'/admin/umbraco/add-ev-service',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+ADMIN_TOKEN},body:JSON.stringify({records:evRecords}),credentials:'include'});
}catch(e){console.error('❌ Netwerkfout:',e.message);return;}
if(!sr.ok){const t=await sr.text().catch(()=>'');console.error('❌ HTTP',sr.status,t);return;}
const result=await sr.json();
console.log('%c✅ EV-SCAN KLAAR','font-weight:bold;color:#0a7c6e',{checked,notFound,evFound:evRecords.length,...result});
return result;
})()`;

      await navigator.clipboard.writeText(script);
      setEvNewCopied(true);
      setTimeout(() => setEvNewCopied(false), 4000);
      toast(`EV-script nieuwe boekingen gekopieerd (${count} records)`);
    } catch (e: any) {
      toastError('Kon script niet genereren: ' + e.message);
    } finally {
      setGeneratingEvNew(false);
    }
  }

  async function generateAndCopyRestoreScript() {
    setGeneratingRestore(true);
    try {
      const { entries, count } = await api.umbraco.cancelledPaidIds();
      setRestoreCount(count);
      setRestoreEntries(entries);
      if (count === 0) {
        toast('Geen geannuleerde boekingen met openstaande betaling gevonden.');
        return;
      }
      const adminToken = getToken() || '';
      const rawBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
      const apiBase = rawBase.startsWith('/') ? window.location.origin + rawBase : rawBase;

      const script = `(async()=>{
/* ── Bazuin herstelverificatie: geannuleerd maar betaald (${count} records) ── */
const ADMIN_TOKEN = ${JSON.stringify(adminToken)};
const API = ${JSON.stringify(apiBase)};
const ENTRIES = ${JSON.stringify(entries)};

console.log('%c── Bazuin herstelverificatie gestart ──', 'font-weight:bold;color:#7c3c00');
console.log('Te controleren:', ENTRIES.length, 'geannuleerde boekingen met betaling');
console.table(ENTRIES.map(e=>({id:e.id, naam:e.name, aankomst:e.arrival, bedrag:'€'+e.total})));

if(!ADMIN_TOKEN || ADMIN_TOKEN.length < 10){console.error('❌ ADMIN_TOKEN ontbreekt.');return;}

const raw=JSON.parse(localStorage.getItem('umb:userAuthTokenResponse')||'{}');
const rr=await fetch('/umbraco/management/api/v1/security/back-office/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(raw.refresh_token||'')+'&client_id=umbraco-back-office'});
const fr=await rr.json(); const tok=fr.access_token||raw.access_token;
if(!tok){console.error('❌ Geen Umbraco-token.');return;}
console.log('✓ Token vernieuwd');

const toReactivate=[]; let checked=0, notFound=0, errors=0;
for(const entry of ENTRIES){
  try{
    const r=await fetch('/umbraco/management/api/v1/reservation/get?id='+entry.id,{headers:{Authorization:'Bearer '+tok,Accept:'application/json'}});
    checked++;
    if(r.status===404){console.log('  ❓',entry.id,entry.name,'— niet gevonden in Umbraco');notFound++;continue;}
    if(!r.ok){errors++;continue;}
    const d=await r.json();
    // Controleer of status in Umbraco NIET geannuleerd is
    const umbStatus = String(d.status||d.reservationStatus||'').toLowerCase();
    const isCancelled = /cancel|annul|geannul/.test(umbStatus);
    if(!isCancelled){
      console.log('  ✅',entry.id,entry.name,'→ ACTIEF in Umbraco — heractiveren!');
      toReactivate.push(entry.id);
    } else {
      console.log('  ❌',entry.id,entry.name,'→ nog steeds geannuleerd in Umbraco (status:',umbStatus,')');
    }
  }catch(e){errors++;console.error('  Fout bij',entry.id,e.message);}
}
console.log('Scan klaar:',checked,'gecontroleerd,',toReactivate.length,'te heractiveren');

if(toReactivate.length===0){
  console.log('%cGeen te heractiveren boekingen gevonden.','color:#999');
  return;
}

// Heractiveer in het nieuwe systeem
let reactivated=0;
for(const umbId of toReactivate){
  try{
    const sr=await fetch(API+'/admin/umbraco/reactivate',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+ADMIN_TOKEN},body:JSON.stringify({umbId}),credentials:'include'});
    if(sr.ok){reactivated++;console.log('  ✅ Hersteld: DB-2026-U'+umbId);}
    else{const t=await sr.text().catch(()=>'');console.error('  ❌ Fout bij heractiveren',umbId,t);}
  }catch(e){console.error('  ❌ Netwerkfout:',e.message);}
}
console.log('%c✅ HERSTEL KLAAR','font-weight:bold;color:#0a7c6e',{checked,toReactivate:toReactivate.length,reactivated});
return{checked,toReactivate:toReactivate.length,reactivated};
})()`;

      await navigator.clipboard.writeText(script);
      setRestoreCopied(true);
      setTimeout(() => setRestoreCopied(false), 4000);
      toast(`Herstelscript gekopieerd (${count} te controleren boekingen)`);
    } catch (e: any) {
      toastError('Kon script niet genereren: ' + e.message);
    } finally {
      setGeneratingRestore(false);
    }
  }

  async function generateAndCopyEvAllScript() {
    setGeneratingEvAll(true);
    try {
      const { entries, count } = await api.umbraco.allEvIds();
      setEvAllCount(count);
      if (count === 0) {
        toast('Alle boekingen hebben al een correcte laaddienst met kWh.');
        return;
      }
      const adminToken = getToken() || '';
      const rawBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
      const apiBase = rawBase.startsWith('/') ? window.location.origin + rawBase : rawBase;

      const script = `(async()=>{
/* ── Bazuin EV-totaalscan: v1 + nieuw (${count} records) ── */
const ADMIN_TOKEN = ${JSON.stringify(adminToken)};
const API = ${JSON.stringify(apiBase)};
const ENTRIES = ${JSON.stringify(entries)};

console.log('%c── Bazuin EV-totaalscan gestart ──', 'font-weight:bold;color:#1a5276');
console.log('Te controleren:', ENTRIES.length, 'boekingen (v1 + nieuw)');

if(!ADMIN_TOKEN || ADMIN_TOKEN.length < 10){console.error('❌ ADMIN_TOKEN ontbreekt. Genereer het script opnieuw.');return;}

const raw=JSON.parse(localStorage.getItem('umb:userAuthTokenResponse')||'{}');
const rr=await fetch('/umbraco/management/api/v1/security/back-office/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(raw.refresh_token||'')+'&client_id=umbraco-back-office'});
const fr=await rr.json(); const tok=fr.access_token||raw.access_token;
if(!tok){console.error('❌ Geen Umbraco-token — ben je ingelogd in Umbraco?');return;}
console.log('✓ Umbraco-token vernieuwd');

function extractAllStrings(obj,out=[]){if(!obj)return out;if(typeof obj==='string'){out.push(obj);return out;}if(Array.isArray(obj)){obj.forEach(v=>extractAllStrings(v,out));return out;}if(typeof obj==='object'){Object.values(obj).forEach(v=>extractAllStrings(v,out));return out;}return out;}
function detectKwh(d){const s=extractAllStrings(d).join(' ');const m=s.match(/\\b(15|20|30|40|60)\\s*k[wW][hH]?\\b/);return m?parseInt(m[1]):null;}
function hasEvCharging(d){return /oplad|laten laden|wil laden|auto oplad|charging|laadkabel|kwh/i.test(extractAllStrings(d).join(' '));}

const evRecords=[]; let checked=0, notFound=0, errors=0;
for(const entry of ENTRIES){
  const {id, isV1} = entry;
  try{
    const r=await fetch('/umbraco/management/api/v1/reservation/get?id='+id,{headers:{Authorization:'Bearer '+tok,Accept:'application/json'}});
    checked++;
    if(r.status===404){notFound++;continue;}
    if(!r.ok){errors++;continue;}
    const d=await r.json();
    if(!d?.reservationId){notFound++;continue;}
    if(!hasEvCharging(d)) continue;
    const kwh=detectKwh(d);
    // v1-imports: EV was apart geprijsd → voeg toe (includedInPrice=false)
    // Nieuwe boekingen: EV zit in Umbraco-prijs → splits af (includedInPrice=true)
    evRecords.push({umbId:id, kwh, includedInPrice:!isV1});
    console.log('  ⚡',id,'|',isV1?'v1':'nieuw','| kWh:', kwh||'vol');
    if(checked%50===0) console.log('  Voortgang:',checked,'/',ENTRIES.length,'— laadwens:',evRecords.length);
  }catch(e){errors++;}
}
console.log('Scan klaar:',checked,'gecontroleerd,',notFound,'niet gevonden,',errors,'fouten,',evRecords.length,'willen laden');

if(evRecords.length===0){console.log('%c✅ Geen openstaande laadwensen.','font-weight:bold;color:#0a7c6e');return;}

console.log('Verwerken:',evRecords.length,'laadwensen...');
let sr;
try{sr=await fetch(API+'/admin/umbraco/add-ev-service',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+ADMIN_TOKEN},body:JSON.stringify({records:evRecords}),credentials:'include'});}
catch(e){console.error('❌ Netwerkfout:',e.message);return;}
if(!sr.ok){const t=await sr.text().catch(()=>'');console.error('❌ HTTP',sr.status,t);return;}
const result=await sr.json();
console.log('%c✅ EV-TOTAALSCAN KLAAR','font-weight:bold;color:#0a7c6e',{checked,notFound,errors,evFound:evRecords.length,...result});
return result;
})()`;

      await navigator.clipboard.writeText(script);
      setEvAllCopied(true);
      setTimeout(() => setEvAllCopied(false), 4000);
      toast(`EV-totaalscan gekopieerd (${count} records — v1 + nieuw)`);
    } catch (e: any) {
      toastError('Kon script niet genereren: ' + e.message);
    } finally {
      setGeneratingEvAll(false);
    }
  }

  async function runVehicleRepairScan(dryRun: boolean) {
    setVehicleScanRunning(true);
    setVehicleScanResult(null);
    try {
      const result = await api.umbraco.vehicleRepairScan(dryRun);
      setVehicleScanResult(result);
      if (!dryRun && result.repairedCount > 0)
        toast(`${result.repairedCount} reserveringen gerepareerd.`);
      else if (result.flaggedCount === 0)
        toast('Geen ontbrekende voertuigen gevonden.');
    } catch (e: any) {
      toastError(e.message);
    } finally {
      setVehicleScanRunning(false);
    }
  }

  async function saveUmbToken() {
    if (!umbTokenInput.trim()) return;
    setUmbTokenSaving(true);
    try {
      await api.umbraco.saveToken(umbTokenInput.trim());
      setUmbTokenSaved(true);
      setUmbTokenInput('');
      setUmbStatus(s => s ? { ...s, hasToken: true } : s);
      setTimeout(() => setUmbTokenSaved(false), 3000);
    } catch (e: any) {
      toastError(e.message);
    } finally {
      setUmbTokenSaving(false);
    }
  }

  async function generateAndCopyEvRepairScript() {
    setGeneratingEvRepair(true);
    try {
      const adminToken = getToken() || '';
      const rawBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
      const apiBase = rawBase.startsWith('/') ? window.location.origin + rawBase : rawBase;

      const script = `(async()=>{
/* ── Bazuin EV-prijs reparatiescan ── */
const ADMIN_TOKEN=${JSON.stringify(adminToken)};
const API=${JSON.stringify(apiBase)};

const TYPEID_KWH={1030:10,1031:20,1032:30,1033:40,1034:60};
function detectEv(items,note,services){
  // 1. typeId — meest betrouwbaar
  const byType=items.find(i=>TYPEID_KWH[i.typeId]!=null);
  if(byType){
    const kwh=TYPEID_KWH[byType.typeId];
    const svc=services.find(s=>s.kwh===kwh);
    const umbPrice=byType.price!=null?parseFloat(byType.price):0;
    const price=umbPrice>0?umbPrice:(svc?svc.price:0);
    return{svcId:svc?svc.id:null,kwh,price,umbItem:byType};
  }
  // 2. Fallback: naam parsen
  const it=items.find(i=>i.reservationItemType===2&&/laden|opladen|k[whu]/i.test(i.name||i.Name||''))
    ??items.find(i=>/laden|opladen|\\d+\\s*k[whu]/i.test(i.name||i.Name||''));
  if(!it&&!/oplad|laten laden|wil laden|charging|k[whu]/i.test(note||''))return null;
  const txt=it?(it.name||it.Name||''):note||'';
  const m=txt.match(/(\\d+)\\s*k[whu]/i);
  const kwh=m?parseInt(m[1]):null;
  const svc=kwh?services.find(s=>s.kwh===kwh):null;
  const umbPrice=it?parseFloat(it.price||0):0;
  const price=umbPrice>0?umbPrice:(svc?svc.price:0);
  return{svcId:svc?svc.id:null,kwh,price,umbItem:it};
}

console.log('%c── Bazuin EV-prijs reparatiescan ──','font-weight:bold;color:#0a7c6e');

// 1. Haal kandidaten + services op
const cr=await fetch(API+'/admin/umbraco/ev-repair-candidates',{headers:{Authorization:'Bearer '+ADMIN_TOKEN}});
if(!cr.ok){console.error('❌ Kon kandidaten niet ophalen:',cr.status);return;}
const{candidates,services}=await cr.json();
console.log(candidates.length,'EV-reserveringen te controleren, services:',services.map(s=>s.kwh+'kWh').join(', '));

// 2. Ververs Umbraco-token
const raw=JSON.parse(localStorage.getItem('umb:userAuthTokenResponse')||'{}');
const tr=await fetch('/umbraco/management/api/v1/security/back-office/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(raw.refresh_token||'')+'&client_id=umbraco-back-office'});
const tf=await tr.json();const tok=tf.access_token||raw.access_token;
if(!tok){console.error('❌ Geen Umbraco-token');return;}
console.log('✓ Umbraco-token vernieuwd');

// 3. Controleer elk record — log ruwe items voor 23383 en records met kwh=null
const fixes=[];let errors=0;
for(const c of candidates){
  const r=await fetch('/umbraco/management/api/v1/reservation/get?id='+c.umbId,{headers:{Authorization:'Bearer '+tok,Accept:'application/json'}});
  if(!r.ok){errors++;continue;}
  const d=await r.json();
  if(!d?.reservationId)continue;
  // Diagnostiek: log ruwe items voor specifiek record of als kwh ontbreekt
  if(c.umbId===23383||(c.currentKwh===null&&c.currentPrice===0)){
    console.log('  [DIAG]',c.reference,'items:',JSON.stringify(d.items||[]),'desc:',d.description||'');
  }
  const ev=detectEv(d.items||[],d.description||'',services);
  if(!ev){
    console.warn('  [ONDETECTEERBAAR]',c.reference,'items:',JSON.stringify((d.items||[]).map(i=>({name:i.name||i.Name,type:i.reservationItemType,qty:i.quantity,price:i.price}))));
    continue;
  }
  if(!ev.svcId){
    console.warn('  [GEEN SERVICE]',c.reference,'kwh:',ev.kwh,'— geen overeenkomende service in DB');
    continue;
  }
  if(ev.kwh===null||ev.price===0){
    console.warn('  [ONVOLLEDIG]',c.reference,'kwh:',ev.kwh,'price:',ev.price,'item:',JSON.stringify(ev.umbItem));
  }
  const kwhOk=c.currentKwh===ev.kwh;
  const priceOk=Math.abs((c.currentPrice||0)-ev.price)<0.01;
  const svcOk=c.currentSvcId===ev.svcId;
  if(kwhOk&&priceOk&&svcOk)continue;
  console.log('  Fix:',c.reference,'kWh:',c.currentKwh,'→',ev.kwh,'prijs:',c.currentPrice,'→',ev.price);
  fixes.push({vehicleId:c.vehicleId,reservationId:c.reservationId,kwh:ev.kwh,price:ev.price,svcId:ev.svcId,totalPrice:c.totalPrice,reference:c.reference});
}
console.log(fixes.length,'te repareren,',errors,'fouten');
if(fixes.length===0){console.log('✅ Alles al correct!');return;}

// 4. Stuur fixes naar backend
const ar=await fetch(API+'/admin/umbraco/ev-repair-apply',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+ADMIN_TOKEN},body:JSON.stringify({fixes})});
const res=await ar.json();
console.log('%c✅ REPAIR KLAAR','font-weight:bold;color:#0a7c6e',res);
})()`;

      await navigator.clipboard.writeText(script);
      setEvRepairCopied(true);
      setTimeout(() => setEvRepairCopied(false), 4000);
      toast('EV-repair script gekopieerd');
    } catch (e: any) {
      toastError('Kon script niet genereren: ' + e.message);
    } finally {
      setGeneratingEvRepair(false);
    }
  }

  async function generateAndCopyGapScript() {
    setGeneratingGap(true);
    try {
      const from = parseInt(gapFromId) || 24000;
      const to   = parseInt(gapToId)   || 25000;
      const { ids, count, present } = await api.umbraco.gapIds(from, to);
      setGapResult({ count, present });
      if (count === 0) {
        toast(`Geen gaten gevonden in bereik ${from}–${to} (${present} al aanwezig) ✓`);
        return;
      }
      const adminToken = getToken() || '';
      const rawBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
      const apiBase = rawBase.startsWith('/') ? window.location.origin + rawBase : rawBase;

      const script = `(async()=>{
/* ── Bazuin gaten-import: ${count} ontbrekende IDs in bereik ${from}–${to} ── */
const ADMIN_TOKEN = ${JSON.stringify(adminToken)};
const API = ${JSON.stringify(apiBase)};
const MISSING_IDS = ${JSON.stringify(ids)};

console.log('%c── Bazuin gaten-import gestart ──', 'font-weight:bold;color:#7c0a7c');
console.log('Ontbrekende IDs te controleren:', MISSING_IDS.length, '(bereik ${from}–${to})');

if(!ADMIN_TOKEN || ADMIN_TOKEN.length < 10){
  console.error('❌ ADMIN_TOKEN ontbreekt. Genereer het script opnieuw vanuit de admin.');
  return;
}

// 1. Ververs Umbraco-token
const raw=JSON.parse(localStorage.getItem('umb:userAuthTokenResponse')||'{}');
const rr=await fetch('/umbraco/management/api/v1/security/back-office/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(raw.refresh_token||'')+'&client_id=umbraco-back-office'});
const fr=await rr.json(); const tok=fr.access_token||raw.access_token;
if(!tok){console.error('❌ Geen Umbraco-token — ben je ingelogd in Umbraco?');return;}
console.log('✓ Umbraco-token vernieuwd');

// 2. Controleer elk ontbrekend ID
const toImport=[]; let checked=0, notFound=0, errors=0;
for(const id of MISSING_IDS){
  try{
    const r=await fetch('/umbraco/management/api/v1/reservation/get?id='+id,{headers:{Authorization:'Bearer '+tok,Accept:'application/json'}});
    checked++;
    if(r.status===404){notFound++;continue;}
    if(!r.ok){console.warn('  ID',id,'HTTP',r.status,'— overgeslagen');errors++;continue;}
    const d=await r.json();
    if(!d?.reservationId){notFound++;continue;}
    const isCancelled=d.reservationStatus===8||!!(d.cancelledAt||d.isDeleted);
    const isGhost=(d.ferryDepartureHour===0&&d.ferryDepartureMinutes===0&&!d.isPaid);
    if(isGhost){console.log('  👻',id,'— ghost (dep 00:00 + onbetaald) — overgeslagen');continue;}
    toImport.push({id:d.reservationId,name:d.customer?.name||d.customerName||'',email:d.customer?.emailAddress||'',phone:d.customer?.telephone||'',plate:d.licensePlate||'',arrival:d.startDate?.slice(0,10),departure:d.endDate?.slice(0,10),depH:d.ferryDepartureHour,depM:d.ferryDepartureMinutes,retH:d.ferryReturnHour,retM:d.ferryReturnMinutes,fast:d.isFastFerry||false,price:d.price||0,paid:d.isPaid||false,stripe:d.paymentIntentId||null,method:d.paymentMethod||null,note:(d.description||'').trim(),cancelled:isCancelled});
    console.log(isCancelled?'  ❌':'  ✅',id,d.customer?.name||d.customerName||'—',isCancelled?'(geannuleerd)':'');
    if(checked%25===0) console.log('  Voortgang:',checked,'/',MISSING_IDS.length,'— te importeren:',toImport.length);
  }catch(e){errors++;console.error('  Fout bij',id,e?.message||e);}
}
console.log('Scan klaar:',checked,'gecontroleerd,',notFound,'niet in Umbraco,',toImport.length,'te importeren');

if(toImport.length===0){
  console.log('%c✅ Niets te importeren — alle gaten zijn geen reserveringen.','font-weight:bold;color:#0a7c6e');
  return{checked,notFound,imported:0};
}

// 3. Importeer naar Bazuin
console.log('Importeren',toImport.length,'records naar',API,'...');
let sr, result;
try{
  sr=await fetch(API+'/admin/umbraco/import-batch',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+ADMIN_TOKEN},body:JSON.stringify({records:toImport}),credentials:'include'});
}catch(netErr){console.error('❌ Netwerkfout:',netErr.message);return;}
if(!sr.ok){const t=await sr.text().catch(()=>'');console.error('❌ HTTP',sr.status,t);return;}
result=await sr.json();
console.log('%c✅ GATEN-IMPORT KLAAR','font-weight:bold;color:#7c0a7c',{checked,notFound,toImport:toImport.length,...result});
return result;
})()`;

      await navigator.clipboard.writeText(script);
      setGapCopied(true);
      setTimeout(() => setGapCopied(false), 4000);
      toast(`Gaten-script gekopieerd (${count} ontbrekende IDs te controleren)`);
    } catch (e: any) {
      toastError('Kon script niet genereren: ' + e.message);
    } finally {
      setGeneratingGap(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const changed = FIELDS.filter(f => values[f.key] !== original[f.key]);
      await Promise.all(changed.map(f => api.settings.set(f.key, values[f.key] ?? '')));
      setOriginal({ ...values });
      toast('Instellingen opgeslagen ✓');
    } catch (e: any) { toastError(e.message); }
    finally { setSaving(false); }
  }

  const hasChanges = FIELDS.some(f => values[f.key] !== original[f.key]);

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#0a2240', display: 'block', marginBottom: 4 };
  const desc: React.CSSProperties = { fontSize: 12, color: '#7090b0', marginBottom: 10, lineHeight: 1.5 };
  const inp: React.CSSProperties = { border: '0.5px solid rgba(10,34,64,0.2)', borderRadius: 8, padding: '9px 12px', fontSize: 15, fontWeight: 700, color: '#0a2240', outline: 'none', width: 140 };

  return (
    <AdminLayout>
      <Toaster />
      <div style={{ padding: '28px 32px', maxWidth: 700 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, color: '#0a2240' }}>Algemene instellingen</h1>
        <p style={{ margin: '0 0 28px', fontSize: 13, color: '#7090b0' }}>Wijzigingsbeleid en overige systeeminstellingen.</p>

        {loading ? (
          <div style={{ color: '#7090b0', fontSize: 14 }}>Laden...</div>
        ) : (
          <>
            {/* Wijzigingsbeleid */}
            <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 12, padding: '24px 28px', marginBottom: 20 }}>
              <h2 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 800, color: '#0a2240', display:'flex', alignItems:'center', gap:6 }}><PencilSquareIcon className="w-4 h-4" />Wijzigingsbeleid</h2>

              {FIELDS.map(f => (
                <div key={f.key} style={{ marginBottom: 22, paddingBottom: 22, borderBottom: '0.5px solid rgba(10,34,64,0.06)' }}>
                  <label style={lbl}>{f.label}</label>
                  <p style={desc}>{f.description}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {f.unit === '€' && <span style={{ fontSize: 16, fontWeight: 700, color: '#0a2240' }}>€</span>}
                    <input
                      type={f.type === 'text' ? 'text' : 'number'}
                      min={0}
                      step={f.type === 'euro' ? '0.01' : '1'}
                      value={values[f.key] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                      style={inp}
                    />
                    {f.unit && f.unit !== '€' && <span style={{ fontSize: 13, color: '#7090b0' }}>{f.unit}</span>}
                  </div>
                </div>
              ))}

              {/* Info box */}
              <div style={{ background: '#f4f6f9', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#7090b0', lineHeight: 1.6 }}>
                <strong style={{ color: '#0a2240' }}>Annuleringsbeleid bij wijzigingen:</strong><br />
                Wanneer een klant een reservering wijzigt naar een later tijdstip en vervolgens annuleert,
                geldt altijd het annuleringsbeleid van de <em>originele</em> aankomstdatum.
                Dit voorkomt dat klanten een gunstiger annuleringsregeling krijgen door eerst te verplaatsen.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={save}
                disabled={saving || !hasChanges}
                className="btn btn-primary"
                style={{ opacity: !hasChanges ? 0.5 : 1 }}
              >
                {saving ? 'Opslaan...' : 'Wijzigingen opslaan'}
              </button>
            </div>

            {/* ── Umbraco sync ───────────────────────────────────── */}
            <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 12, padding: '24px 28px', marginTop: 20 }}>
              <h2 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800, color: '#0a2240', display:'flex', alignItems:'center', gap:6 }}><ArrowPathIcon className="w-4 h-4" />Umbraco synchronisatie</h2>
              <p style={{ margin: '0 0 20px', fontSize: 12, color: '#7090b0', lineHeight: 1.6 }}>
                Importeert nieuwe reserveringen en annuleringen vanuit het Umbraco CMS.
                Gebruik <strong>Synchroniseer nu</strong> hieronder — de server doet dit zelf, automatisch.
                De script-/token-methodes daaronder zijn alleen nog nodig als terugval.
              </p>

              {/* Status blok */}
              <div style={{ background: '#f4f6f9', borderRadius: 10, padding: '14px 18px', marginBottom: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 13 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ab0c8', textTransform: 'uppercase', marginBottom: 3 }}>Laatste sync</div>
                    {umbStatus?.lastSyncAt
                      ? <strong style={{ color: '#0a2240' }}>{new Date(umbStatus.lastSyncAt).toLocaleString('nl-NL')}</strong>
                      : <span style={{ color: '#b0c4d8' }}>Nog niet gesynchroniseerd</span>}
                  </div>
                  {umbStatus?.lastSyncId && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#9ab0c8', textTransform: 'uppercase', marginBottom: 3 }}>Tot en met ID</div>
                      <strong style={{ color: '#0a2240' }}>{umbStatus.lastSyncId}</strong>
                    </div>
                  )}
                </div>
                <button
                  onClick={refreshStatus}
                  disabled={refreshing}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 7,
                    border: '0.5px solid rgba(10,34,64,0.2)', background: 'white',
                    color: refreshed ? '#0a7c6e' : '#0a2240',
                    cursor: refreshing ? 'not-allowed' : 'pointer',
                    opacity: refreshing ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {refreshing ? <><ArrowPathIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Laden...</> : refreshed ? <><CheckCircleIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Bijgewerkt</> : <><ArrowPathIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Status vernieuwen</>}
                </button>
              </div>

              {/* ── Directe sync (nieuw: volledig automatisch, geen script meer nodig) ── */}
              <div style={{ background: '#f0faf8', border: '1px solid #a7f3d0', borderRadius: 10, padding: '18px 20px', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#065f46', marginBottom: 3 }}>
                      {umbStatus?.hasClientCreds ? '✓ Automatische synchronisatie actief' : 'Directe synchronisatie'}
                    </div>
                    <div style={{ fontSize: 12, color: '#4b8a73', lineHeight: 1.5 }}>
                      {umbStatus?.hasClientCreds
                        ? 'De server haalt zelf nieuwe reserveringen op uit Umbraco — geen script of token meer nodig. Klik om nu te synchroniseren.'
                        : 'Synchroniseer rechtstreeks vanaf de server. Stel hieronder client-credentials in voor volledig automatische werking.'}
                    </div>
                  </div>
                  <button
                    onClick={runDirectSync}
                    disabled={directSyncing}
                    style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: directSyncing ? '#9bb0c8' : '#0a7c6e', color: 'white', fontWeight: 800, fontSize: 14, cursor: directSyncing ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}
                  >
                    <ArrowPathIcon className="w-4 h-4" />
                    {directSyncing ? 'Synchroniseren…' : 'Synchroniseer nu'}
                  </button>
                </div>
                {directSyncResult && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #c8ecdd', fontSize: 13, color: '#0a2240' }}>
                    <strong>{directSyncResult.imported}</strong> nieuw geïmporteerd
                    {directSyncResult.cancelled > 0 && <> · <strong>{directSyncResult.cancelled}</strong> geannuleerd</>}
                    {' · '}<span style={{ color: '#7090b0' }}>{directSyncResult.skipped} overgeslagen</span>
                    {directSyncResult.errors > 0 && (
                      <div style={{ marginTop: 8, color: '#8a2020', background: '#fdeaea', borderRadius: 6, padding: '8px 12px' }}>
                        <strong>{directSyncResult.errors}</strong> niet verwerkt
                        {directSyncResult.errorIds?.length > 0 && <> — ID's: {directSyncResult.errorIds.slice(0, 30).join(', ')}</>}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Token opslaan (oude methode — alleen nog nodig zonder client-credentials) */}
              <div style={{ background: umbStatus?.hasToken ? '#f0faf8' : '#fff8e6', border: `1px solid ${umbStatus?.hasToken ? '#a7f3d0' : '#f0c060'}`, borderRadius: 10, padding: '14px 18px', marginBottom: 20, display: umbStatus?.hasClientCreds ? 'none' : 'block' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: umbStatus?.hasToken ? '#065f46' : '#7a5a00', marginBottom: umbStatus?.hasToken ? 0 : 10 }}>
                  {umbStatus?.hasToken ? '✓ Umbraco-token opgeslagen' : '⚠ Geen Umbraco-token — vul het hieronder in'}
                </div>
                {!umbStatus?.hasToken && (
                  <div style={{ fontSize: 12, color: '#7a5a00', marginBottom: 10 }}>
                    Open het Umbraco-tabblad → F12 → Console → plak: <code style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: 3, fontSize: 11 }}>JSON.parse(localStorage.getItem('umb:userAuthTokenResponse'))?.access_token</code>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="password"
                    value={umbTokenInput}
                    onChange={e => setUmbTokenInput(e.target.value)}
                    placeholder={umbStatus?.hasToken ? 'Nieuw token plakken om te vervangen…' : 'Plak hier uw Umbraco access_token…'}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: 12, fontFamily: 'monospace' }}
                    onKeyDown={e => e.key === 'Enter' && saveUmbToken()}
                  />
                  <button
                    onClick={saveUmbToken}
                    disabled={umbTokenSaving || !umbTokenInput.trim()}
                    style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: umbTokenSaved ? '#0a7c6e' : '#0a2240', color: 'white', fontWeight: 700, fontSize: 13, cursor: (umbTokenSaving || !umbTokenInput.trim()) ? 'not-allowed' : 'pointer', opacity: (umbTokenSaving || !umbTokenInput.trim()) ? 0.6 : 1, whiteSpace: 'nowrap' }}
                  >
                    {umbTokenSaved ? '✓ Opgeslagen' : umbTokenSaving ? 'Bezig…' : 'Opslaan'}
                  </button>
                </div>
              </div>

              {/* Stap-voor-stap instructies */}
              <div style={{ background: '#f8fafc', border: '0.5px solid rgba(10,34,64,0.1)', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#0a2240', marginBottom: 12 }}>Hoe werkt het?</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { n: 1, icon: <ClipboardDocumentIcon className="w-4 h-4" />, text: <span>Klik op <strong>"Script kopiëren"</strong> — het script weet automatisch vanaf welk ID het moet scannen.</span> },
                    { n: 2, icon: <MagnifyingGlassIcon className="w-4 h-4" />, text: <span>Ga naar het <strong>Umbraco-tabblad</strong> in je browser (je moet ingelogd zijn in Umbraco).</span> },
                    { n: 3, icon: <MagnifyingGlassIcon className="w-4 h-4" />, text: <span>Druk op <strong>F12</strong> om de ontwikkelaarstools te openen → klik op <strong>Console</strong> (bovenste tabblad).</span> },
                    { n: 4, icon: <ArrowPathIcon className="w-4 h-4" />, text: <span><strong>Plak</strong> het script (Ctrl+V) in de console en druk op <strong>Enter</strong>. Je ziet nu gevonden reserveringen voorbij scrollen. Wacht tot het klaar is ("SYNC KLAAR").</span> },
                    { n: 5, icon: <ArrowPathIcon className="w-4 h-4" />, text: <span>Kom terug naar deze pagina en klik op <strong>"Status vernieuwen"</strong> om te zien wanneer de laatste sync was.</span> },
                  ].map(({ n, icon, text }) => (
                    <div key={n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#0a2240', color: 'white', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{n}</div>
                      <div style={{ fontSize: 13, color: '#0a2240', lineHeight: 1.5 }}>{icon} {text}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14, padding: '10px 14px', background: '#fff8e6', border: '0.5px solid #f0c060', borderRadius: 7, fontSize: 12, color: '#7a5a00', lineHeight: 1.5 }}>
                  <strong>💡 Tip:</strong> Als de console een foutmelding geeft over "allow pasting", typ dan eerst <code style={{ background: '#fef3c7', padding: '1px 4px', borderRadius: 3 }}>allow pasting</code> en druk Enter, daarna plak je het script.
                </div>
              </div>

              {/* Script kopiëren knop */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={generateAndCopyScript}
                  disabled={generatingScript}
                  className="btn btn-primary"
                  style={{ fontSize: 14, padding: '10px 24px' }}
                >
                  {generatingScript ? <><ArrowPathIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Laden...</> : scriptCopied ? <><CheckCircleIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Gekopieerd!</> : <><ClipboardDocumentIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Script kopiëren</>}
                </button>
                {scriptCopied && (
                  <div style={{ fontSize: 13, color: '#0a7c6e', fontWeight: 600, lineHeight: 1.4 }}>
                    Plak nu in de Umbraco console<br />
                    <span style={{ fontWeight: 400, fontSize: 12, color: '#7090b0' }}>Umbraco-tabblad → F12 → Console → Ctrl+V → Enter</span>
                  </div>
                )}
              </div>

              {/* Result (getoond na directe import vanuit de frontend) */}
              {umbResult && (
                <div style={{ marginTop: 16, background: umbResult.errors > 0 ? '#fff5f5' : '#f0faf8', border: `1px solid ${umbResult.errors > 0 ? '#fca5a5' : '#6ee7b7'}`, borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
                  <div style={{ fontWeight: 700, color: '#0a2240', marginBottom: 6, display:'flex', alignItems:'center', gap:5 }}><CheckCircleIcon className="w-4 h-4" style={{color:'#0a7c6e'}} />Sync-resultaat (deze sessie)</div>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', color: '#0a2240' }}>
                    <span style={{ color: '#0a7c6e' }}>Nieuw: <strong>{umbResult.imported}</strong></span>
                    <span style={{ color: '#c0392b' }}>Geannuleerd: <strong>{umbResult.cancelled}</strong></span>
                    <span style={{ color: '#7090b0' }}>Overgeslagen: <strong>{umbResult.skipped}</strong></span>
                    {umbResult.errors > 0 && <span style={{ color: '#e53e3e' }}>Fouten: <strong>{umbResult.errors}</strong></span>}
                    {umbResult.lastId > 0 && <span style={{ color: '#7090b0' }}>Tot ID: <strong>{umbResult.lastId}</strong></span>}
                  </div>
                </div>
              )}
            </div>

            {/* ── Verificatiescan ───────────────────────────────────── */}
            <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 12, padding: '24px 28px', marginTop: 20 }}>
              <h2 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800, color: '#0a2240', display:'flex', alignItems:'center', gap:6 }}><MagnifyingGlassIcon className="w-4 h-4" />Annulerings­verificatie</h2>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: '#7090b0', lineHeight: 1.6 }}>
                Controleert alle boekingen die in dit systeem op <strong>openstaand (niet betaald)</strong> staan, rechtstreeks in Umbraco.
                Boekingen die in Umbraco inmiddels zijn geannuleerd worden alsnog bijgewerkt naar <em>geannuleerd</em>.
                Gebruik dit eenmalig na een historische import, of als je twijfelt of een boeking nog actief is.
              </p>

              <div style={{ background: '#fff8e6', border: '0.5px solid #f0c060', borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: 12, color: '#7a5a00', lineHeight: 1.5 }}>
                <strong>⏱ Let op:</strong> Het script controleert elke boeking afzonderlijk in Umbraco.
                Afhankelijk van het aantal openstaande boekingen kan dit enkele minuten duren. Sluit de console niet.
              </div>

              {pendingCount !== null && (
                <div style={{ marginBottom: 14, fontSize: 13, color: '#0a2240' }}>
                  <strong>{pendingCount}</strong> openstaande boekingen worden gecontroleerd.
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={generateAndCopyVerificationScript}
                  disabled={generatingVerify}
                  style={{
                    fontSize: 14, padding: '10px 24px', borderRadius: 10, border: 'none',
                    background: verifyCopied ? '#0a7c6e' : '#7c3a0a',
                    color: 'white', fontWeight: 700, cursor: generatingVerify ? 'not-allowed' : 'pointer',
                    opacity: generatingVerify ? 0.7 : 1,
                  }}
                >
                  {generatingVerify ? <><ArrowPathIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Ophalen...</> : verifyCopied ? <><CheckCircleIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Gekopieerd!</> : <><MagnifyingGlassIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Verificatiescript kopiëren</>}
                </button>
                {verifyCopied && (
                  <div style={{ fontSize: 13, color: '#7c3a0a', fontWeight: 600, lineHeight: 1.4 }}>
                    Plak in de Umbraco console<br />
                    <span style={{ fontWeight: 400, fontSize: 12, color: '#7090b0' }}>Umbraco-tabblad → F12 → Console → Ctrl+V → Enter</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Herstelverificatie geannuleerd+betaald ─────────── */}
            <div style={{ background: 'white', border: '2px solid #7c3c00', borderRadius: 12, padding: '24px 28px', marginTop: 20 }}>
              <h2 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800, color: '#7c3c00', display:'flex', alignItems:'center', gap:6 }}><ArrowPathRoundedSquareIcon className="w-4 h-4" />Herstelverificatie — geannuleerd maar betaald</h2>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: '#7090b0', lineHeight: 1.6 }}>
                Zoekt boekingen die in het nieuwe systeem <strong>geannuleerd</strong> staan maar wél <strong>betaald</strong> zijn (geen restitutie).
                Controleert of ze in Umbraco alsnog actief zijn en heractiveer ze automatisch.
              </p>

              {restoreCount !== null && restoreEntries.length > 0 && (
                <div style={{ marginBottom: 14, background: '#fff8f0', border: '0.5px solid #f0a060', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#7c3c00', marginBottom: 6 }}>
                    {restoreCount} boekingen te controleren:
                  </div>
                  {restoreEntries.map(e => (
                    <div key={e.id} style={{ fontSize: 12, color: '#0a2240', lineHeight: 1.6 }}>
                      #{e.id} — {e.name} · aankomst {e.arrival} · €{e.total.toFixed(2)}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={generateAndCopyRestoreScript}
                  disabled={generatingRestore}
                  style={{
                    fontSize: 14, padding: '10px 24px', borderRadius: 10, border: 'none',
                    background: restoreCopied ? '#0a7c6e' : '#7c3c00',
                    color: 'white', fontWeight: 700, cursor: generatingRestore ? 'not-allowed' : 'pointer',
                    opacity: generatingRestore ? 0.7 : 1,
                  }}
                >
                  {generatingRestore ? <><ArrowPathIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Ophalen...</> : restoreCopied ? <><CheckCircleIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Gekopieerd!</> : <><ArrowPathRoundedSquareIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Herstelscript kopiëren</>}
                </button>
                {restoreCopied && (
                  <div style={{ fontSize: 13, color: '#7c3c00', fontWeight: 600, lineHeight: 1.4 }}>
                    Plak in de Umbraco console<br />
                    <span style={{ fontWeight: 400, fontSize: 12, color: '#7090b0' }}>Umbraco-tabblad → F12 → Console → Ctrl+V → Enter</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Gaten-scan ───────────────────────────────────── */}
            <div style={{ background: 'white', border: '2px solid #7c0a7c', borderRadius: 12, padding: '24px 28px', marginTop: 20 }}>
              <h2 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800, color: '#7c0a7c', display:'flex', alignItems:'center', gap:6 }}><MagnifyingGlassIcon className="w-4 h-4" />Gaten-import (ontbrekende Umbraco-IDs)</h2>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: '#7090b0', lineHeight: 1.6 }}>
                Zoekt alle Umbraco-IDs die <strong>ontbreken</strong> in de database binnen een opgegeven bereik.
                Controleert elk ontbrekend ID in Umbraco en importeert gevonden reserveringen alsnog.
                Gebruik dit om importgaten te dichten (bijv. bereik 24284–24515).
              </p>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#0a2240' }}>Van ID:</label>
                  <input
                    type="number"
                    value={gapFromId}
                    onChange={e => setGapFromId(e.target.value)}
                    style={{ width: 90, border: '0.5px solid rgba(10,34,64,0.25)', borderRadius: 7, padding: '7px 10px', fontSize: 14, fontWeight: 700, color: '#0a2240', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#0a2240' }}>Tot ID:</label>
                  <input
                    type="number"
                    value={gapToId}
                    onChange={e => setGapToId(e.target.value)}
                    style={{ width: 90, border: '0.5px solid rgba(10,34,64,0.25)', borderRadius: 7, padding: '7px 10px', fontSize: 14, fontWeight: 700, color: '#0a2240', outline: 'none' }}
                  />
                </div>
              </div>

              {gapResult !== null && (
                <div style={{ marginBottom: 14, fontSize: 13, color: '#0a2240' }}>
                  <strong style={{ color: '#7c0a7c' }}>{gapResult.count}</strong> ontbrekende IDs · <strong>{gapResult.present}</strong> al aanwezig in de database.
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={generateAndCopyGapScript}
                  disabled={generatingGap}
                  style={{
                    fontSize: 14, padding: '10px 24px', borderRadius: 10, border: 'none',
                    background: gapCopied ? '#0a7c6e' : '#7c0a7c',
                    color: 'white', fontWeight: 700, cursor: generatingGap ? 'not-allowed' : 'pointer',
                    opacity: generatingGap ? 0.7 : 1,
                  }}
                >
                  {generatingGap ? <><ArrowPathIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Ophalen...</> : gapCopied ? <><CheckCircleIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Gekopieerd!</> : <><MagnifyingGlassIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Gaten-script kopiëren</>}
                </button>
                {gapCopied && (
                  <div style={{ fontSize: 13, color: '#7c0a7c', fontWeight: 600, lineHeight: 1.4 }}>
                    Plak in de Umbraco console<br />
                    <span style={{ fontWeight: 400, fontSize: 12, color: '#7090b0' }}>Umbraco-tabblad → F12 → Console → Ctrl+V → Enter</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Voertuig-herstel-scan ─────────────────────────── */}
            <div style={{ background: 'white', border: '2px solid #7c4a1a', borderRadius: 12, padding: '24px 28px', marginTop: 20 }}>
              <h2 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800, color: '#7c4a1a', display:'flex', alignItems:'center', gap:6 }}>
                <TruckIcon className="w-4 h-4" />Voertuig-herstel-scan
              </h2>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: '#7090b0', lineHeight: 1.6 }}>
                Scant alle geïmporteerde Umbraco-reserveringen op ontbrekende voertuigen via tekst-detectie
                (bijv. "3 auto's" in de notitie) en prijsratio (totaalprijs ÷ tarief). Voegt lege kentekens toe die u bij aankomst kunt invullen.
              </p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <button
                  onClick={() => runVehicleRepairScan(true)}
                  disabled={vehicleScanRunning}
                  style={{ fontSize: 14, padding: '9px 20px', borderRadius: 8, border: '1.5px solid #7c4a1a', background: 'white', color: '#7c4a1a', fontWeight: 700, cursor: vehicleScanRunning ? 'not-allowed' : 'pointer', opacity: vehicleScanRunning ? 0.6 : 1 }}
                >
                  {vehicleScanRunning ? <><ArrowPathIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Bezig...</> : <><MagnifyingGlassIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Droogloop (alleen rapport)</>}
                </button>
                <button
                  onClick={() => runVehicleRepairScan(false)}
                  disabled={vehicleScanRunning}
                  style={{ fontSize: 14, padding: '9px 20px', borderRadius: 8, border: 'none', background: '#7c4a1a', color: 'white', fontWeight: 700, cursor: vehicleScanRunning ? 'not-allowed' : 'pointer', opacity: vehicleScanRunning ? 0.6 : 1 }}
                >
                  {vehicleScanRunning ? <><ArrowPathIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Bezig...</> : <><WrenchScrewdriverIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Scan & herstel</>}
                </button>
              </div>
              {vehicleScanResult && (
                <div>
                  <div style={{ fontSize: 13, color: '#1a2b3c', marginBottom: 10 }}>
                    <strong>{vehicleScanResult.scanned}</strong> gescand &nbsp;·&nbsp;
                    <strong style={{ color: vehicleScanResult.flaggedCount > 0 ? '#c0540a' : '#0a7c6e' }}>{vehicleScanResult.flaggedCount}</strong> gevlagged
                    {!vehicleScanResult.dryRun && <> &nbsp;·&nbsp; <strong style={{ color: '#0a7c6e' }}>{vehicleScanResult.repairedCount}</strong> gerepareerd</>}
                    {vehicleScanResult.dryRun && <span style={{ marginLeft: 8, fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 10 }}>droogloop</span>}
                  </div>
                  {vehicleScanResult.flagged.length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f5f0eb', textAlign: 'left' }}>
                          <th style={{ padding: '6px 10px', color: '#7090b0' }}>Referentie</th>
                          <th style={{ padding: '6px 10px', color: '#7090b0' }}>Aankomst</th>
                          <th style={{ padding: '6px 10px', color: '#7090b0' }}>Voertuigen nu → gewenst</th>
                          <th style={{ padding: '6px 10px', color: '#7090b0' }}>Reden</th>
                          <th style={{ padding: '6px 10px', color: '#7090b0' }}>Prijs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vehicleScanResult.flagged.map((f, i) => (
                          <tr key={i} style={{ borderTop: '1px solid #e2e8f0', background: i % 2 === 0 ? 'white' : '#fafbfc' }}>
                            <td style={{ padding: '6px 10px', fontWeight: 600, color: '#0a2240' }}>{f.reference}</td>
                            <td style={{ padding: '6px 10px', color: '#4a5568' }}>{f.arrival}</td>
                            <td style={{ padding: '6px 10px' }}>
                              <span style={{ color: '#c0540a' }}>{f.currentVehicles}</span>
                              {' → '}
                              <span style={{ color: '#0a7c6e', fontWeight: 700 }}>{f.detectedVehicles}</span>
                              <span style={{ color: '#7090b0', marginLeft: 4 }}>(+{f.toAdd})</span>
                            </td>
                            <td style={{ padding: '6px 10px', color: '#7090b0', fontStyle: 'italic' }}>{f.reason}</td>
                            <td style={{ padding: '6px 10px', color: '#1a2b3c' }}>€{f.totalPrice.toFixed(2).replace('.',',')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

            {/* ── EV-prijs reparatiescan ───────────────────────── */}
            <div style={{ background: 'white', border: '2px solid #0a7c6e', borderRadius: 12, padding: '24px 28px', marginTop: 20 }}>
              <h2 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800, color: '#0a7c6e', display:'flex', alignItems:'center', gap:6 }}>
                <BoltIcon className="w-4 h-4" />EV-prijs reparatiescan
              </h2>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: '#7090b0', lineHeight: 1.6 }}>
                Controleert alle EV-reserveringen op correcte kWh en prijs via uw ingelogde Umbraco-sessie.
                Werkt zoals de sync: script kopiëren → in de Umbraco console plakken → Enter.
                Resultaten verschijnen in de console.
              </p>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={generateAndCopyEvRepairScript}
                  disabled={generatingEvRepair}
                  style={{ fontSize: 14, padding: '10px 24px', borderRadius: 10, border: 'none', background: evRepairCopied ? '#0a7c6e' : '#065f46', color: 'white', fontWeight: 700, cursor: generatingEvRepair ? 'not-allowed' : 'pointer', opacity: generatingEvRepair ? 0.7 : 1 }}
                >
                  {generatingEvRepair
                    ? <><ArrowPathIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Ophalen...</>
                    : evRepairCopied
                    ? <><CheckCircleIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Gekopieerd!</>
                    : <><BoltIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />EV-repair script kopiëren</>}
                </button>
                {evRepairCopied && (
                  <div style={{ fontSize: 13, color: '#065f46', fontWeight: 600, lineHeight: 1.4 }}>
                    Plak in de Umbraco console<br />
                    <span style={{ fontWeight: 400, fontSize: 12, color: '#7090b0' }}>Umbraco-tabblad → F12 → Console → Ctrl+V → Enter</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── EV-laadscan nieuwe boekingen ─────────────────── */}
            <div style={{ background: 'white', border: '0.5px solid rgba(10,34,64,0.12)', borderRadius: 12, padding: '24px 28px', marginTop: 20 }}>
              <h2 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800, color: '#0a2240', display:'flex', alignItems:'center', gap:6 }}><BoltIcon className="w-4 h-4" />EV-laadscan (nieuwe boekingen)</h2>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: '#7090b0', lineHeight: 1.6 }}>
                Controleert <strong>nieuwe</strong> Umbraco-boekingen (vanaf ~#23283) op laadwens + kWh-hoeveelheid.
                Bij nieuwe boekingen zit de EV-kosten al verwerkt in de Umbraco-prijs — het script splitst dit correct af.
              </p>

              {evNewCount !== null && (
                <div style={{ marginBottom: 14, fontSize: 13, color: '#0a2240' }}>
                  <strong>{evNewCount}</strong> nieuwe boekingen worden gecontroleerd op laadwens.
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={generateAndCopyEvNewScript}
                  disabled={generatingEvNew}
                  style={{
                    fontSize: 14, padding: '10px 24px', borderRadius: 10, border: 'none',
                    background: evNewCopied ? '#0a7c6e' : '#7c3c00',
                    color: 'white', fontWeight: 700, cursor: generatingEvNew ? 'not-allowed' : 'pointer',
                    opacity: generatingEvNew ? 0.7 : 1,
                  }}
                >
                  {generatingEvNew ? <><ArrowPathIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Ophalen...</> : evNewCopied ? <><CheckCircleIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />Gekopieerd!</> : <><BoltIcon className="w-4 h-4" style={{display:'inline',verticalAlign:'middle',marginRight:4}} />EV-script nieuwe boekingen</>}
                </button>
                {evNewCopied && (
                  <div style={{ fontSize: 13, color: '#7c3c00', fontWeight: 600, lineHeight: 1.4 }}>
                    Plak in de Umbraco console<br />
                    <span style={{ fontWeight: 400, fontSize: 12, color: '#7090b0' }}>Umbraco-tabblad → F12 → Console → Ctrl+V → Enter</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
