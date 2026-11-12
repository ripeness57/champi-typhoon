// 抓取證交所、櫃買中心、集保結算所的公開資料，算出族群籌碼分析，輸出 data/stocks.json。
// 每個交易日的原始資料存成 data/stocks/days/YYYYMMDD.json，缺的日子會自動往回補抓。
// 不需要任何套件，Node 22 以上可直接執行：node scraper/stocks.mjs
//   --no-fetch   不連線，只用已存的資料重新計算
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(HERE, '..', 'data');
const STOCK_DIR = path.join(DATA_DIR, 'stocks');
const DAYS_DIR = path.join(STOCK_DIR, 'days');
const TDCC_DIR = path.join(STOCK_DIR, 'tdcc');
const META = path.join(STOCK_DIR, 'meta.json');
const NAMES = path.join(STOCK_DIR, 'names.json');
const OUT = path.join(DATA_DIR, 'stocks.json');

const TWSE = 'https://www.twse.com.tw/rwd/zh';
const TPEX = 'https://www.tpex.org.tw/www/zh-tw';
const TDCC_CSV = 'https://opendata.tdcc.com.tw/getOD.ashx?id=1-5';
const UA = 'tw-stock-data-scraper/1.0';

const KEEP_DAYS = 60;   // 保留的交易日數
const KEEP_WEEKS = 8;   // 保留幾週的集保資料
const STOCK = /^[1-9]\d{3}$/; // 一般股票（排除 ETF、權證）

// ───── 小工具 ─────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (s) => {
  if (s == null) return null;
  const t = String(s).replace(/,/g, '').trim();
  if (t === '') return null;
  const x = Number(t);
  return Number.isFinite(x) ? x : null;
};
const lots = (shares) => (shares == null ? null : Math.round(shares / 1000));
const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const stripTags = (s) => String(s ?? '').replace(/<[^>]+>/g, '').trim();
const sum = (a) => a.reduce((x, y) => x + (y ?? 0), 0);
const mean = (a) => (a.length ? sum(a) / a.length : null);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

const toDate = (ymd) => new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)));
const fromDate = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const taipeiToday = () => fromDate(new Date(Date.now() + 8 * 3600e3));
const addDays = (ymd, n) => fromDate(new Date(toDate(ymd).getTime() + n * 864e5));
const slash = (ymd) => `${ymd.slice(0, 4)}/${ymd.slice(4, 6)}/${ymd.slice(6, 8)}`;
// "115/11/11" → "20261111"
const rocToYmd = (s) => {
  const m = String(s ?? '').match(/(\d{2,3})\/(\d{1,2})\/(\d{1,2})/);
  return m ? `${+m[1] + 1911}${m[2].padStart(2, '0')}${m[3].padStart(2, '0')}` : null;
};

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// ───── 連線：每個網站各自限速 ─────
// 證交所短時間內連太多次會暫時擋人（回 3xx 或一頁 HTML）。這時再試只會被擋更久，
// 所以直接停手，已抓到的日子都存好了，下次執行會接著補。
const GAP = { 'www.twse.com.tw': 5000, 'www.tpex.org.tw': 1200 };
const lastHit = {};

async function request(url, parse) {
  const host = new URL(url).host;
  let err;
  for (let i = 0; i < 3; i++) {
    if (i) await sleep(15000 * i);
    const wait = (lastHit[host] ?? 0) + (GAP[host] ?? 1000) - Date.now();
    if (wait > 0) await sleep(wait);
    lastHit[host] = Date.now();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW' }, redirect: 'manual', signal: AbortSignal.timeout(60000) });
      const text = await res.text();
      if ((res.status >= 300 && res.status < 400) || /^\s*<(!doctype|html)/i.test(text)) {
        err = new Error(`被 ${host} 暫時擋下（HTTP ${res.status}）`);
        break;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parse(text);
    } catch (e) {
      err = e; // 連線中斷、逾時等等，等一下再試
    }
  }
  throw new Error(`${url}：${err?.cause?.code || err?.message || err}`);
}
const getJson = (url) => request(url, JSON.parse);

// ───── 證交所（上市） ─────
const col = (fields, name) => {
  const i = fields.indexOf(name);
  if (i < 0) throw new Error(`找不到欄位「${name}」`);
  return i;
};

