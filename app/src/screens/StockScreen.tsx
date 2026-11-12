import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Line, Path, Polyline } from 'react-native-svg';
import { C, MONO, S } from '../theme';
import { Btn } from '../ui';
import { comma, md, signed, type Sector, type StockData, type StockRow } from '../stocks';

// 台股慣例：紅色是漲、買超，綠色是跌、賣超
const tone = (n: number | null | undefined) => (n == null || n === 0 ? C.dim : n > 0 ? C.red : C.ok);
const scoreColor = (s: number) => (s >= 60 ? '#b8433b' : s >= 40 ? '#8a6a2a' : '#2f6f58');
const TAG_COLOR: Record<string, string> = { 大戶跑: C.amber, 大戶進: C.cyan, 疑似出貨: C.amber, 大戶進駐: C.cyan, 轉強: C.red, 轉弱: C.ok };
const SECTOR_TAGS = ['疑似出貨', '大戶進駐', '轉強', '轉弱'];

function Tag({ text, color, dashed }: { text: string; color: string; dashed?: boolean }) {
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

function Chevron({ open }: { open: boolean }) {
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

function Move({ n }: { n: number | null }) {
  if (n == null) return <Text>-</Text>;
  if (n === 0) return <Text>持平</Text>;
  return <Text style={{ color: tone(n) }}>{n > 0 ? '▲' : '▼'}{Math.abs(n)}</Text>;
}

function Spark({ hist }: { hist: number[] }) {
  const [w, setW] = useState(0);
  const h = 36;
  const y = (v: number) => h - 2 - (Math.max(0, Math.min(100, v)) / 100) * (h - 4);
  const pts = hist.map((v, i) => `${2 + (i / Math.max(1, hist.length - 1)) * (w - 4)},${y(v)}`).join(' ');
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: h }}>
      {w > 0 && hist.length > 1 ? (
        <Svg width={w} height={h}>
          <Line x1={0} x2={w} y1={y(50)} y2={y(50)} stroke={C.line2} strokeWidth={1} strokeDasharray="3 3" />
          <Polyline points={pts} fill="none" stroke={C.cyan} strokeWidth={1.6} strokeLinejoin="round" />
        </Svg>
      ) : null}
    </View>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: C.mute, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: color || C.fg, fontFamily: MONO, fontSize: 14 }}>{value}</Text>
    </View>
  );
}

const pct = (n: number | null | undefined, digits = 1) => (n == null ? '-' : `${signed(n, digits)}%`);

