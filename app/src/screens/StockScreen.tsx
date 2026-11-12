import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
import { C, MONO, S } from '../theme';
import { Btn } from '../ui';
import { comma, fetchRest, md, signed, type Sector, type StockData, type StockRow } from '../stocks';
import { Chevron, ListHead, Mini, StockLine, TAG_COLOR, Tag, pct, tone } from '../stock/parts';

const scoreColor = (s: number) => (s >= 60 ? '#b8433b' : s >= 40 ? '#8a6a2a' : '#2f6f58');
const SECTOR_TAGS = ['疑似出貨', '大戶進駐', '轉強', '轉弱'];
const MAX_OTHERS = 30; // 搜尋全部上市櫃股票時最多列幾檔
const TOP = 20;        // 排行列前幾名

type SortKey = 'rank' | 'p' | 'flow5';
const SORTS: { k: SortKey; label: string }[] = [{ k: 'rank', label: '排名' }, { k: 'p', label: '今日漲跌' }, { k: 'flow5', label: '法人 5 日' }];

// 排行：by 回傳的數字越大排越前面
const flowNote = (s: StockRow) => `法人 5 日 ${pct(s.i5)}`;
const RANKS: { k: string; label: string; by: (s: StockRow) => number; note?: (s: StockRow) => string }[] = [
  { k: 'buy', label: '法人買超', by: (s) => s.i5, note: flowNote },
  { k: 'sell', label: '法人賣超', by: (s) => -s.i5, note: flowNote },
  { k: 'up', label: '今日漲幅', by: (s) => s.p ?? -Infinity },
  { k: 'down', label: '今日跌幅', by: (s) => -(s.p ?? Infinity) },
  { k: 'avoid', label: '警訊最多', by: (s) => s.avoid.length * 1000 - s.i5, note: (s) => s.avoid.join('、') },
];

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

// 展開明細、自選這些操作，各個清單共用同一組
interface Rows {
  d: StockData;
  favs: Set<string>;
  detail: string | null;
  onFav: (code: string) => void;
  onDetail: (key: string) => void;
}