// 回傳 { rows: Map(代號 → { name, c, ch, v }), taiex }；當天沒有資料時回傳 null
async function twseQuotes(date) {
  const d = await getJson(`${TWSE}/afterTrading/MI_INDEX?date=${date}&type=ALLBUT0999&response=json`);
  if (d.stat !== 'OK' || d.date !== date) return null;
  const tb = (d.tables ?? []).find((t) => t.fields?.includes('證券代號') && t.fields.includes('收盤價'));
  if (!tb?.data?.length) return null;
  const f = tb.fields;
  const [iCode, iName, iVol, iClose, iSign, iDiff] = ['證券代號', '證券名稱', '成交股數', '收盤價', '漲跌(+/-)', '漲跌價差'].map((n) => col(f, n));
  const rows = new Map();
  for (const r of tb.data) {
    if (!STOCK.test(r[iCode])) continue;
    const sign = stripTags(r[iSign]);
    const diff = num(r[iDiff]);
    // X 是除權息當天不比價
    const ch = sign === 'X' || diff == null ? null : sign === '-' ? -diff : diff;
    rows.set(r[iCode], { name: r[iName].trim(), c: num(r[iClose]), ch, v: lots(num(r[iVol])) });
  }
  let taiex = null;
  for (const t of d.tables ?? []) {
    for (const r of t.data ?? []) {
      if (r[0] === '發行量加權股價指數') taiex = [num(r[1]), (stripTags(r[2]) === '-' ? -1 : 1) * Math.abs(num(r[4]))];
    }
  }
  return { rows, taiex };
}

// 回傳 Map(代號 → [外資, 投信, 自營商] 買賣超張數)；還沒公布時回傳 null
async function twseInsti(date) {
  const d = await getJson(`${TWSE}/fund/T86?date=${date}&selectType=ALLBUT0999&response=json`);
  if (d.stat !== 'OK' || d.date !== date || !d.data?.length) return null;
  const f = d.fields;
  const iCode = col(f, '證券代號');
  const iF1 = col(f, '外陸資買賣超股數(不含外資自營商)');
  const iF2 = col(f, '外資自營商買賣超股數');
  const iT = col(f, '投信買賣超股數');
  const iD = col(f, '自營商買賣超股數');
  const iAll = col(f, '三大法人買賣超股數');
  const out = new Map();
  for (const r of d.data) {
    const code = r[iCode].trim();
    if (!STOCK.test(code)) continue;
    const fo = num(r[iF1]) + num(r[iF2]);
    const tr = num(r[iT]);
    const de = num(r[iD]);
    if (fo + tr + de !== num(r[iAll])) throw new Error(`證交所三大法人欄位對不上（${code}）`);
    out.set(code, [lots(fo), lots(tr), lots(de)]);
  }
  return out;
}

// 回傳 Map(代號 → [融資餘額, 融券餘額] 張)；還沒公布時回傳 null
async function twseMargin(date) {
  const d = await getJson(`${TWSE}/marginTrading/MI_MARGN?date=${date}&selectType=ALL&response=json`);
  if (d.stat !== 'OK' || d.date !== date) return null;
  const tb = (d.tables ?? []).find((t) => t.fields?.includes('代號') && t.fields.length >= 14);
  if (!tb?.data?.length) return null;
  // 欄位：代號、名稱、融資六欄（…前日餘額、今日餘額、限額）、融券六欄
  if (tb.fields[6] !== '今日餘額' || tb.fields[12] !== '今日餘額') throw new Error('證交所融資融券欄位改了');
  const out = new Map();
  for (const r of tb.data) {
    const code = r[0].trim();
    if (STOCK.test(code)) out.set(code, [num(r[6]), num(r[12])]);
  }
  return out;
}

// ───── 櫃買中心（上櫃） ─────
async function tpexTable(pathAndQuery, date) {
  const d = await getJson(`${TPEX}/${pathAndQuery}`);
  const tb = d.tables?.[0];
  if (!tb?.data?.length || rocToYmd(tb.date) !== date) return null;
  return tb;
}

async function tpexQuotes(date) {
  const tb = await tpexTable(`afterTrading/dailyQuotes?date=${slash(date)}&type=EW&response=json`, date);
  if (!tb) return null;
  const f = tb.fields;
  const [iCode, iName, iClose, iCh, iVol] = ['代號', '名稱', '收盤', '漲跌', '成交股數'].map((n) => col(f, n));
  const rows = new Map();
  for (const r of tb.data) {
    if (!STOCK.test(r[iCode])) continue;
    // 漲跌欄在除權息當天是文字、沒成交是 ---
    rows.set(r[iCode], { name: r[iName].trim(), c: num(r[iClose]), ch: num(r[iCh]), v: lots(num(r[iVol])) });
  }
  return { rows };
}