function StockDetail({ s }: { s: StockRow }) {
  const rows: [string, [number, number]][] = [['外資', s.f], ['投信', s.t], ['自營商', s.d]];
  const cell = { width: 84, textAlign: 'right' as const, fontFamily: MONO, fontSize: 13 };
  const head = { width: 84, textAlign: 'right' as const, color: C.mute, fontSize: 11 };
  return (
    <View style={{ backgroundColor: C.panel2, borderRadius: 4, padding: 10, marginBottom: 10 }}>
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
        <Mini label="成交量" value={`${comma(s.v)} 張`} />
        <Mini label="融資餘額" value={s.mg ? `${comma(s.mg[0])} 張` : '-'} />
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

function StockLine({ code, s, fav, open, onFav, onOpen }: { code: string; s: StockRow; fav: boolean; open: boolean; onFav: () => void; onOpen: () => void }) {
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
      {open ? <StockDetail s={s} /> : null}
    </View>
  );
}

function SectorCard({ sec, d, codes, open, brief, onToggle, favs, onFav, detail, onDetail }: {
  sec: Sector; d: StockData; codes: string[]; open: boolean; brief: boolean; onToggle: () => void;
  favs: Set<string>; onFav: (code: string) => void; detail: string | null; onDetail: (key: string) => void;
}) {
  return (
    <View style={[S.card, { padding: 12, marginBottom: 9 }]}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={S.row}>
          <View style={{ flex: 1 }}>
            <View style={[S.row, { flexWrap: 'wrap' }]}>
              <Text style={{ color: C.fg, fontSize: 17, fontWeight: '700', marginRight: 8 }}>{sec.name}</Text>
              {sec.tag ? <Tag text={sec.tag} color={TAG_COLOR[sec.tag] || C.mute} /> : null}
            </View>
            <Text style={{ color: C.mute, fontSize: 12.5, marginTop: 3 }}>
              20 日排名 {sec.rank}・昨 <Move n={sec.d1} />・5 天 <Move n={sec.d5} />
            </Text>
          </View>
          <View style={{ alignItems: 'center', width: 48 }}>
            <Text style={{ color: C.fg, fontFamily: MONO, fontSize: 14 }}>{sec.n ? Math.round((sec.up / sec.n) * 100) : 0}%</Text>
            <Text style={{ color: C.mute, fontFamily: MONO, fontSize: 12 }}>{sec.up}/{sec.n}</Text>
          </View>
          <Text style={{ color: C.fg, fontFamily: MONO, fontSize: 18, width: 52, textAlign: 'right', marginRight: 8 }}>{sec.score.toFixed(1)}</Text>
          <Chevron open={open} />
        </View>
        <View style={{ height: 4, backgroundColor: C.panel2, borderRadius: 2, marginTop: 9 }}>
          <View style={{ width: `${Math.max(2, Math.min(100, sec.score))}%`, height: 4, borderRadius: 2, backgroundColor: scoreColor(sec.score) }} />
        </View>
      </Pressable>

      {open ? (
        <View style={{ marginTop: 12 }}>
          {brief ? null : (
            <>
              <View style={S.row}>
                <Mini label="今日平均" value={pct(sec.p, 2)} color={tone(sec.p)} />
                <Mini label="5 日" value={pct(sec.r5)} color={tone(sec.r5)} />
                <Mini label="20 日" value={pct(sec.r20)} color={tone(sec.r20)} />
                <Mini label="法人 5 日" value={pct(sec.flow5)} color={tone(sec.flow5)} />
              </View>
              <Text style={{ color: C.mute, fontSize: 11, marginTop: 10 }}>近 {sec.hist.length} 日分數走勢（虛線是 50 分）</Text>
              <Spark hist={sec.hist} />
            </>
          )}
          <View style={[S.row, { marginTop: brief ? 0 : 8, marginBottom: 6 }]}>
            <Text style={{ flex: 1, color: C.mute, fontSize: 12 }}>股票</Text>
            <Text style={{ width: 62, marginRight: 10, color: C.mute, fontSize: 12, textAlign: 'center' }}>燈號</Text>
            <Text style={{ width: 78, color: C.mute, fontSize: 12, textAlign: 'right' }}>收盤／今日</Text>
            <View style={{ width: 30 }} />
          </View>
          {codes.map((code) => {
            const key = `${sec.id}:${code}`;
            return (
              <StockLine key={code} code={code} s={d.stocks[code]} fav={favs.has(code)} open={detail === key}
                onFav={() => onFav(code)} onOpen={() => onDetail(key)} />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function Help({ d }: { d: StockData }) {
  const r = d.rule;
  const items: [string, string][] = [
    ['燈號', '三顆依序是外資、投信、自營商。圓點是當日買賣超，箭頭是近 5 日合計。紅色買超、綠色賣超、灰色沒有進出。'],
    ['大戶跑／大戶進', `三大法人近 5 日合計賣超（買超）達這 5 日成交量的 ${r.flowPct}% 以上，而且 5 日裡至少 ${r.flowDays} 天同方向。`],
    ['避開×N', `符合幾項警訊：跌破月線、法人連賣 ${r.streak} 日以上、融資 5 日增加 ${r.marginUp}% 以上而股價下跌、爆量下跌（跌 ${-r.dropPct}% 以上且量達 20 日均量 ${r.dropVol} 倍）、400 張以上大戶持股週減 ${-r.bigDrop} 個百分點以上。點股票可以看是哪幾項。`],
    ['族群分數', '0 到 100 分：站上月線的比例佔 30%、20 日平均漲跌 30%、法人 20 日買賣超佔成交金額 25%、近 5 日上漲家數比例 15%。排名依分數由高到低，分數右邊的百分比是今天上漲的家數。'],
    ['族群標籤', `疑似出貨／大戶進駐：族群裡過半的股票是大戶跑／大戶進。轉強／轉弱：排名 5 天內進步／退步 ${r.rankMove} 名以上。`],
    ['資料', `臺灣證券交易所、證券櫃檯買賣中心、集保結算所的公開資料，保留 ${d.days} 個交易日。行情約下午 3 點、法人約 5 點、融資約晚上 9 點後更新；大戶持股每週更新一次${d.holderDate ? `（目前是 ${md(d.holderDate)}）` : ''}。`],
  ];
  return (
    <View style={S.card}>
      {items.map(([k, v]) => (
        <View key={k} style={{ marginBottom: 9 }}>
          <Text style={{ color: C.cyan, fontSize: 13, fontWeight: '700', marginBottom: 2 }}>{k}</Text>
          <Text style={S.note}>{v}</Text>
        </View>
      ))}
      <Text style={S.note}>這裡的「大戶」是用三大法人的買賣超推估，看不到一般大額投資人的進出。所有標籤都是依固定規則算出來的，僅供參考，不是投資建議。</Text>
    </View>
  );
}

export default function StockScreen({ d, favs, onFav }: { d: StockData; favs: string[]; onFav: (code: string) => void }) {
  const [q, setQ] = useState('');
  const [onlyFav, setOnlyFav] = useState(false);
  const [tag, setTag] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<string | null>(null);

  const favSet = useMemo(() => new Set(favs), [favs]);
  const key = q.trim().toLowerCase();
  const filtering = !!key || onlyFav;

  // 搜尋或只看自選時，只留下符合的股票，族群自動展開
  const shown = useMemo(() => d.sectors
    .filter((sec) => !tag || sec.tag === tag)
    .map((sec) => {
      const whole = !!key && sec.name.toLowerCase().includes(key);
      const codes = sec.stocks.filter((code) => {
        const s = d.stocks[code];
        if (!s) return false;
        if (onlyFav && !favSet.has(code)) return false;
        return !key || whole || code.includes(key) || s.n.toLowerCase().includes(key);
      });
      return { sec, codes };
    })
    .filter((x) => x.codes.length), [d, tag, key, onlyFav, favSet]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const sec of d.sectors) if (sec.tag) c[sec.tag] = (c[sec.tag] || 0) + 1;
    return c;
  }, [d]);
  const upSectors = d.sectors.filter((s) => s.p > 0).length;

  return (
    <View>
      <View style={[S.row, { marginBottom: 6 }]}>
        <Text style={{ color: C.mute, fontFamily: MONO, fontSize: 13, marginRight: 10, marginBottom: 6 }}>資料 {md(d.date)}</Text>
        <Btn label="自選" on={onlyFav} onPress={() => setOnlyFav(!onlyFav)} />
        <TextInput
          value={q} onChangeText={setQ} placeholder="輸入代號或名稱" placeholderTextColor={C.dim}
          autoCorrect={false} autoCapitalize="none" returnKeyType="search" accessibilityLabel="搜尋股票"
          style={{ flex: 1, minWidth: 0, color: C.fg, fontSize: 14, borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel, borderRadius: 3, paddingHorizontal: 10, paddingVertical: 5, marginRight: 6, marginBottom: 6 }}
        />
        <Btn label="說明" on={help} onPress={() => setHelp(!help)} />
      </View>

      {help ? <Help d={d} /> : null}

      <View style={[S.card, { padding: 12 }]}>
        {d.taiex ? (
          <View style={[S.between, { marginBottom: 8 }]}>
            <Text style={S.label}>加權指數</Text>
            <Text style={{ color: C.fg, fontFamily: MONO, fontSize: 16 }}>
              {comma(d.taiex[0])}  <Text style={{ color: tone(d.taiex[1]), fontSize: 14 }}>{signed(d.taiex[1], 2)}%</Text>
            </Text>
          </View>
        ) : null}
        <Text style={[S.note, { marginBottom: 8 }]}>
          {d.sectors.length} 個族群裡，今天 {upSectors} 個平均上漲、{d.sectors.length - upSectors} 個下跌或持平。
          {d.instDate !== d.date ? `法人資料到 ${md(d.instDate)}，今天的約下午 5 點後公布。` : ''}
          {d.instDate === d.date && d.marginDate !== d.date ? `融資資料到 ${md(d.marginDate)}，今天的約晚上 9 點後公布。` : ''}
        </Text>
        {d.errors?.length ? (
          <Text style={[S.note, { color: C.amber, marginBottom: 8 }]}>上次更新時有資料沒抓到，這裡顯示的可能不是最新的。</Text>
        ) : null}
        <View style={[S.row, { flexWrap: 'wrap' }]}>
          <Btn label="全部" on={!tag} onPress={() => setTag(null)} />
          {SECTOR_TAGS.map((t) => (
            <Btn key={t} label={`${t} ${counts[t] || 0}`} on={tag === t} onPress={() => setTag(tag === t ? null : t)} />
          ))}
        </View>
      </View>

      {shown.length ? shown.map(({ sec, codes }) => (
        <SectorCard key={sec.id} sec={sec} d={d} codes={codes} favs={favSet} onFav={onFav}
          open={filtering || !!open[sec.id]} brief={filtering} onToggle={() => setOpen({ ...open, [sec.id]: !open[sec.id] })}
          detail={detail} onDetail={(k) => setDetail(detail === k ? null : k)} />
      )) : (
        <Text style={[S.note, { textAlign: 'center', marginVertical: 24 }]}>
          {onlyFav && !favs.length ? '還沒有自選股，點股票右邊的星號就能加入。' : '沒有符合的股票或族群。'}
        </Text>
      )}

      <Text style={[S.note, { marginTop: 6 }]}>資料來源：臺灣證券交易所、證券櫃檯買賣中心、集保結算所。依固定規則整理，僅供參考，不是投資建議。</Text>
    </View>
  );
}
