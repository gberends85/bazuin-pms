// Uitchecken op een andere dag dan de vertrekdatum is bijna altijd een
// vergissing, bijvoorbeeld een klik in de vertrekkenlijst van een andere dag.
// Dan eerst bevestigen; op de vertrekdag zelf gaat het gewoon in één klik.
export function bevestigUitcheck(res: any): boolean {
  if (!res?.departure_date) return true;

  // Lokale datumdelen gebruiken: de API kan de datum als "2026-09-12" of als
  // UTC-tijdstempel teruggeven, en alleen zo komt het in beide gevallen goed.
  const dag = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const vertrekDatum = new Date(res.departure_date);
  if (isNaN(vertrekDatum.getTime())) return true;

  const vertrek = dag(vertrekDatum);
  const vandaag = dag(new Date());
  if (vertrek === vandaag) return true;

  const naam = [res.first_name, res.last_name].filter(Boolean).join(' ') || 'Deze klant';
  const datum = vertrekDatum.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
  const wanneer = vertrek > vandaag ? 'vertrekt pas op' : 'had moeten vertrekken op';
  return window.confirm(`${naam} ${wanneer} ${datum}, niet vandaag.\n\nToch nu uitchecken?`);
}
