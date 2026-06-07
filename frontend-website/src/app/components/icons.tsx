import React from 'react';

type P = { size?: number; color?: string; style?: React.CSSProperties };
const line = (size: number, color: string) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: color, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
});

// Officieel WhatsApp-logo (glyph)
export function IconWhatsApp({ size = 18, color = 'currentColor', style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={style} aria-hidden="true">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.51 5.26l-.999 3.648 3.748-.984zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}

export function IconMapPin({ size = 22, color = 'currentColor', style }: P) {
  return (<svg {...line(size, color)} style={style} aria-hidden="true"><path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0z" /><circle cx="12" cy="10.5" r="2.6" /></svg>);
}
export function IconPhone({ size = 22, color = 'currentColor', style }: P) {
  return (<svg {...line(size, color)} style={style} aria-hidden="true"><path d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25z" /></svg>);
}
export function IconMail({ size = 22, color = 'currentColor', style }: P) {
  return (<svg {...line(size, color)} style={style} aria-hidden="true"><path d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>);
}
export function IconMap({ size = 22, color = 'currentColor', style }: P) {
  return (<svg {...line(size, color)} style={style} aria-hidden="true"><path d="M9 6.75L3.75 4.5v12.75L9 19.5m0-12.75l6 2.25m-6-2.25v12.75m6-10.5l5.25-2.25V16.5L15 18.75m0-12v12" /></svg>);
}
export function IconCar({ size = 22, color = 'currentColor', style }: P) {
  return (<svg {...line(size, color)} style={style} aria-hidden="true"><path d="M3.5 13.5l1.2-4.2A2.5 2.5 0 0 1 7.1 7.5h9.8a2.5 2.5 0 0 1 2.4 1.8l1.2 4.2M3.5 13.5h17M3.5 13.5v4.25c0 .41.34.75.75.75h1.5a.75.75 0 0 0 .75-.75V16.5m14-3v4.25a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75V16.5M6.5 16.5h11" /><circle cx="7.25" cy="16.5" r="0.6" fill={color} stroke="none" /><circle cx="16.75" cy="16.5" r="0.6" fill={color} stroke="none" /></svg>);
}
export function IconCalculator({ size = 22, color = 'currentColor', style }: P) {
  return (<svg {...line(size, color)} style={style} aria-hidden="true"><rect x="5" y="2.5" width="14" height="19" rx="2" /><rect x="8" y="5.5" width="8" height="3.2" rx="0.6" /><path d="M8.5 13h0M12 13h0M15.5 13h0M8.5 16.5h0M12 16.5h0M15.5 16.5h.01" /></svg>);
}
export function IconCalendar({ size = 22, color = 'currentColor', style }: P) {
  return (<svg {...line(size, color)} style={style} aria-hidden="true"><path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>);
}
export function IconBolt({ size = 22, color = 'currentColor', style }: P) {
  return (<svg {...line(size, color)} style={style} aria-hidden="true"><path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>);
}
export function IconBoat({ size = 22, color = 'currentColor', style }: P) {
  return (<svg {...line(size, color)} style={style} aria-hidden="true"><path d="M3 17.5c1.2 1 2 1 3.2 0 1.2-1 2-1 3.2 0 1.2 1 2 1 3.2 0 1.2-1 2-1 3.2 0" /><path d="M4.5 14.5L6 9.5h12l1.5 5M9 9.5V6.5h4l3 3M9 6.5L7.5 9.5" /></svg>);
}
export function IconVan({ size = 22, color = 'currentColor', style }: P) {
  return (<svg {...line(size, color)} style={style} aria-hidden="true"><path d="M1.5 7.5h11v9h-11a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM12.5 9.5h4.5a2 2 0 0 1 1.7.95l2.1 3.4a2 2 0 0 1 .3 1.05v1.6h-8.6V9.5z" /><circle cx="6" cy="16.5" r="1.7" /><circle cx="17.5" cy="16.5" r="1.7" /></svg>);
}
