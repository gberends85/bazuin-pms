// Nederlandse kenteken-formatter volgens de officiële zijcodes.
// Zet streepjes op de juiste posities, bv. "26XSJZ" → "26-XS-JZ", "V42DLH" → "V-42-DLH".
const NL_SIDECODE_GROUPS: Record<string, number[]> = {
  LLDDDD: [2,2,2], // 1  XX-99-99
  DDDDLL: [2,2,2], // 2  99-99-XX
  DDLLDD: [2,2,2], // 3  99-XX-99
  LLDDLL: [2,2,2], // 4  XX-99-XX
  LLLLDD: [2,2,2], // 5  XX-XX-99
  DDLLLL: [2,2,2], // 6  99-XX-XX
  DDLLLD: [2,3,1], // 7  99-XXX-9
  DLLLDD: [1,3,2], // 8  9-XXX-99
  LLDDDL: [2,3,1], // 9  XX-999-X
  LDDDLL: [1,3,2], // 10 X-999-XX
  LLLDDL: [3,2,1], // 11 XXX-99-X
  DLLDDD: [1,2,3], // 12 9-XX-999
  DDDLLD: [3,2,1], // 13 999-XX-9
  LDDLLL: [1,2,3], // 14 X-99-XXX
};

export function formatPlate(raw: string): string {
  if (!raw) return '';
  const s = String(raw).replace(/[-\s]/g, '').toUpperCase();
  if (s.length === 6) {
    const sig = s.replace(/[A-Z]/g, 'L').replace(/[0-9]/g, 'D');
    const groups = NL_SIDECODE_GROUPS[sig] || [2, 2, 2];
    const parts: string[] = [];
    let i = 0;
    for (const g of groups) { parts.push(s.slice(i, i + g)); i += g; }
    return parts.join('-');
  }
  return s.replace(/([A-Z]+)(\d)/g, '$1-$2').replace(/(\d+)([A-Z])/g, '$1-$2');
}

// ── Land-detectie voor kentekens (zodat alleen NL de gele plaat krijgt) ──
const DUTCH_PATTERNS = [
  /^[A-Z]{2}\d{2}[A-Z]{2}$/, /^[A-Z]{2}[A-Z]{2}\d{2}$/, /^\d{2}[A-Z]{2}[A-Z]{2}$/,
  /^[A-Z]{2}\d{3}[A-Z]$/, /^[A-Z]\d{3}[A-Z]{2}$/, /^\d{2}[A-Z]{3}\d$/, /^\d[A-Z]{3}\d{2}$/,
  /^[A-Z][A-Z]{3}\d{2}$/, /^[A-Z]{3}\d{2}[A-Z]$/, /^[A-Z]\d{2}[A-Z]{3}$/, /^\d\d[A-Z]{2}\d{3}$/,
];

export type PlateStyle = {
  bg: string; border: string; textColor: string; euBg: string | null; euCode: string; isEu: boolean;
};

const NL_STYLE: PlateStyle = { bg: '#f5c518', border: '#c8a010', textColor: '#0a2240', euBg: '#003399', euCode: 'NL', isEu: true };
const UNIVERSAL_STYLE: PlateStyle = { bg: '#ffffff', border: '#aaaaaa', textColor: '#333333', euBg: null, euCode: '', isEu: false };

// Buitenlands formaat op patroon herkennen (voor de landcode op een witte plaat).
function foreignStyle(s: string): PlateStyle | null {
  if (/^[A-Z]{1,3}[A-Z]{1,2}\d{1,4}$/.test(s) && s.length >= 4 && s.length <= 8 && s.length !== 6) return { bg: '#ffffff', border: '#333333', textColor: '#000000', euBg: '#003399', euCode: 'D', isEu: true };
  if (/^\d[A-Z]{3}\d{3}$/.test(s)) return { bg: '#ffffff', border: '#cc0000', textColor: '#000000', euBg: '#003399', euCode: 'B', isEu: true };
  if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(s)) return { bg: '#ffffff', border: '#555555', textColor: '#000000', euBg: '#003399', euCode: 'F', isEu: true };
  if (/^[A-Z]{2}\d{2}[A-Z]{3}$/.test(s)) return { bg: '#f0f0f0', border: '#003399', textColor: '#000000', euBg: null, euCode: 'GB', isEu: false };
  return null;
}

// isDutch: true = door RDW als NL herkend (geel); false = niet als NL herkend
// (universeel/land); undefined = onbekend → val terug op patroonherkenning.
export function detectPlateStyle(raw: string, isDutch?: boolean): PlateStyle {
  const s = String(raw || '').replace(/[-\s]/g, '').toUpperCase();
  const foreign = foreignStyle(s);
  if (isDutch === true) return NL_STYLE;
  if (isDutch === false) return foreign || UNIVERSAL_STYLE;
  if (DUTCH_PATTERNS.some(p => p.test(s))) return NL_STYLE;
  return foreign || UNIVERSAL_STYLE;
}
