import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import { C, MONO, S } from '../theme';
import { comma, fetchSeries, md, signed, type Series, type StockRow } from '../stocks';

// 台股慣例：紅色是漲、買超，綠色是跌、賣超
export const tone = (n: number | null | undefined) => (n == null || n === 0 ? C.dim : n > 0 ? C.red : C.ok);
export const pct = (n: number | null | undefined, digits = 1) => (n == null ? '-' : `${signed(n, digits)}%`);
export const TAG_COLOR: Record<string, string> = { 大戶跑: C.amber, 大戶進: C.cyan, 疑似出貨: C.amber, 大戶進駐: C.cyan, 轉強: C.red, 轉弱: C.ok };

export function Tag({ text, color, dashed }: { text: string; color: string; dashed?: boolean }) {
  return (
    <View style={{ borderWidth: 1, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, marginRight: 5 }}>
      <Text style={{ color, fontSize: 12 }}>{text}</Text>
    </View>
  );
}

function Arrow({ dir, color }: { dir: number; color: string }) {
  const d = dir > 0 ? 'M2 10 L10 2 M4.5 2 H10 V7.5' : dir < 0 ? 'M2 2 L10 10 M4.5 10 H10 V4.5' : 'M2 6 H10';
  return (
    <Svg width={13} height={13} viewBox="0 0 12 12">
      <Path d={d} stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16">
      <Path d={open ? 'M3 10.5 L8 5.5 L13 10.5' : 'M3 5.5 L8 10.5 L13 5.5'} stroke={C.mute} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// 三顆燈依序是外資、投信、自營商：圓點是當日買賣超，箭頭是近 5 日合計
function Lights({ s }: { s: StockRow }) {
  return (
    <View style={{ flexDirection: 'row', width: 62, justifyContent: 'space-between', marginRight: 10 }}>
      {[s.f, s.t, s.d].map(([today, five], i) => (
        <View key={i} style={{ alignItems: 'center' }}>
          <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: tone(today), marginBottom: 4 }} />
          <Arrow dir={Math.sign(five)} color={tone(five)} />
        </View>
      ))}
    </View>
  );
}

export function Mini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: C.mute, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: color || C.fg, fontFamily: MONO, fontSize: 14 }}>{value}</Text>
    </View>
  );
}

const small = { color: C.mute, fontSize: 11 };