async function tpexInsti(date) {
  const tb = await tpexTable(`insti/dailyTrade?date=${slash(date)}&type=Daily&sect=EW&response=json`, date);
  if (!tb) return null;
  // 欄位名稱重複，只能用位置：10 外資合計、13 投信、22 自營商合計、23 三大法人合計
  if (tb.fields.length !== 24) throw new Error('櫃買三大法人欄位改了');
  const out = new Map();
  for (const r of tb.data) {
    if (!STOCK.test(r[0])) continue;
    const fo = num(r[10]);
    const tr = num(r[13]);
    const de = num(r[22]);
    if (fo + tr + de !== num(r[23])) throw new Error(`櫃買三大法人欄位對不上（${r[0]}）`);
    out.set(r[0], [lots(fo), lots(tr), lots(de)]);
  }
  return out;
}

async function tpexMargin(date) {
  const tb = await tpexTable(`margin/balance?date=${slash(date)}&response=json`, date);
  if (!tb) return null;
  const iM = col(tb.fields, '資餘額');
  const iS = col(tb.fields, '券餘額');
  const out = new Map();
  for (const r of tb.data) {
    if (STOCK.test(r[0])) out.set(r[0], [num(r[iM]), num(r[iS])]);
  }
  return out;
}

// ───── 每日資料檔 ─────
// day = { date, parts: { tq, oq, ti, oi, tm, om }, taiex: [收盤, 漲跌%], s: { 代號: [收盤, 漲跌, 成交張, 外資, 投信, 自營, 融資餘額, 融券餘額] } }
// parts 的 t / o 是上市 / 上櫃，q / i / m 是行情 / 法人 / 融資
const complete = (day) => ['tq', 'oq', 'ti', 'oi', 'tm', 'om'].every((k) => day.parts[k]);

const dayText = (day) => {
  const rows = Object.keys(day.s).sort().map((k) => `${JSON.stringify(k)}:${JSON.stringify(day.s[k])}`);
  return `{"date":"${day.date}","parts":${JSON.stringify(day.parts)},"taiex":${JSON.stringify(day.taiex)},"s":{\n${rows.join(',\n')}\n}}\n`;
};

const namesText = (names) => {
  const rows = Object.keys(names.s).sort().map((k) => `${JSON.stringify(k)}:${JSON.stringify(names.s[k])}`);
  return `{"date":${JSON.stringify(names.date)},"s":{\n${rows.join(',\n')}\n}}\n`;
};

async function loadDays() {
  const days = new Map();
  for (const f of (await readdir(DAYS_DIR).catch(() => [])).sort()) {
    if (!/^\d{8}\.json$/.test(f)) continue;
    const day = await readJson(path.join(DAYS_DIR, f), null);
    if (day?.s) days.set(day.date, day);
  }
  return days;
}

// 抓一天的資料，每抓到一部分就呼叫 save 存檔，中途被擋下也不會白抓。
// have 是已存但還缺法人或融資的那一天。當天沒有行情（休市或還沒公布）回傳 null。
async function fetchDay(date, have, names, today, save) {
  const day = have ?? { date, parts: {}, taiex: null, s: {} };
  const p = day.parts;
  if (!p.tq || !p.oq) {
    // 先問櫃買中心當天有沒有開市，休市日就不必再連證交所（證交所限速比較嚴）
    const otc = await tpexQuotes(date);
    if (!otc) return null;
    const tw = await twseQuotes(date);
    if (!tw) {
      if (date < today) throw new Error(`${date} 上櫃有行情、上市沒有`);
      return null;
    }
    day.taiex = tw.taiex;
    for (const [market, src] of [['twse', tw], ['tpex', otc]]) {
      for (const [code, q] of src.rows) {
        day.s[code] = [q.c, q.ch, q.v, null, null, null, null, null];
        if (date >= (names.date ?? '')) names.s[code] = [q.name, market];
      }
    }
    if (date >= (names.date ?? '')) names.date = date;
    p.tq = p.oq = true;
    await save(day);
  }
  const part = async (key, fetcher, at) => {
    if (p[key]) return;
    const data = await fetcher(date);
    if (!data) return; // 還沒公布
    for (const [code, v] of data) {
      const row = day.s[code];
      if (row) v.forEach((x, i) => { row[at + i] = x; });
    }
    p[key] = true;
    // 法人表只列有進出的股票，兩個市場都到齊後，沒列到的就是 0；融資表沒列到的是不能融資，留空
    if (p.ti && p.oi) {
      for (const row of Object.values(day.s)) if (row[3] == null) row[3] = row[4] = row[5] = 0;
    }
    await save(day);
  };
  await part('oi', tpexInsti, 3);
  await part('om', tpexMargin, 6);
  await part('ti', twseInsti, 3);
  await part('tm', twseMargin, 6);
  return day;
}

