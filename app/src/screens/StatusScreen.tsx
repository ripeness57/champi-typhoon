import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { TyphoonData } from '../types';
import { C, S } from '../theme';
import { Card, CardHead, Stat } from '../ui';
import { COUNTIES, ago, at, buildPath, fmtDayHour, fmtTime, hav } from '../logic';

const hms = (ms: number) => {
  if (ms <= 0) return '已過';
  const s = Math.floor(ms / 1000), p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};

const DIRS: Record<string, string> = { N: '北', NNE: '北北東', NE: '東北', ENE: '東北東', E: '東', ESE: '東南東', SE: '東南', SSE: '南南東', S: '南', SSW: '南南西', SW: '西南', WSW: '西南西', W: '西', WNW: '西北西', NW: '西北', NNW: '北北西' };
const moveC = (m: string | null) => {
  if (!m) return '-';
  const [d, v] = m.split(' ');
  return `${DIRS[d] || d} ${v}`;
};

export default function StatusScreen({ d, myCounty }: { d: TyphoonData; myCounty: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  const nowMin = Math.floor(now / 60000) * 60000;
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const w = d.warning;
  const cur = w?.current;
  const path = useMemo(() => buildPath(d), [d]);

  // 最接近台北（或我的縣市）的預測時間
  const closest = useMemo(() => {
    const c = COUNTIES.find((x) => x.n === myCounty);
    const pt = c || { n: '台北', lat: 25.05, lon: 121.56 };
    if (!path.length) return null;
    let best = { t: 0, km: Infinity };
    const end = path[path.length - 1].t;
    for (let t = Math.max(nowMin, path[0].t); t <= end; t += 15 * 60000) {
      const p = at(path, t);
      if (!p) continue;
      const km = hav(p.lat, p.lon, pt.lat, pt.lon);
      if (km < best.km) best = { t, km };
    }
    return best.km < Infinity ? { ...best, name: pt.n } : null;
  }, [path, myCounty, nowMin]);

  const fc = d.forecast?.forecast || [];
  const tpe = new Date(now + 8 * 3600e3);
  const p2 = (n: number) => String(n).padStart(2, '0');

  return (
    <View>
      <Text style={{ color: C.cyan, fontFamily: 'monospace', fontSize: 11.5, letterSpacing: 1 }}>
        {w?.number ? `第 ${w.number} 號颱風 · ` : ''}{w?.nameE || ''}{w?.report ? ` · 氣象署第 ${w.report} 報` : ''}
      </Text>
      <Text style={{ color: C.fg, fontSize: 46, fontWeight: '900', marginVertical: 4 }}>
        {w?.nameC || '颱風'}
        <Text style={{ fontSize: 13, color: C.mute, fontWeight: '500' }}>  {w?.intensity || ''}</Text>
      </Text>

      <View style={[S.row, { flexWrap: 'wrap', marginBottom: 12 }]}>
        {w?.active ? (
          <View style={{ borderWidth: 1, borderColor: C.red, backgroundColor: '#3a1a1c', paddingHorizontal: 10, paddingVertical: 4, marginRight: 8, marginBottom: 6 }}>
            <Text style={{ color: '#fff', fontSize: 12.5 }}>● {w.title}</Text>
          </View>
        ) : (
          <View style={{ borderWidth: 1, borderColor: C.ok, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6 }}>
            <Text style={{ color: C.ok, fontSize: 12.5 }}>目前沒有颱風警報</Text>
          </View>
        )}
        {w?.validTo ? (
          <View style={{ borderWidth: 1, borderColor: C.line2, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6 }}>
            <Text style={{ color: C.fg, fontSize: 12.5 }}>發布 {fmtTime(w.issued)} · 有效至 {fmtTime(w.validTo)}</Text>
          </View>
        ) : null}
      </View>

      <View style={[S.row, { marginBottom: 12 }]}>
        <View style={[S.card, { flex: 1, marginRight: 8, marginBottom: 0, padding: 10 }]}>
          <Text style={S.label}>{closest ? `最接近${closest.name} ${fmtDayHour(new Date(closest.t).toISOString())}` : '最接近'}</Text>
          <Text style={{ color: C.fg, fontFamily: 'monospace', fontSize: 19, fontWeight: '600' }}>{closest ? hms(closest.t - now) : '-'}</Text>
          {closest ? <Text style={{ color: C.mute, fontSize: 11 }}>約 {Math.round(closest.km)} 公里</Text> : null}
        </View>
        <View style={[S.card, { flex: 1, marginBottom: 0, padding: 10 }]}>
          <Text style={S.label}>台北時間</Text>
          <Text style={{ color: C.fg, fontFamily: 'monospace', fontSize: 19, fontWeight: '600' }}>{`${p2(tpe.getUTCHours())}:${p2(tpe.getUTCMinutes())}:${p2(tpe.getUTCSeconds())}`}</Text>
          <Text style={{ color: C.mute, fontSize: 11 }}>資料 {ago(d.updatedAt, now)}更新</Text>
        </View>
      </View>

      {cur ? (
        <Card>
          <CardHead label="颱風現況" src={`第${w?.report}報 · ${fmtTime(cur.time)}`} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Stat label="中心氣壓" value={cur.pressure} unit="hPa" />
            <Stat label="移動" value={(cur.movement?.match(/(\d+)公里/) || [])[1]} unit="km/h" sub={cur.movement?.replace(/^以每小時\d+公里速度，?/, '').replace(/進行$/, '')} />
            <Stat label="近中心風速" value={cur.wind} unit="m/s" sub={cur.windLevel ? `${cur.windLevel} 級` : null} />
            <Stat label="瞬間陣風" value={cur.gust} unit="m/s" sub={cur.gustLevel ? `${cur.gustLevel} 級` : null} />
            <Stat label="七級暴風半徑" value={cur.r7} unit="km" color={C.amber} sub={quadText(cur.r7quad)} />
            <Stat label="十級暴風半徑" value={cur.r10} unit="km" color={C.red} sub={quadText(cur.r10quad)} />
          </View>
          <Beaufort mean={cur.windLevel} gust={cur.gustLevel} />
          {cur.location ? <Text style={[S.note, { marginTop: 10 }]}>{cur.location}。{w?.forecastText ? `${w.forecastText}。` : ''}</Text> : null}
          {w?.summary ? <Text style={[S.note, { marginTop: 6 }]}>{w.summary}</Text> : null}
        </Card>
      ) : null}

      {fc.length ? (
        <Card>
          <CardHead label="路徑潛勢預報" src={`氣象署 · ${fmtTime(d.forecast?.issued)} 起報`} />
          <View style={[S.row, { borderBottomWidth: 1, borderColor: C.line, paddingBottom: 4 }]}>
            {['時間', '位置', '氣壓', '風速', '70%'].map((h, i) => (
              <Text key={h} style={[S.label, { flex: i === 1 ? 1.6 : 1, textAlign: i ? 'right' : 'left' }]}>{h}</Text>
            ))}
          </View>
          {fc.map((f) => (
            <View key={f.time} style={[S.row, { paddingVertical: 5, borderBottomWidth: 1, borderColor: '#182f3e' }]}>
              <Text style={[S.mono, { flex: 1, fontSize: 12 }]}>{fmtDayHour(f.time)}</Text>
              <Text style={[S.mono, { flex: 1.6, fontSize: 12, textAlign: 'right' }]}>{f.lat.toFixed(1)}N {f.lon.toFixed(1)}E</Text>
              <Text style={[S.mono, { flex: 1, fontSize: 12, textAlign: 'right' }]}>{f.pressure ?? '-'}</Text>
              <Text style={[S.mono, { flex: 1, fontSize: 12, textAlign: 'right' }]}>{f.wind ?? '-'}</Text>
              <Text style={[S.mono, { flex: 1, fontSize: 12, textAlign: 'right', color: C.amber }]}>{f.r70 ?? '-'}</Text>
            </View>
          ))}
          <Text style={[S.note, { marginTop: 6 }]}>移向：{fc.map((f) => moveC(f.move)).slice(0, 4).join(' → ')}{d.forecast?.extratropical ? `。${d.forecast.extratropical}` : ''}</Text>
        </Card>
      ) : null}

      <Card>
        <CardHead label="資料來源與更新時間" />
        {Object.entries(SOURCE_NAMES).map(([k, n]) => {
          const s = d.sources?.[k];
          return (
            <View key={k} style={[S.between, { paddingVertical: 3 }]}>
              <Text style={S.text}>{n}</Text>
              <Text style={{ color: s?.ok ? C.mute : C.amber, fontFamily: 'monospace', fontSize: 12 }}>
                {s ? (s.ok ? `${ago(s.at, now)}` : `抓取失敗，沿用 ${fmtTime(s.lastOk)}`) : '-'}
              </Text>
            </View>
          );
        })}
        <Text style={[S.note, { marginTop: 6 }]}>資料每 30 分鐘自動抓取一次，最終以中央氣象署與各縣市政府公告為準。</Text>
      </Card>
    </View>
  );
}

const SOURCE_NAMES: Record<string, string> = {
  warning: '氣象署 颱風警報', news: '氣象署 路徑潛勢、侵襲機率', wpps: '氣象署 風雨預報', dgpa: '人事行政總處 停班停課', rain: '氣象署 實測雨量',
};

const quadText = (q: Record<string, number | undefined>) => {
  const v = Object.values(q).filter((x): x is number => x != null);
  if (!v.length) return null;
  if (v.every((x) => x === v[0])) return '四象限相同';
  const n: Record<string, string> = { NW: '西北', NE: '東北', SW: '西南', SE: '東南' };
  return Object.entries(q).map(([k, x]) => `${n[k]}${x}`).join(' ');
};

function Beaufort({ mean, gust }: { mean: number | null; gust: number | null }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 2, marginTop: 4 }}>
        {Array.from({ length: 17 }, (_, i) => i + 1).map((i) => (
          <View key={i} style={{ flex: 1, height: 10, backgroundColor: mean && i <= mean ? C.cyan : gust && i <= gust ? C.mag : C.panel2 }} />
        ))}
      </View>
      <View style={S.between}>
        <Text style={{ color: C.mute, fontSize: 10, fontFamily: 'monospace' }}>蒲福 1</Text>
        <Text style={{ color: C.mute, fontSize: 10, fontFamily: 'monospace' }}>平均 {mean ?? '-'} 級 · 陣風 {gust ?? '-'} 級</Text>
      </View>
    </View>
  );
}