// 近 60 日收盤價（含月線）與三大法人每日買賣超。資料在點開時才抓，換一檔要用 key 重新建立這個元件。
function Chart({ code, ver }: { code: string; ver: string }) {
  const [w, setW] = useState(0);
  const [s, setS] = useState<Series | null | undefined>(undefined); // undefined 是載入中，null 是沒有資料
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let on = true;
    fetchSeries(code, ver).then((x) => { if (on) setS(x); }).catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, [code, ver]);

  if (failed) return <Text style={[small, { marginBottom: 10 }]}>走勢圖載入失敗，收起來再點開可以重試。</Text>;
  if (s === undefined) return <Text style={[small, { marginBottom: 10 }]}>走勢圖載入中…</Text>;
  const vals = s ? s.c.filter((v): v is number => v != null) : [];
  if (!s || vals.length < 2) return null;

  const n = s.c.length;
  const hi = Math.max(...vals), lo = Math.min(...vals);
  const PH = 92, BH = 44;
  const x = (i: number) => 2 + (i / (n - 1)) * (w - 4);
  const y = (v: number) => 4 + (1 - (v - lo) / (hi - lo || 1)) * (PH - 8);
  const price = s.c.map((v, i) => (v == null ? '' : `${x(i)},${y(v)}`)).filter(Boolean).join(' ');
  // 月線：20 日平均
  const month: string[] = [];
  for (let i = 19; i < n; i++) {
    const win = s.c.slice(i - 19, i + 1);
    if (win.every((v) => v != null)) month.push(`${x(i)},${y((win as number[]).reduce((a, b) => a + b, 0) / 20)}`);
  }
  const top = Math.max(1, ...s.i.map(Math.abs));
  const bw = Math.max(1, ((w - 4) / n) * 0.62);
  const last = s.c[n - 1];

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ marginBottom: 10 }}>
      <View style={S.between}>
        <Text style={small}>近 {n} 日股價　<Text style={{ color: C.cyan }}>━</Text> 收盤　<Text style={{ color: C.amber }}>┅</Text> 月線</Text>
        <Text style={[small, { fontFamily: MONO }]}>高 {comma(hi)}　低 {comma(lo)}</Text>
      </View>
      {w > 0 ? (
        <Svg width={w} height={PH}>
          <Polyline points={month.join(' ')} fill="none" stroke={C.amber} strokeWidth={1} strokeDasharray="3 3" />
          <Polyline points={price} fill="none" stroke={C.cyan} strokeWidth={1.6} strokeLinejoin="round" />
          {last != null ? <Circle cx={x(n - 1)} cy={y(last)} r={2.6} fill={C.cyan} /> : null}
        </Svg>
      ) : <View style={{ height: PH }} />}
      <View style={[S.between, { marginTop: 4 }]}>
        <Text style={small}>法人每日買賣超</Text>
        <Text style={[small, { fontFamily: MONO }]}>單日最多 {comma(top)} 張</Text>
      </View>
      {w > 0 ? (
        <Svg width={w} height={BH}>
          <Line x1={0} x2={w} y1={BH / 2} y2={BH / 2} stroke={C.line2} strokeWidth={1} />
          {s.i.map((v, i) => {
            if (!v) return null;
            const h = Math.max(1, (Math.abs(v) / top) * (BH / 2 - 1));
            return <Rect key={i} x={x(i) - bw / 2} y={v > 0 ? BH / 2 - h : BH / 2} width={bw} height={h} fill={tone(v)} />;
          })}
        </Svg>
      ) : <View style={{ height: BH }} />}
      <View style={S.between}>
        <Text style={[small, { fontFamily: MONO }]}>{md(s.dates[0])}</Text>
        <Text style={[small, { fontFamily: MONO }]}>{md(s.dates[n - 1])}</Text>
      </View>
    </View>
  );
}

function StockDetail({ code, s, ver }: { code: string; s: StockRow; ver: string }) {
  const rows: [string, [number, number]][] = [['外資', s.f], ['投信', s.t], ['自營商', s.d]];
  const cell = { width: 84, textAlign: 'right' as const, fontFamily: MONO, fontSize: 13 };
  const head = { width: 84, textAlign: 'right' as const, color: C.mute, fontSize: 11 };
  return (
    <View style={{ backgroundColor: C.panel2, borderRadius: 4, padding: 10, marginBottom: 10 }}>
      <Chart key={`${code}:${ver}`} code={code} ver={ver} />

      <View style={S.row}>
        <Text style={{ flex: 1, color: C.mute, fontSize: 11 }}>法人買賣超（張）</Text>
        <Text style={head}>當日</Text>
        <Text style={head}>近 5 日</Text>
      </View>
      {rows.map(([name, [today, five]]) => (
        <View key={name} style={[S.row, { marginTop: 3 }]}>
          <Text style={{ flex: 1, color: C.fg, fontSize: 13 }}>{name}</Text>
          <Text style={[cell, { color: tone(today) }]}>{signed(today)}</Text>
          <Text style={[cell, { color: tone(five) }]}>{signed(five)}</Text>
        </View>
      ))}
      <Text style={{ color: C.mute, fontSize: 12, marginTop: 6 }}>
        近 5 日合計佔成交量 <Text style={{ color: tone(s.i5), fontFamily: MONO }}>{pct(s.i5)}</Text>
        {Math.abs(s.sd) >= 2 ? `，已連${s.sd > 0 ? '買' : '賣'} ${Math.abs(s.sd)} 日` : ''}
      </Text>

      <View style={[S.row, { marginTop: 10 }]}>
        <Mini label="5 日漲跌" value={pct(s.r5)} color={tone(s.r5)} />
        <Mini label="20 日漲跌" value={pct(s.r20)} color={tone(s.r20)} />
        <Mini label="距月線" value={pct(s.ma)} color={tone(s.ma)} />
        <Mini label="量比" value={s.vr == null ? '-' : `${s.vr} 倍`} />
      </View>
      <View style={[S.row, { marginTop: 8 }]}>
        <Mini label="成交量（張）" value={comma(s.v)} />
        <Mini label="融資（張）" value={s.mg ? comma(s.mg[0]) : '-'} />
        <Mini label="融資 5 日" value={pct(s.mg?.[1])} color={tone(s.mg?.[1])} />
        <Mini label="大戶持股" value={s.big ? `${s.big[0]}%` : '-'} />
      </View>
      {s.big?.[1] != null ? (
        <Text style={{ color: C.mute, fontSize: 12, marginTop: 6 }}>
          400 張以上大戶持股比上週 <Text style={{ color: tone(s.big[1]), fontFamily: MONO }}>{signed(s.big[1], 2)}</Text> 個百分點
        </Text>
      ) : null}
      {s.avoid.length ? (
        <Text style={{ color: '#ff9c94', fontSize: 12.5, marginTop: 8, lineHeight: 18 }}>避開原因：{s.avoid.join('、')}</Text>
      ) : null}
    </View>
  );
}