// 從今天往回走，把缺的交易日和還沒到齊的部分補起來
async function syncDays(days, meta, names) {
  const today = taipeiToday();
  const closed = new Set(meta.closed);
  const save = async (day) => {
    if (!days.has(day.date)) await writeFile(NAMES, namesText(names));
    days.set(day.date, day);
    await writeFile(path.join(DAYS_DIR, `${day.date}.json`), dayText(day));
  };
  let count = 0;
  for (let back = 0, date = today; count < KEEP_DAYS && back < KEEP_DAYS * 2; back++, date = addDays(date, -1)) {
    if (toDate(date).getUTCDay() === 0 || closed.has(date)) continue;
    const have = days.get(date);
    if (have && complete(have)) { count++; continue; }
    const before = have ? JSON.stringify(have.parts) : null;
    const day = await fetchDay(date, have, names, today, save);
    if (day) {
      count++;
      if (JSON.stringify(day.parts) !== before) {
        console.log(`${date} ${have ? '補齊' : '新增'}：${Object.keys(day.s).length} 檔${complete(day) ? '' : `（還缺 ${['ti', 'oi', 'tm', 'om'].filter((k) => !day.parts[k]).join(' ')}）`}`);
      }
    } else if (date < today) {
      closed.add(date);
      meta.closed = [...closed].filter((d) => d >= addDays(today, -KEEP_DAYS * 2)).sort();
      await writeFile(META, JSON.stringify(meta));
      console.log(`${date} 休市`);
    } else {
      console.log(`${date} 今天的行情還沒公布`);
    }
  }
}

// ───── 集保股權分散表（每週一次）：400 張以上、1000 張以上大戶的持股比例 ─────
async function loadTdcc() {
  const weeks = [];
  for (const f of (await readdir(TDCC_DIR).catch(() => [])).sort()) {
    if (!/^\d{8}\.json$/.test(f)) continue;
    const w = await readJson(path.join(TDCC_DIR, f), null);
    if (w?.s) weeks.push(w);
  }
  return weeks;
}

async function syncTdcc(weeks) {
  const last = weeks.at(-1)?.date;
  // 資料日是週五，隔天公布；上一份未滿七天就不用抓
  if (last && taipeiToday() < addDays(last, 7)) return;
  const csv = await request(TDCC_CSV, (t) => t);
  const s = {};
  let date = null;
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const [d, code, level, , , pct] = line.split(',');
    if (!STOCK.test(code?.trim() ?? '')) continue;
    const lv = +level;
    if (lv < 12 || lv > 15) continue; // 12–15 級是 400 張以上，15 級是 1000 張以上
    date = d.trim();
    const row = (s[code.trim()] ??= [0, 0]);
    row[0] = round(row[0] + Number(pct));
    if (lv === 15) row[1] = Number(pct);
  }
  if (!date || Object.keys(s).length < 500) throw new Error('集保資料格式不對');
  if (date === last) return;
  const week = { date, s };
  weeks.push(week);
  const rows = Object.keys(s).sort().map((k) => `${JSON.stringify(k)}:${JSON.stringify(s[k])}`);
  await writeFile(path.join(TDCC_DIR, `${date}.json`), `{"date":"${date}","s":{\n${rows.join(',\n')}\n}}\n`);
  console.log(`集保 ${date}：${rows.length} 檔`);
}

