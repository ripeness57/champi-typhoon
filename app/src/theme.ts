import { StyleSheet } from 'react-native';

// 與原戰情室頁面相同的深色配色
export const C = {
  ink: '#07111a', panel: '#0d1b26', panel2: '#132634', line: '#213a4c', line2: '#2d4c61',
  fg: '#e3edf3', mute: '#8fa6b4', dim: '#5f7886',
  cyan: '#5cc8f5', amber: '#f2a93b', red: '#ff5a4e', mag: '#d96fc6', ok: '#4fb38a',
};

// 侵襲機率分級色
export const PROB = ['#17303f', '#245f78', '#b9802a', '#e2642f', '#ff5a4e'];
export const probBin = (p: number | null) => (p == null ? 0 : p >= 100 ? 4 : p >= 90 ? 3 : p >= 70 ? 2 : p >= 50 ? 1 : 0);

export const WIND: Record<string, { bg: string; fg: string }> = {
  w0: { bg: '#17303f', fg: '#8fa6b4' }, w6: { bg: '#245f78', fg: '#e3edf3' }, w7: { bg: '#b9802a', fg: '#fff' },
  w9: { bg: '#e2642f', fg: '#fff' }, w12: { bg: '#ff5a4e', fg: '#fff' },
};

export const MONO = 'monospace';

export const S = StyleSheet.create({
  card: { backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, padding: 14, marginBottom: 12 },
  label: { color: C.mute, fontSize: 11, letterSpacing: 1.2, fontFamily: MONO },
  h2: { color: C.fg, fontSize: 19, fontWeight: '700', marginBottom: 8 },
  note: { color: C.mute, fontSize: 12.5, lineHeight: 19 },
  text: { color: C.fg, fontSize: 14 },
  mono: { color: C.fg, fontFamily: MONO },
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  chip: { borderWidth: 1, borderColor: C.line2, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 2, marginRight: 5, marginBottom: 4 },
  chipText: { fontSize: 11, color: C.mute, fontFamily: MONO },
  btn: { borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 3, marginRight: 6, marginBottom: 6 },
  btnOn: { borderColor: C.cyan, backgroundColor: '#14303f' },
  btnText: { color: C.fg, fontSize: 13 },
});
