import { ScrollView, Text, View } from 'react-native';
import type { RainArea, TyphoonData } from '../types';
import { C, S, WIND } from '../theme';
import { Card, CardHead } from '../ui';
import { fmtTime, windLevel } from '../logic';

const rng = (s: string): [number, number] | null => {
  if (!s || s === '-') return null;
  const m = (s.match(/\d+/g) || []).map(Number);
  if (!m.length) return null;
  return s.includes('<') ? [0, m[0]] : [m[0], m[1] ?? m[0]];
};

function RainBars({ areas, pick, max, thr, refFor }: { areas: RainArea[]; pick: 'flat' | 'mtn'; max: number; thr: number; refFor?: (n: string) => number }) {
  const rows = areas.map((a) => ({ n: a.name, r: rng(a[pick]), s: a[pick] })).filter((x) => x.r && x.r[1] >= 80).sort((a, b) => b.r![1] - a.r![1]);
  if (!rows.length) return <Text style={S.note}>沒有預報 80 mm 以上的分區</Text>;
  return (
    <View>
      {rows.map(({ n, r, s }) => {
        const th = refFor ? refFor(n) : thr;
        const over = r![0] >= th;
        return (
          <View key={n} style={[S.row, { paddingVertical: 3 }]}>
            <Text style={{ color: C.fg, fontSize: 12.5, width: 68 }}>{n}</Text>
            <View style={{ flex: 1, height: 13, backgroundColor: C.panel2 }}>
              <View style={{ position: 'absolute', top: 0, bottom: 0, left: `${(r![0] / max) * 100}%`, width: `${(Math.max(r![1] - r![0], max * 0.01) / max) * 100}%`, backgroundColor: over ? C.red : C.cyan }} />
              {th <= max ? <View style={{ position: 'absolute', top: -3, bottom: -3, left: `${(th / max) * 100}%`, borderLeftWidth: 1, borderColor: C.amber, borderStyle: 'dashed' }} /> : null}
            </View>
            <Text style={{ color: C.fg, fontFamily: 'monospace', fontSize: 11.5, width: 84, textAlign: 'right' }}>{s}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function WeatherScreen({ d }: { d: TyphoonData }) {
  const r24 = d.rain24, rt = d.rainTotal, w = d.wind, o = d.rainObs;
  return (
    <View>
      {r24 ? (
        <Card>
          <CardHead label="24 小時雨量預報" src={`氣象署 ${fmtTime(r24.issued)}${r24.tag ? ` ${r24.tag}` : ''}`} />
          {r24.valid ? <Text style={[S.note, { marginBottom: 6 }]}>{r24.valid}</Text> : null}
          <Text style={[S.text, { fontWeight: '700', marginBottom: 4 }]}>山區 <Text style={S.note}>參考 200 mm（台北市 350）</Text></Text>
          <RainBars areas={r24.areas} pick="mtn" max={600} thr={200} refFor={(n) => (n === '台北市' ? 350 : 200)} />
          <Text style={[S.text, { fontWeight: '700', marginVertical: 4 }]}>平地 <Text style={S.note}>參考 350 mm</Text></Text>
          <RainBars areas={r24.areas} pick="flat" max={600} thr={350} />
        </Card>
      ) : null}

      {rt ? (
        <Card>
          <CardHead label="總雨量預報 · 山區" src={`氣象署 ${fmtTime(rt.issued)}`} />
          <RainBars areas={rt.areas} pick="mtn" max={1000} thr={1001} />
        </Card>
      ) : null}

      {w ? (
        <Card>
          <CardHead label="風力預報（蒲福風級）" src={`氣象署 ${fmtTime(w.issued)}${w.tag ? ` ${w.tag}` : ''}`} />
          <Text style={[S.note, { marginBottom: 8 }]}>平均風／陣風。橘色以上達停班課風力參考標準（平均 7 級或陣風 10 級）。</Text>
          <ScrollView horizontal>
            <View>
              <View style={[S.row, { borderBottomWidth: 1, borderColor: C.line, paddingBottom: 4 }]}>
                <Text style={[S.label, { width: 104 }]}>分區</Text>
                {w.periods.map((p) => <Text key={p} style={[S.label, { width: 112, textAlign: 'center', letterSpacing: 0 }]}>{p}</Text>)}
              </View>
              {w.areas.map((a) => (
                <View key={a.name} style={[S.row, { paddingVertical: 3, borderBottomWidth: 1, borderColor: '#162a37' }]}>
                  <Text style={{ color: C.fg, fontSize: 12, width: 104 }}>{a.name.replace('濱海鄉鎮', ' 濱海')}</Text>
                  {a.mean.map((m, i) => {
                    const lv = WIND[windLevel(m, a.gust[i] || '0')];
                    return (
                      <View key={i} style={{ width: 112, alignItems: 'center' }}>
                        <View style={{ backgroundColor: lv.bg, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, minWidth: 96 }}>
                          <Text style={{ color: lv.fg, fontSize: 11, fontFamily: 'monospace', textAlign: 'center' }}>{m}／{a.gust[i]}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
          <View style={[S.row, { flexWrap: 'wrap', marginTop: 8 }]}>
            {[['w0', '<6 G9'], ['w6', '≥6 G9'], ['w7', '≥7 G10'], ['w9', '≥9 G12'], ['w12', '≥12 G14']].map(([k, l]) => (
              <View key={k} style={{ backgroundColor: WIND[k].bg, paddingHorizontal: 6, marginRight: 6, marginBottom: 4 }}>
                <Text style={{ color: WIND[k].fg, fontSize: 11, fontFamily: 'monospace' }}>{l}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {o ? (
        <Card>
          <CardHead label="實測雨量" src={`氣象署 ${fmtTime(o.time)} · ${o.stationCount} 站`} />
          <View style={[S.row, { borderBottomWidth: 1, borderColor: C.line, paddingBottom: 3 }]}>
            <Text style={[S.label, { width: 60 }]}>縣市</Text>
            <Text style={[S.label, { flex: 1 }]}>24h 最大（站）</Text>
            <Text style={[S.label, { width: 50, textAlign: 'right' }]}>24h</Text>
            <Text style={[S.label, { width: 44, textAlign: 'right' }]}>1h</Text>
          </View>
          {o.counties.filter((c) => c.max24 > 0).map((c) => (
            <View key={c.county} style={{ paddingVertical: 4, borderBottomWidth: 1, borderColor: '#162a37' }}>
              <View style={S.row}>
                <Text style={{ color: C.fg, fontSize: 13, width: 60 }}>{c.county}</Text>
                <Text style={{ color: C.mute, fontSize: 12, flex: 1 }} numberOfLines={1}>{c.station}</Text>
                <Text style={{ color: C.fg, fontFamily: 'monospace', fontSize: 12.5, width: 50, textAlign: 'right' }}>{c.max24}</Text>
                <Text style={{ color: C.fg, fontFamily: 'monospace', fontSize: 12.5, width: 44, textAlign: 'right' }}>{c.max1}</Text>
              </View>
              <View style={{ height: 4, backgroundColor: C.panel2, marginTop: 3 }}>
                <View style={{ height: 4, width: `${Math.min(100, (c.max24 / Math.max(...o.counties.map((x) => x.max24), 1)) * 100)}%`, backgroundColor: C.cyan }} />
              </View>
            </View>
          ))}
          <Text style={[S.label, { marginTop: 12, marginBottom: 4 }]}>1 小時雨量前 10 站</Text>
          {o.top1h.map((s, i) => <Top key={`a${i}`} i={i} s={`${s.county.slice(0, 2)}${s.town} ${s.name}`} v={`${s.h1} mm`} />)}
          <Text style={[S.label, { marginTop: 12, marginBottom: 4 }]}>24 小時累積前 10 站</Text>
          {o.top24h.map((s, i) => <Top key={`b${i}`} i={i} s={`${s.county.slice(0, 2)}${s.town} ${s.name}`} v={`${s.h24} mm`} />)}
        </Card>
      ) : null}
    </View>
  );
}

function Top({ i, s, v }: { i: number; s: string; v: string }) {
  return (
    <View style={[S.row, { paddingVertical: 3, borderBottomWidth: 1, borderColor: '#162a37' }]}>
      <Text style={{ color: C.dim, fontFamily: 'monospace', width: 22 }}>{i + 1}</Text>
      <Text style={{ color: C.fg, fontSize: 13, flex: 1 }}>{s}</Text>
      <Text style={{ color: C.fg, fontFamily: 'monospace', fontSize: 12.5 }}>{v}</Text>
    </View>
  );
}
