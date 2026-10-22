import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { TyphoonData } from '../types';
import { C, PROB, S, probBin } from '../theme';
import { Btn, Chip } from '../ui';
import { COUNTIES, closureOf, fmtTime, maxGust, probOf, rainHit, windHit } from '../logic';

type Filter = 'all' | 'hit' | 'off';

export default function CountiesScreen({ d, myCounty, onPick }: { d: TyphoonData; myCounty: string | null; onPick: (c: string) => void }) {
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(() => COUNTIES.map((c) => {
    const p = probOf(d, c.n);
    const cl = closureOf(d, c.n);
    const obs = d.rainObs?.counties.find((x) => x.county === c.n);
    const r24 = d.rain24?.areas.find((a) => a.name === c.n);
    return { n: c.n, p, cl, wind: windHit(d, c.n), rain: rainHit(d, c.n), gust: maxGust(d, c.n), obs, r24 };
  }).sort((a, b) => (b.n === myCounty ? 1 : 0) - (a.n === myCounty ? 1 : 0) || (b.p ?? -1) - (a.p ?? -1)), [d, myCounty]);

  const shown = rows.filter((r) => filter === 'all' || (filter === 'hit' ? r.wind || r.rain : r.cl.status === 'off' || r.cl.status === 'partial'));

  return (
    <View>
      <Text style={S.h2}>各縣市侵襲機率與停班課</Text>
      <View style={[S.row, { flexWrap: 'wrap' }]}>
        <Btn label="全部" on={filter === 'all'} onPress={() => setFilter('all')} />
        <Btn label="達風雨參考標準" on={filter === 'hit'} onPress={() => setFilter('hit')} />
        <Btn label="已宣布停班課" on={filter === 'off'} onPress={() => setFilter('off')} />
      </View>
      <Text style={[S.note, { marginBottom: 10 }]}>
        停班課：人事行政總處 {fmtTime(d.closures?.updated)}。風力、雨量依氣象署風雨預報（{fmtTime(d.wind?.issued)}）自動判定：任一時段平均風 7 級或陣風 10 級；24 小時雨量下限達山區 200 mm 或平地 350 mm（台北市一律 350 mm）。最終以各縣市政府公告為準。長按縣市可設為「我的縣市」。
      </Text>
      {shown.map((r) => {
        const mine = r.n === myCounty;
        return (
          <Pressable key={r.n} onLongPress={() => onPick(r.n)} delayLongPress={350}
            style={[S.card, { borderLeftWidth: 4, borderLeftColor: PROB[probBin(r.p)], padding: 12, marginBottom: 9 }, mine && { borderColor: C.cyan }]}>
            <View style={S.between}>
              <Text style={{ color: C.fg, fontSize: 16, fontWeight: '700' }}>{r.n}{mine ? <Text style={{ color: C.cyan, fontSize: 12 }}>  我的縣市</Text> : null}</Text>
              <Text style={{ color: C.fg, fontFamily: 'monospace', fontSize: 20 }}>{r.p ?? '-'}<Text style={{ fontSize: 11, color: C.mute }}>%</Text></Text>
            </View>
            <View style={[S.row, { flexWrap: 'wrap', marginTop: 6 }]}>
              {r.wind ? <Chip text="風力達標" color={C.amber} /> : <Chip text={`陣風 ${r.gust ?? '-'} 級`} />}
              {r.rain ? <Chip text="雨量達標" color={C.cyan} /> : r.r24 ? <Chip text={`24h ${r.r24.mtn !== '-' ? r.r24.mtn : r.r24.flat} mm`} /> : null}
              {r.cl.status === 'off' ? <Chip text="停班停課" color={C.red} /> : r.cl.status === 'partial' ? <Chip text="部分停班課" color={C.red} /> : r.cl.status === 'normal' ? <Chip text="照常上班上課" color={C.ok} /> : null}
              {r.obs ? <Chip text={`實測 24h ${r.obs.max24} mm`} /> : null}
            </View>
            {r.cl.items.length ? (
              <Text style={{ color: r.cl.status === 'off' ? '#ffb3ad' : C.mute, fontSize: 12, lineHeight: 18 }}>{r.cl.items.join('\n')}</Text>
            ) : (
              <Text style={{ color: C.dim, fontSize: 12 }}>尚無停班課公告</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
