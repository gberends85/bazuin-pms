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
