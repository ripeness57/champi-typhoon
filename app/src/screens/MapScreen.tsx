import { useEffect, useMemo, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polyline, Text as SvgText } from 'react-native-svg';
import type { TyphoonData } from '../types';
import { C, PROB, S, probBin } from '../theme';
import { Btn, Card } from '../ui';
import { COUNTIES, at, buildPath, fmtTime, hav, probOf } from '../logic';
import { NBGEO, TWGEO } from '../geo';

type Bounds = { lo0: number; lo1: number; la0: number; la1: number };
const TAIWAN: Bounds = { lo0: 118.2, lo1: 123.6, la0: 21.6, la1: 26.4 };

export default function MapScreen({ d }: { d: TyphoonData }) {
  const path = useMemo(() => buildPath(d), [d]);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState<'all' | 'tw'>('all');
  const nowT = useMemo(() => {
    const obs = path.filter((p) => p.obs);
    return obs.length ? obs[obs.length - 1].t : path[0]?.t || 0;
  }, [path]);
  // null 表示跟著「現在」（最新觀測點）
  const [tSel, setT] = useState<number | null>(null);
  const t = tSel ?? nowT;
  const [playing, setPlaying] = useState(false);

  // 時間軸從現在往前 48 小時開始，避免大半段都是很早的觀測
  const t0 = Math.max(path[0]?.t || 0, nowT - 48 * 3600e3), t1 = path[path.length - 1]?.t || 1;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setT((x) => {
        const n = (x ?? nowT) + 3 * 3600e3;
        if (n >= t1) { setPlaying(false); return t1; }
        return n;
      });
    }, 120);
    return () => clearInterval(id);
  }, [playing, t1, nowT]);

  const B: Bounds = useMemo(() => {
    if (zoom === 'tw' || !path.length) return TAIWAN;
    // 以台灣為中心，只往外擴到預報路徑；很早的觀測點會畫在範圍外
    const fc = path.filter((p) => !p.obs);
    const lons = fc.map((p) => p.lon), lats = fc.map((p) => p.lat);
    return {
      lo0: 116.6,
      lo1: Math.min(134, Math.max(129, ...lons.map((x) => x + 1.5))),
      la0: 17.8,
      la1: Math.min(35, Math.max(28, ...lats.map((x) => x + 1.5))),
    };
  }, [path, zoom]);

  const COS = Math.cos((((B.la0 + B.la1) / 2) * Math.PI) / 180);
  const k = width ? width / ((B.lo1 - B.lo0) * COS) : 1;
  const height = width ? Math.min((B.la1 - B.la0) * k, width * 1.35) : 0;
  const X = (lon: number) => (lon - B.lo0) * COS * k;
  const Y = (lat: number) => (B.la1 - lat) * k;
  const R = (km: number) => (km / 111.2) * k;

  const ringPath = (ring: number[][]) => ring.map((q, i) => `${i ? 'L' : 'M'}${X(q[0]).toFixed(1)},${Y(q[1]).toFixed(1)}`).join('') + 'Z';

  const cur = at(path, t);
  const obsPts = path.filter((p) => p.obs);
  const fcPts = [obsPts[obsPts.length - 1], ...path.filter((p) => !p.obs)].filter(Boolean);
  const cone = useMemo(() => {
    const out: { x: number; y: number; r: number }[] = [];
    const fcs = path.filter((p) => !p.obs);
    if (!fcs.length) return out;
    for (let tt = nowT; tt <= fcs[fcs.length - 1].t; tt += 3 * 3600e3) {
      const p = at(path, tt);
      if (p && p.r70 > 0) out.push({ x: p.lon, y: p.lat, r: p.r70 });
    }
    return out;
  }, [path, nowT]);

  const [barW, setBarW] = useState(1);
  const pan = useMemo(() => {
    const scrub = (x: number) => {
      setPlaying(false);
      const f = Math.min(1, Math.max(0, x / barW));
      setT(t0 + f * (t1 - t0));
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => scrub(e.nativeEvent.locationX),
      onPanResponderMove: (e) => scrub(e.nativeEvent.locationX),
    });
  }, [t0, t1, barW]);

  const inR7 = cur ? COUNTIES.filter((c) => hav(cur.lat, cur.lon, c.lat, c.lon) <= cur.r7) : [];
  const inR10 = cur ? COUNTIES.filter((c) => hav(cur.lat, cur.lon, c.lat, c.lon) <= cur.r10) : [];
  const dist = (lat: number, lon: number) => (cur ? `${Math.round(hav(cur.lat, cur.lon, lat, lon))} km` : '-');

  return (
    <View>
      <View style={[S.row, { flexWrap: 'wrap' }]}>
        <Btn label="全域" on={zoom === 'all'} onPress={() => setZoom('all')} />
        <Btn label="台灣近海" on={zoom === 'tw'} onPress={() => setZoom('tw')} />
      </View>
      <View style={{ backgroundColor: C.panel, borderWidth: 1, borderColor: C.line }} onLayout={(e) => setWidth(e.nativeEvent.layout.width - 2)}>
        {width ? (
          <Svg width={width} height={height}>
            {NBGEO.map((ring, i) => (
              <Path key={`nb${i}`} d={ringPath(ring)} fill="#10222e" stroke={C.line2} strokeWidth={0.8} />
            ))}
            {Object.entries(TWGEO).map(([name, rings]) => (
              <Path key={name} d={rings.map(ringPath).join('')} fill={PROB[probBin(probOf(d, name))]} stroke={C.ink} strokeWidth={0.6} />
            ))}
            <G opacity={0.2}>
              {cone.map((c, i) => <Circle key={i} cx={X(c.x)} cy={Y(c.y)} r={R(c.r)} fill={C.amber} />)}
            </G>
            <Polyline points={obsPts.map((p) => `${X(p.lon)},${Y(p.lat)}`).join(' ')} fill="none" stroke="#fff" strokeWidth={2} />
            <Polyline points={fcPts.map((p) => `${X(p.lon)},${Y(p.lat)}`).join(' ')} fill="none" stroke={C.amber} strokeWidth={2} strokeDasharray="6,5" />
            {path.map((p) => (
              <Circle key={p.t} cx={X(p.lon)} cy={Y(p.lat)} r={p.obs ? 2.5 : 3.5} fill={p.obs ? '#fff' : C.ink} stroke={p.obs ? '#fff' : C.amber} strokeWidth={1.5} />
            ))}
            {path.filter((p) => !p.obs).map((p) => (
              <SvgText key={`l${p.t}`} x={X(p.lon) + 6} y={Y(p.lat) + 4} fill={C.amber} fontSize={10} fontFamily="monospace">
                {new Date(p.t + 8 * 3600e3).getUTCDate()}日{String(new Date(p.t + 8 * 3600e3).getUTCHours()).padStart(2, '0')}
              </SvgText>
            ))}
            {cur ? (
              <G>
                <Circle cx={X(cur.lon)} cy={Y(cur.lat)} r={R(cur.r7)} fill="rgba(242,169,59,0.08)" stroke={C.amber} strokeWidth={1.5} />
                <Circle cx={X(cur.lon)} cy={Y(cur.lat)} r={R(cur.r10)} fill="rgba(255,90,78,0.10)" stroke={C.red} strokeWidth={1.5} />
                <Line x1={X(cur.lon) - 7} y1={Y(cur.lat)} x2={X(cur.lon) + 7} y2={Y(cur.lat)} stroke="#fff" strokeWidth={2} />
                <Line x1={X(cur.lon)} y1={Y(cur.lat) - 7} x2={X(cur.lon)} y2={Y(cur.lat) + 7} stroke="#fff" strokeWidth={2} />
              </G>
            ) : null}
          </Svg>
        ) : null}

        <View style={[S.row, { padding: 10, borderTopWidth: 1, borderColor: C.line }]}>
          <Pressable onPress={() => { if (t >= t1) setT(t0); setPlaying((x) => !x); }} style={[S.btn, { marginBottom: 0 }]}>
            <Text style={S.btnText}>{playing ? '暫停' : '播放'}</Text>
          </Pressable>
          <View
            style={{ flex: 1, height: 32, justifyContent: 'center', marginHorizontal: 8 }}
            onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
            {...pan.panHandlers}
          >
            <View style={{ height: 4, backgroundColor: C.panel2 }}>
              <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${((nowT - t0) / (t1 - t0 || 1)) * 100}%`, backgroundColor: '#ffffff44' }} />
            </View>
            <View style={{ position: 'absolute', left: `${((t - t0) / (t1 - t0 || 1)) * 100}%`, marginLeft: -8, width: 16, height: 16, borderRadius: 8, backgroundColor: C.amber }} />
          </View>
          <Pressable onPress={() => { setPlaying(false); setT(null); }}>
            <Text style={{ color: C.fg, fontFamily: 'monospace', fontSize: 12.5 }}>{fmtTime(new Date(t).toISOString())}</Text>
            <Text style={{ color: cur?.obs ? C.fg : C.amber, fontSize: 11, textAlign: 'right' }}>{t <= nowT ? '觀測' : '預報'} · 點此回現在</Text>
          </Pressable>
        </View>
      </View>

      <View style={[S.row, { flexWrap: 'wrap', marginVertical: 10 }]}>
        <Legend color="#fff" text="觀測路徑" />
        <Legend color={C.amber} text="氣象署預報" dashed />
        <Legend color={C.amber} text="70% 機率圈" fill />
        <Legend color={C.amber} text="七級風圈" />
        <Legend color={C.red} text="十級風圈" />
      </View>

      <Card>
        <Text style={[S.label, { marginBottom: 8 }]}>時間軸讀數</Text>
        {cur ? (
          <>
            <Read k="中心" v={`${cur.lat.toFixed(1)}°N ${cur.lon.toFixed(1)}°E`} />
            <Read k="距台北" v={dist(25.05, 121.56)} />
            <Read k="距宜蘭" v={dist(24.68, 121.73)} />
            <Read k="距花蓮" v={dist(23.85, 121.53)} />
            <Read k="七級／十級半徑" v={`${Math.round(cur.r7)} / ${Math.round(cur.r10)} km`} />
            <Text style={[S.note, { marginTop: 8 }]}>
              七級風圈內：{inR7.length ? <Text style={{ color: C.red }}>{inR7.map((c) => c.n).join('、')}</Text> : '無'}
              {inR10.length ? `\n十級風圈內：${inR10.map((c) => c.n).join('、')}` : ''}
            </Text>
            <Text style={[S.note, { marginTop: 4, fontSize: 11 }]}>以中心到縣市代表點的距離估算，點與點之間為內插。</Text>
          </>
        ) : (
          <Text style={S.note}>沒有路徑資料</Text>
        )}
      </Card>

      <View style={[S.row, { flexWrap: 'wrap' }]}>
        {['<50%', '50%', '70%', '90%', '100%'].map((l, i) => (
          <View key={l} style={[S.row, { marginRight: 12, marginBottom: 4 }]}>
            <View style={{ width: 12, height: 12, backgroundColor: PROB[i], marginRight: 5 }} />
            <Text style={{ color: C.mute, fontSize: 11.5 }}>{l}</Text>
          </View>
        ))}
      </View>
      <Text style={[S.note, { fontSize: 11.5 }]}>縣市顏色為氣象署 {d.forecast?.probability?.hours || 120} 小時暴風侵襲機率。</Text>
    </View>
  );
}

function Read({ k, v }: { k: string; v: string }) {
  return (
    <View style={[S.between, { paddingVertical: 2 }]}>
      <Text style={{ color: C.mute, fontSize: 13 }}>{k}</Text>
      <Text style={{ color: C.fg, fontFamily: 'monospace', fontSize: 13 }}>{v}</Text>
    </View>
  );
}

function Legend({ color, text, dashed, fill }: { color: string; text: string; dashed?: boolean; fill?: boolean }) {
  return (
    <View style={[S.row, { marginRight: 12, marginBottom: 4 }]}>
      {fill ? (
        <View style={{ width: 12, height: 12, backgroundColor: 'rgba(242,169,59,.25)', borderWidth: 1, borderColor: color, borderStyle: 'dashed', marginRight: 5 }} />
      ) : (
        <View style={{ width: 18, borderTopWidth: 2, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid', marginRight: 5 }} />
      )}
      <Text style={{ color: C.mute, fontSize: 11.5 }}>{text}</Text>
    </View>
  );
}