// ───── 分析 ─────
// 門檻都集中在這裡
const RULE = {
  flowPct: 10,      // 大戶跑／大戶進：法人近 5 日買賣超合計，佔這 5 日成交量的百分比
  flowDays: 3,      // 而且 5 日裡至少有幾天同方向
  streak: 3,        // 避開：法人連續賣超幾天
  marginUp: 3,      // 避開：融資 5 日增加幾 %（同時股價 5 日下跌）
  dropPct: -3,      // 避開：當日跌幅
  dropVol: 1.5,     // 避開：當日量是 20 日均量的幾倍
  bigDrop: -0.5,    // 避開：400 張以上大戶持股比例週減幾個百分點
  sectorShare: 0.5, // 族群：過半成員大戶跑／大戶進
  rankMove: 5,      // 族群：5 天內排名變動幾名算轉強／轉弱
};

function buildSeries(days, codes) {
  const S = {};
  for (const code of codes) {
    const n = days.length;
    const s = { c: Array(n).fill(null), r: Array(n).fill(0), v: Array(n).fill(0), f: Array(n).fill(null), t: Array(n).fill(null), d: Array(n).fill(null), inst: Array(n).fill(null), mb: Array(n).fill(null), ch: Array(n).fill(null), traded: Array(n).fill(false) };
    let last = null;
    days.forEach((day, i) => {
      const row = day.s[code];
      if (row) {
        const [c, ch, v, f, t, d, mb] = row;
        if (c != null) {
          last = c;
          s.traded[i] = true;
          s.ch[i] = ch;
          // 用交易所給的漲跌算報酬，除權息日（沒有漲跌）當成 0，不會被除息缺口影響
          if (ch != null && c - ch > 0) s.r[i] = ch / (c - ch);
        }
        s.v[i] = v ?? 0;
        s.f[i] = f; s.t[i] = t; s.d[i] = d; s.mb[i] = mb;
        if (f != null) s.inst[i] = f + t + d;
      }
      s.c[i] = last; // 沒成交的日子沿用前一天收盤
    });
    S[code] = s;
  }
  return S;
}

const win = (arr, end, k) => arr.slice(Math.max(0, end - k + 1), end + 1);
const ret = (s, T, k) => (win(s.r, T, k).reduce((x, r) => x * (1 + r), 1) - 1) * 100;
const ma = (s, T, k) => mean(win(s.c, T, k).filter((x) => x != null));

// T 是最新行情的位置，Ti、Tm 是最新法人、融資資料的位置（當天還沒公布時會比 T 早）
function stockAt(s, T, Ti, Tm, big) {
  if (s.c[T] == null) return null;
  const c = s.c[T];
  const ma20 = T >= 19 ? ma(s, T, 20) : null;
  const inst5 = win(s.inst, Ti, 5);
  const vol5 = sum(win(s.v, Ti, 5));
  const i5 = vol5 > 0 ? (sum(inst5) / vol5) * 100 : 0;
  const sells = inst5.filter((x) => x < 0).length;
  const buys = inst5.filter((x) => x > 0).length;
  let streak = 0;
  const dir = Math.sign(s.inst[Ti] ?? 0);
  for (let i = Ti; dir && i >= 0 && Math.sign(s.inst[i] ?? 0) === dir; i--) streak += dir;
  const avgVol = mean(win(s.v, T - 1, 20));
  const vr = avgVol > 0 ? s.v[T] / avgVol : null;
  const mb = s.mb[Tm];
  const mb0 = s.mb[Math.max(0, Tm - 5)];
  const mg5 = mb != null && mb0 > 0 ? (mb / mb0 - 1) * 100 : null;
  const p = s.traded[T] && s.ch[T] != null ? s.r[T] * 100 : null;
  const r5 = ret(s, T, 5);

  const tags = [];
  if (i5 <= -RULE.flowPct && sells >= RULE.flowDays) tags.push('大戶跑');
  else if (i5 >= RULE.flowPct && buys >= RULE.flowDays) tags.push('大戶進');

  const avoid = [];
  if (ma20 != null && c < ma20) avoid.push('跌破月線');
  if (streak <= -RULE.streak) avoid.push(`法人連賣 ${-streak} 日`);
  if (mg5 != null && mg5 >= RULE.marginUp && r5 < 0) avoid.push('融資增、股價跌');
  if (p != null && p <= RULE.dropPct && vr != null && vr >= RULE.dropVol) avoid.push('爆量下跌');
  if (big?.[1] != null && big[1] <= RULE.bigDrop) avoid.push('大戶持股週減');

  return {
    c, p: round(p), v: s.v[T],
    r5: round(r5, 1), r20: T >= 20 ? round(ret(s, T, 20), 1) : null,
    ma: ma20 ? round((c / ma20 - 1) * 100, 1) : null,
    vr: round(vr, 1),
    f: [s.f[Ti] ?? 0, sum(win(s.f, Ti, 5))],
    t: [s.t[Ti] ?? 0, sum(win(s.t, Ti, 5))],
    d: [s.d[Ti] ?? 0, sum(win(s.d, Ti, 5))],
    i5: round(i5, 1), sd: streak,
    mg: mb != null ? [mb, round(mg5, 1)] : null,
    big: big ?? null,
    tags, avoid,
  };
}

