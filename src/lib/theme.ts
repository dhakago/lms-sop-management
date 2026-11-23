export type HoldingId = 'people' | 'sib' | 'bejo' | 'bos';

export type Theme = { name: string; mono: string; code: string; p: string; a: string; onA: string; tp: string; ta: string };

// Warna mengikuti desain yang sudah disetujui.
export const THEMES: Record<HoldingId, Theme> = {
  people: { name: 'PEOPLE', mono: 'P', code: 'PPL', p: '#0F2C6B', a: '#F26B1D', onA: '#1A1208', tp: '#E3E8F6', ta: '#FDE6D6' },
  sib: { name: 'SIBIMA Group', mono: 'S', code: 'SIB', p: '#B01919', a: '#1F3391', onA: '#FFFFFF', tp: '#FBE3E3', ta: '#E1E5F6' },
  bejo: { name: 'BEJO Group', mono: 'B', code: 'BJO', p: '#1F7A33', a: '#A6CE39', onA: '#12201C', tp: '#DDF0E1', ta: '#EEF5D3' },
  bos: { name: 'BOS Group', mono: 'B', code: 'BOS', p: '#0E1A3A', a: '#D4A431', onA: '#12201C', tp: '#E1E5F0', ta: '#F8EDCB' },
};

export function themeFor(id: string | null | undefined): Theme {
  return THEMES[(id as HoldingId) in THEMES ? (id as HoldingId) : 'people'];
}

export function themeVars(t: Theme): Record<string, string> {
  return { '--p': t.p, '--a': t.a, '--on-a': t.onA, '--tp': t.tp, '--ta': t.ta };
}