function SectorCard({ sec, codes, open, brief, onToggle, rows }: { sec: Sector; codes: string[]; open: boolean; brief: boolean; onToggle: () => void; rows: Rows }) {
  const { d } = rows;
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
              <View style={{ height: 8 }} />
            </>
          )}
          <ListHead />
          {codes.map((code) => {
            const key = `${sec.id}:${code}`;
            return (
              <StockLine key={code} code={code} s={d.stocks[code]} ver={d.updatedAt} fav={rows.favs.has(code)} open={rows.detail === key}
                onFav={() => rows.onFav(code)} onOpen={() => rows.onDetail(key)} />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function Chip({ text, color, onPress }: { text: string; color?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6, marginBottom: 6 }}>
      <Text style={{ color: color || C.fg, fontSize: 13 }}>{text}</Text>
    </Pressable>
  );
}

// 和前一個交易日相比，今天才出現的標籤與警訊。平常收成一行，自選股的警訊一律顯示。
// 點股票或族群就搜尋它。
function Summary({ d, favs, onPick }: { d: StockData; favs: string[]; onPick: (q: string) => void }) {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState<Record<string, boolean>>({});
  const fresh = (tag: string) => Object.keys(d.stocks)
    .filter((c) => d.stocks[c].nt?.includes(tag))
    .sort((a, b) => Math.abs(d.stocks[b].i5) - Math.abs(d.stocks[a].i5));
  const groups: [string, string[]][] = [['大戶進', fresh('大戶進')], ['大戶跑', fresh('大戶跑')]];
  const changed = d.sectors.filter((s) => s.was !== undefined);
  const mine = favs.filter((c) => d.stocks[c]?.nt?.length || d.stocks[c]?.na?.length);
  const cut = <T,>(key: string, list: T[], n: number) => (more[key] ? list : list.slice(0, n));
  const all = (key: string, total: number, n: number, unit: string) => (total > n && !more[key]
    ? <Chip text={`全部 ${total} ${unit}`} color={C.cyan} onPress={() => setMore({ ...more, [key]: true })} /> : null);
  const quiet = !groups.some(([, c]) => c.length) && !changed.length && !mine.length;
  const head = { color: C.mute, fontSize: 12, marginBottom: 6 };

  return (
    <View style={[S.card, { padding: 12 }]}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={S.row}>
        <View style={{ flex: 1 }}>
          <Text style={S.label}>今日變化（和前一個交易日比）</Text>
          <Text style={{ color: C.fg, fontSize: 13.5, marginTop: 5 }}>
            {quiet ? '沒有新出現的標籤' : (
              <>
                新大戶進 <Text style={{ color: TAG_COLOR.大戶進, fontFamily: MONO }}>{groups[0][1].length}</Text>・新大戶跑 <Text style={{ color: TAG_COLOR.大戶跑, fontFamily: MONO }}>{groups[1][1].length}</Text>・族群變動 <Text style={{ fontFamily: MONO }}>{changed.length}</Text>
              </>
            )}
          </Text>
        </View>
        {quiet ? null : <Chevron open={open} />}
      </Pressable>
      {mine.length ? (
        <View style={{ marginTop: 10 }}>
          <Text style={head}>自選股</Text>
          {mine.map((c) => (
            <Pressable key={c} onPress={() => onPick(c)} style={{ paddingVertical: 3 }}>
              <Text style={{ color: C.fg, fontSize: 13.5 }}>
                ★ {d.stocks[c].n}　<Text style={{ color: C.amber }}>新增 {[...(d.stocks[c].nt || []), ...(d.stocks[c].na || [])].join('、')}</Text>
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {open ? <View style={{ height: 10 }} /> : null}
      {open && groups.map(([tag, codes]) => (codes.length ? (
        <View key={tag}>
          <Text style={head}>新出現 <Text style={{ color: TAG_COLOR[tag] }}>{tag}</Text>　{codes.length} 檔</Text>
          <View style={[S.row, { flexWrap: 'wrap' }]}>
            {cut(tag, codes, 8).map((c) => <Chip key={c} text={d.stocks[c].n} onPress={() => onPick(c)} />)}
            {all(tag, codes.length, 8, '檔')}
          </View>
        </View>
      ) : null))}
      {open && changed.length ? (
        <View>
          <Text style={head}>族群標籤改變　{changed.length} 個</Text>
          <View style={[S.row, { flexWrap: 'wrap' }]}>
            {cut('sec', changed, 4).map((s) => (
              <Chip key={s.id} text={`${s.name}：${s.was ?? '無'} → ${s.tag ?? '無'}`} color={s.tag ? TAG_COLOR[s.tag] : C.mute} onPress={() => onPick(s.name)} />
            ))}
            {all('sec', changed.length, 4, '個')}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function StatsTable({ d }: { d: StockData }) {
  const st = d.stats;
  if (!st) return null;
  const num = { fontFamily: MONO, fontSize: 12, textAlign: 'right' as const };
  const head = { color: C.mute, fontSize: 11, textAlign: 'right' as const };
  return (
    <View style={{ marginBottom: 9 }}>
      <Text style={{ color: C.cyan, fontSize: 13, fontWeight: '700', marginBottom: 2 }}>標籤準不準</Text>
      <Text style={[S.note, { marginBottom: 6 }]}>
        統計 {md(st.from)} 到 {md(st.to)} 共 {st.days} 個交易日：每次出現標籤之後 {st.fwd} 個交易日的漲跌。「差距」是和同一天全部股票的平均相比，正的代表之後表現比較好。
      </Text>
      <View style={S.row}>
        <Text style={{ flex: 1, color: C.mute, fontSize: 11 }}>標籤</Text>
        <Text style={[head, { width: 50 }]}>次數</Text>
        <Text style={[head, { width: 52 }]}>平均</Text>
        <Text style={[head, { width: 48 }]}>差距</Text>
        <Text style={[head, { width: 44 }]}>上漲</Text>
      </View>
      {st.rows.map((r, i) => (
        <View key={r.k} style={[S.row, { paddingVertical: 3, borderTopWidth: 1, borderColor: C.line }]}>
          <Text style={{ flex: 1, color: C.fg, fontSize: 12.5 }}>{r.k}</Text>
          <Text style={[num, { width: 50, color: C.mute }]}>{comma(r.n)}</Text>
          <Text style={[num, { width: 52, color: tone(r.avg) }]}>{pct(r.avg)}</Text>
          <Text style={[num, { width: 48, color: i ? tone(r.ex) : C.dim }]}>{i ? signed(r.ex, 1) : '—'}</Text>
          <Text style={[num, { width: 44, color: C.fg }]}>{r.win}%</Text>
        </View>
      ))}
      <Text style={[S.note, { marginTop: 6 }]}>只有 {st.days} 個交易日的樣本，而且同一檔連續幾天有標籤會重複計算，數字只能當參考。</Text>
    </View>
  );
}

function Help({ d }: { d: StockData }) {
  const r = d.rule;
  const items: [string, string][] = [
    ['燈號', '三顆依序是外資、投信、自營商。圓點是當日買賣超，箭頭是近 5 日合計。紅色買超、綠色賣超、灰色沒有進出。'],
    ['大戶跑／大戶進', `三大法人近 5 日合計賣超（買超）達這 5 日成交量的 ${r.flowPct}% 以上，而且 5 日裡至少 ${r.flowDays} 天同方向。`],
    ['避開×N', `符合幾項警訊：跌破月線、法人連賣 ${r.streak} 日以上、融資 5 日增加 ${r.marginUp}% 以上而股價下跌、爆量下跌（跌 ${-r.dropPct}% 以上且量達 20 日均量 ${r.dropVol} 倍）、400 張以上大戶持股週減 ${-r.bigDrop} 個百分點以上。點股票可以看是哪幾項。`],
    ['族群分數', '0 到 100 分：站上月線的比例佔 30%、20 日平均漲跌 30%、法人 20 日買賣超佔成交金額 25%、近 5 日上漲家數比例 15%。排名依分數由高到低，分數左邊的百分比是今天上漲的家數。'],
    ['族群標籤', `疑似出貨／大戶進駐：族群裡過半的股票是大戶跑／大戶進。轉強／轉弱：排名 5 天內進步／退步 ${r.rankMove} 名以上。`],
    ['搜尋與排行', `搜尋會先找族群裡的股票，再列出其他上市櫃股票（最多 ${MAX_OTHERS} 檔）。排行只比族群裡的 ${Object.keys(d.stocks).length} 檔。`],
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
      <StatsTable d={d} />
      <Text style={S.note}>這裡的「大戶」是用三大法人的買賣超推估，看不到一般大額投資人的進出。所有標籤都是依固定規則算出來的，僅供參考，不是投資建議。</Text>
    </View>
  );
}

export default function StockScreen({ d, favs, onFav }: { d: StockData; favs: string[]; onFav: (code: string) => void }) {
  const [q, setQ] = useState('');
  const [onlyFav, setOnlyFav] = useState(false);
  const [view, setView] = useState<'sectors' | 'rank'>('sectors');
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('rank');
  const [rankBy, setRankBy] = useState('buy');
  const [help, setHelp] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<string | null>(null);
  const [rest, setRest] = useState<Record<string, StockRow> | null>(null);
  const [restFailed, setRestFailed] = useState(false);

  const favSet = useMemo(() => new Set(favs), [favs]);
  const key = q.trim().toLowerCase();
  const filtering = !!key || onlyFav;
  const rows: Rows = { d, favs: favSet, detail, onFav, onDetail: (k) => setDetail(detail === k ? null : k) };

  // 族群以外的股票，有搜尋、或自選裡有族群外的股票時才抓
  const needRest = !!key || (onlyFav && favs.some((c) => !d.stocks[c]));
  useEffect(() => {
    if (!needRest) return;
    let on = true;
    fetchRest(d.updatedAt)
      .then((s) => { if (on) { setRest(s); setRestFailed(false); } })
      .catch(() => { if (on) setRestFailed(true); });
    return () => { on = false; };
  }, [needRest, d.updatedAt]);

  // 搜尋或只看自選時，只留下符合的股票，族群自動展開
  const shown = useMemo(() => d.sectors
    .filter((sec) => filtering || !tag || sec.tag === tag)
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
    .filter((x) => x.codes.length)
    .sort((a, b) => (sort === 'rank' || filtering ? a.sec.rank - b.sec.rank : b.sec[sort] - a.sec[sort])), [d, tag, key, onlyFav, favSet, sort, filtering]);

  const others = useMemo(() => (rest && filtering ? Object.keys(rest).filter((code) => {
    if (d.stocks[code] || (onlyFav && !favSet.has(code))) return false;
    return !key || code.includes(key) || rest[code].n.toLowerCase().includes(key);
  }).sort() : []), [rest, filtering, d, onlyFav, favSet, key]);

  const ranked = useMemo(() => {
    const r = RANKS.find((x) => x.k === rankBy) || RANKS[0];
    return { r, codes: Object.keys(d.stocks).sort((a, b) => r.by(d.stocks[b]) - r.by(d.stocks[a])).slice(0, TOP) };
  }, [d, rankBy]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const sec of d.sectors) if (sec.tag) c[sec.tag] = (c[sec.tag] || 0) + 1;
    return c;
  }, [d]);
  const upSectors = d.sectors.filter((s) => s.p > 0).length;
  const pick = (text: string) => { setOnlyFav(false); setQ(text); };

  return (
    <View>
      <View style={[S.row, { marginBottom: 6 }]}>
        <Text style={{ color: C.mute, fontFamily: MONO, fontSize: 13, marginRight: 10, marginBottom: 6 }}>資料 {md(d.date)}</Text>
        <Btn label="自選" on={onlyFav} onPress={() => setOnlyFav(!onlyFav)} />
        <View style={{ flex: 1, minWidth: 0, marginRight: 6, marginBottom: 6, justifyContent: 'center' }}>
          <TextInput
            value={q} onChangeText={setQ} placeholder="輸入代號或名稱" placeholderTextColor={C.dim}
            autoCorrect={false} autoCapitalize="none" returnKeyType="search" accessibilityLabel="搜尋股票"
            style={{ color: C.fg, fontSize: 16, borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel, borderRadius: 3, paddingLeft: 10, paddingRight: 30, paddingVertical: 5 }}
          />
          {q ? (
            <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="清除搜尋" style={{ position: 'absolute', right: 8 }}>
              <Text style={{ color: C.mute, fontSize: 20, lineHeight: 22 }}>×</Text>
            </Pressable>
          ) : null}
        </View>
        <Btn label="說明" on={help} onPress={() => setHelp(!help)} />
      </View>

      {help ? <Help d={d} /> : null}

      {filtering ? null : (
        <>
          <View style={[S.card, { padding: 12 }]}>
            {d.taiex ? (
              <View style={[S.between, { marginBottom: 8 }]}>
                <Text style={S.label}>加權指數</Text>
                <Text style={{ color: C.fg, fontFamily: MONO, fontSize: 16 }}>
                  {comma(d.taiex[0])}  <Text style={{ color: tone(d.taiex[1]), fontSize: 14 }}>{signed(d.taiex[1], 2)}%</Text>
                </Text>
              </View>
            ) : null}
            <Text style={S.note}>
              {d.sectors.length} 個族群裡，今天 {upSectors} 個平均上漲、{d.sectors.length - upSectors} 個下跌或持平。
              {d.instDate !== d.date ? `法人資料到 ${md(d.instDate)}，今天的約下午 5 點後公布。` : ''}
              {d.instDate === d.date && d.marginDate !== d.date ? `融資資料到 ${md(d.marginDate)}，今天的約晚上 9 點後公布。` : ''}
            </Text>
            {d.errors?.length ? (
              <Text style={[S.note, { color: C.amber, marginTop: 6 }]}>上次更新時有資料沒抓到，這裡顯示的可能不是最新的。</Text>
            ) : null}
          </View>

          <View style={[S.row, { marginBottom: 4 }]}>
            <Btn label="族群" on={view === 'sectors'} onPress={() => setView('sectors')} />
            <Btn label="個股排行" on={view === 'rank'} onPress={() => setView('rank')} />
          </View>
          {view === 'sectors' ? <Summary d={d} favs={favs} onPick={pick} /> : null}
        </>
      )}

      {!filtering && view === 'rank' ? (
        <View style={[S.card, { padding: 12 }]}>
          <View style={[S.row, { flexWrap: 'wrap', marginBottom: 4 }]}>
            {RANKS.map((r) => <Btn key={r.k} label={r.label} on={rankBy === r.k} onPress={() => setRankBy(r.k)} />)}
          </View>
          <Text style={[S.note, { marginBottom: 8 }]}>族群裡 {Object.keys(d.stocks).length} 檔的前 {TOP} 名。法人 5 日是三大法人近 5 日買賣超佔成交量的比例。</Text>
          <ListHead />
          {ranked.codes.map((code, i) => {
            const k = `rank:${code}`;
            const s = d.stocks[code];
            return (
              <StockLine key={code} code={code} s={s} ver={d.updatedAt} fav={favSet.has(code)} open={detail === k}
                note={`第 ${i + 1} 名${ranked.r.note ? `・${ranked.r.note(s)}` : ''}`} onFav={() => onFav(code)} onOpen={() => rows.onDetail(k)} />
            );
          })}
        </View>
      ) : (
        <>
          {filtering ? null : (
            <View style={{ marginBottom: 4 }}>
              <View style={[S.row, { flexWrap: 'wrap' }]}>
                <Btn label="全部" on={!tag} onPress={() => setTag(null)} />
                {SECTOR_TAGS.map((t) => (
                  <Btn key={t} label={`${t} ${counts[t] || 0}`} on={tag === t} onPress={() => setTag(tag === t ? null : t)} />
                ))}
              </View>
              <View style={[S.row, { flexWrap: 'wrap' }]}>
                <Text style={{ color: C.mute, fontSize: 12, marginRight: 8, marginBottom: 6 }}>排序</Text>
                {SORTS.map((x) => <Btn key={x.k} label={x.label} on={sort === x.k} onPress={() => setSort(x.k)} />)}
              </View>
            </View>
          )}

          {shown.map(({ sec, codes }) => (
            <SectorCard key={sec.id} sec={sec} codes={codes} rows={rows} brief={filtering}
              open={filtering || !!open[sec.id]} onToggle={() => setOpen({ ...open, [sec.id]: !open[sec.id] })} />
          ))}

          {others.length ? (
            <View style={[S.card, { padding: 12, marginBottom: 9 }]}>
              <Text style={{ color: C.fg, fontSize: 17, fontWeight: '700' }}>其他上市櫃股票</Text>
              <Text style={{ color: C.mute, fontSize: 12.5, marginTop: 3, marginBottom: 10 }}>
                不在任何族群裡{others.length > MAX_OTHERS ? `，符合的有 ${others.length} 檔，先列前 ${MAX_OTHERS} 檔，多打幾個字可以縮小範圍` : `，共 ${others.length} 檔`}
              </Text>
              <ListHead />
              {others.slice(0, MAX_OTHERS).map((code) => {
                const k = `rest:${code}`;
                return (
                  <StockLine key={code} code={code} s={rest![code]} ver={d.updatedAt} fav={favSet.has(code)} open={detail === k}
                    onFav={() => onFav(code)} onOpen={() => rows.onDetail(k)} />
                );
              })}
            </View>
          ) : null}

          {needRest && !rest ? (
            <Text style={[S.note, { textAlign: 'center', marginVertical: 10 }]}>
              {restFailed ? '其他上市櫃股票的資料抓不到，目前只能搜尋族群裡的股票。' : '正在載入其他上市櫃股票…'}
            </Text>
          ) : null}

          {!shown.length && !others.length && !(needRest && !rest) ? (
            <Text style={[S.note, { textAlign: 'center', marginVertical: 24 }]}>
              {onlyFav && !favs.length ? '還沒有自選股，點股票右邊的星號就能加入。' : '沒有符合的股票或族群。'}
            </Text>
          ) : null}
        </>
      )}

      <Text style={[S.note, { marginTop: 6 }]}>資料來源：臺灣證券交易所、證券櫃檯買賣中心、集保結算所。依固定規則整理，僅供參考，不是投資建議。</Text>
    </View>
  );
}