// 族群的 20 日強弱分數（0–100）
function sectorScore(S, codes, T, Ti) {
  const mem = codes.map((c) => S[c]).filter((s) => s.c[T] != null);
  if (!mem.length || T < 20) return null;
  const above = mem.filter((s) => s.c[T] > ma(s, T, 20)).length / mem.length;
  const ret20 = mean(mem.map((s) => ret(s, T, 20)));
  // 法人 20 日買賣超金額佔成交金額的比例
  let net = 0, vol = 0;
  for (const s of mem) {
    for (let i = Math.max(0, Ti - 19); i <= Ti; i++) {
      net += (s.inst[i] ?? 0) * (s.c[i] ?? 0);
      vol += s.v[i] * (s.c[i] ?? 0);
    }
  }
  const flow20 = vol > 0 ? (net / vol) * 100 : 0;
  // 近 5 日平均上漲家數比例
  const breadth = mean([0, 1, 2, 3, 4].map((k) => mem.filter((s) => s.r[T - k] > 0).length / mem.length));
  return 30 * above + 30 * clamp01((ret20 + 15) / 30) + 25 * clamp01((flow20 + 6) / 12) + 15 * breadth;
}

function analyze(days, themes, names, weeks) {
  const T = days.length - 1;
  const lastWith = (keys) => { for (let i = T; i >= 0; i--) if (keys.every((k) => days[i].parts[k])) return i; return -1; };
  const Ti = lastWith(['ti', 'oi']);
  const Tm = lastWith(['tm', 'om']);
  if (T < 20 || Ti < 5 || Tm < 5) throw new Error(`歷史資料不足（${days.length} 天）`);

  const missing = [];
  const sectorsIn = themes.map((th) => ({
    id: th.id, name: th.name,
    codes: th.stocks.map((x) => x.split(/\s+/)[0]).filter((code) => {
      if (names.s[code] && days[T].s[code]) return true;
      missing.push(`${th.name} ${code}`);
      return false;
    }),
  })).filter((x) => x.codes.length);
  if (missing.length) console.warn(`這些代號在最新行情裡找不到，已略過：${missing.join('、')}`);

  const codes = [...new Set(sectorsIn.flatMap((x) => x.codes))];
  const S = buildSeries(days, codes);
  const w1 = weeks.at(-1), w0 = weeks.at(-2);

  const stocks = {};
  for (const code of codes) {
    const b1 = w1?.s[code], b0 = w0?.s[code];
    const big = b1 ? [b1[0], b0 ? round(b1[0] - b0[0]) : null] : null;
    const m = stockAt(S[code], T, Ti, Tm, big);
    if (m) stocks[code] = { n: names.s[code][0], m: names.s[code][1], ...m };
  }

  // 每個族群往回算 20 天的分數與排名
  const span = Math.min(20, T - 19, Ti + 1);
  const scores = sectorsIn.map((x) => Array.from({ length: span }, (_, k) => sectorScore(S, x.codes, T - k, Ti - k)));
  const rankAt = (k) => {
    const order = scores.map((sc, i) => [sc[k], i]).sort((a, b) => b[0] - a[0]);
    const rank = [];
    order.forEach(([, i], pos) => { rank[i] = pos + 1; });
    return rank;
  };
  const rank0 = rankAt(0);
  const rank1 = span > 1 ? rankAt(1) : null;
  const rank5 = span > 5 ? rankAt(5) : null;

  const sectors = sectorsIn.map((x, i) => {
    const mem = x.codes.filter((c) => stocks[c]);
    const n = mem.length;
    const has = (tag) => mem.filter((c) => stocks[c].tags.includes(tag)).length;
    const d5 = rank5 ? rank5[i] - rank0[i] : null; // 正的是排名往前
    const score = scores[i][0];
    let net = 0, vol = 0;
    for (const c of mem) {
      for (let k = Math.max(0, Ti - 4); k <= Ti; k++) {
        net += (S[c].inst[k] ?? 0) * (S[c].c[k] ?? 0);
        vol += S[c].v[k] * (S[c].c[k] ?? 0);
      }
    }
    let tag = null;
    if (n >= 3 && has('大戶跑') / n >= RULE.sectorShare) tag = '疑似出貨';
    else if (n >= 3 && has('大戶進') / n >= RULE.sectorShare) tag = '大戶進駐';
    else if (d5 != null && d5 >= RULE.rankMove && score >= 50) tag = '轉強';
    else if (d5 != null && d5 <= -RULE.rankMove && score < 50) tag = '轉弱';
    return {
      id: x.id, name: x.name, tag,
      score: round(score, 1), rank: rank0[i],
      d1: rank1 ? rank1[i] - rank0[i] : null, d5,
      up: mem.filter((c) => stocks[c].p > 0).length, n,
      p: round(mean(mem.map((c) => stocks[c].p ?? 0))),
      r5: round(mean(mem.map((c) => stocks[c].r5)), 1),
      r20: round(mean(mem.map((c) => stocks[c].r20 ?? 0)), 1),
      flow5: round(vol > 0 ? (net / vol) * 100 : 0, 1),
      run: has('大戶跑'), buy: has('大戶進'),
      hist: scores[i].map((v) => round(v, 1)).reverse(),
      stocks: mem.sort((a, b) => (stocks[b].p ?? 0) - (stocks[a].p ?? 0)),
    };
  }).sort((a, b) => a.rank - b.rank);

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    date: days[T].date,
    instDate: days[Ti].date,
    marginDate: days[Tm].date,
    holderDate: w1?.date ?? null,
    days: days.length,
    taiex: days[T].taiex,
    rule: RULE,
    sectors,
    stocks,
  };
}