// 一檔股票一列，點名稱那一側展開明細，星號加入自選。note 是排行用的補充數字。
export function StockLine({ code, s, ver, fav, open, note, onFav, onOpen }: {
  code: string; s: StockRow; ver: string; fav: boolean; open: boolean; note?: string; onFav: () => void; onOpen: () => void;
}) {
  return (
    <View style={{ borderTopWidth: 1, borderColor: C.line }}>
      <View style={S.row}>
        <Pressable onPress={onOpen} style={[S.row, { flex: 1, paddingVertical: 10 }]} accessibilityRole="button" accessibilityState={{ expanded: open }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.fg, fontSize: 17, fontWeight: '700' }}>{s.n}</Text>
            <View style={[S.row, { flexWrap: 'wrap', marginTop: 4 }]}>
              <Text style={{ color: C.mute, fontFamily: MONO, fontSize: 13, marginRight: 6 }}>{code}</Text>
              {s.tags.map((t) => <Tag key={t} text={t} color={TAG_COLOR[t] || C.mute} />)}
              {s.avoid.length ? <Tag text={`避開×${s.avoid.length}`} color="#ff8f87" dashed /> : null}
            </View>
            {note ? <Text style={{ color: C.mute, fontSize: 12, marginTop: 3 }}>{note}</Text> : null}
          </View>
          <Lights s={s} />
          <View style={{ width: 78, alignItems: 'flex-end' }}>
            <Text style={{ color: C.fg, fontFamily: MONO, fontSize: 16 }}>{comma(s.c)}</Text>
            <Text style={{ color: tone(s.p), fontFamily: MONO, fontSize: 13 }}>{s.p == null ? '—' : `${signed(s.p, 2)}%`}</Text>
          </View>
        </Pressable>
        <Pressable onPress={onFav} hitSlop={10} style={{ paddingLeft: 10, paddingVertical: 10 }} accessibilityRole="button" accessibilityLabel={fav ? `把${s.n}移出自選` : `把${s.n}加入自選`}>
          <Text style={{ color: fav ? C.amber : C.dim, fontSize: 20 }}>{fav ? '★' : '☆'}</Text>
        </Pressable>
      </View>
      {open ? <StockDetail code={code} s={s} ver={ver} /> : null}
    </View>
  );
}

export function ListHead() {
  return (
    <View style={[S.row, { marginBottom: 6 }]}>
      <Text style={{ flex: 1, color: C.mute, fontSize: 12 }}>股票</Text>
      <Text style={{ width: 62, marginRight: 10, color: C.mute, fontSize: 12, textAlign: 'center' }}>燈號</Text>
      <Text style={{ width: 78, color: C.mute, fontSize: 12, textAlign: 'right' }}>收盤／今日</Text>
      <View style={{ width: 30 }} />
    </View>
  );
}