// ───── 主程式 ─────
async function main() {
  const noFetch = process.argv.includes('--no-fetch');
  await mkdir(DAYS_DIR, { recursive: true });
  await mkdir(TDCC_DIR, { recursive: true });
  const { themes } = JSON.parse(await readFile(path.join(HERE, 'themes.json'), 'utf8'));
  const days = await loadDays();
  const meta = await readJson(META, { closed: [] });
  const names = await readJson(NAMES, { date: null, s: {} });
  const weeks = await loadTdcc();
  const errors = [];

  if (!noFetch) {
    // 抓不到就用手上已有的資料算，錯誤記在輸出檔裡，下次執行會再試（::warning:: 會顯示在 GitHub Actions 的執行摘要）
    const fail = (what) => (e) => { errors.push(`${what}：${e.message}`); console.error(`::warning::${what}抓取失敗：${e.message}`); };
    await syncDays(days, meta, names).catch(fail('行情'));
    await syncTdcc(weeks).catch(fail('集保'));
  }

  const dates = [...days.keys()].sort();
  for (const d of dates.slice(0, -KEEP_DAYS)) await rm(path.join(DAYS_DIR, `${d}.json`));
  for (const w of weeks.slice(0, -KEEP_WEEKS)) await rm(path.join(TDCC_DIR, `${w.date}.json`));

  let out;
  try {
    out = analyze(dates.slice(-KEEP_DAYS).map((d) => days.get(d)), themes, names, weeks.slice(-KEEP_WEEKS));
  } catch (e) {
    // 第一次執行還沒補齊歷史資料時會到這裡，已抓到的日子都存好了，下次執行會接著補
    console.error(`無法計算：${e.message}`);
    process.exitCode = 1;
    return;
  }
  if (errors.length) out.errors = errors;

  // 內容沒變就不重寫，避免每次執行都產生一筆提交
  const prev = await readJson(OUT, null);
  const same = prev && JSON.stringify({ ...prev, updatedAt: 0 }) === JSON.stringify({ ...out, updatedAt: 0 });
  if (!same) await writeFile(OUT, JSON.stringify(out));
  console.log(`${out.date}：${out.sectors.length} 個族群、${Object.keys(out.stocks).length} 檔${same ? '（沒有變動）' : ''}`);
}

await main();
