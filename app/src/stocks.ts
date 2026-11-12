import AsyncStorage from '@react-native-async-storage/async-storage';
import { NO_CACHE, SERIES_URL, STOCKS_ALL_URL, STOCKS_URL } from './config';

// 與 scraper/stocks.mjs 產生的 data/stocks.json 對應
export interface StockRow {
  n: string;
  m: 'twse' | 'tpex';
  c: number;
  /** 當日漲跌 %，除權息或沒成交時是 null */
  p: number | null;
  v: number;
  r5: number;
  r20: number | null;
  /** 與 20 日均線的距離 % */
  ma: number | null;
  /** 當日量是 20 日均量的幾倍 */
  vr: number | null;
  /** 外資、投信、自營商的買賣超張數：[當日, 近 5 日] */
  f: [number, number];
  t: [number, number];
  d: [number, number];
  /** 三大法人近 5 日買賣超佔成交量 % */
  i5: number;
  /** 法人連續買超（正）或賣超（負）的天數 */
  sd: number;
  /** 融資：[餘額張數, 5 日增減 %] */
  mg: [number, number | null] | null;
  /** 400 張以上大戶：[持股比例 %, 與上週相比] */
  big: [number, number | null] | null;
  tags: string[];
  avoid: string[];
  /** 今天才新出現的標籤、警訊（和前一個交易日相比） */
  nt?: string[];
  na?: string[];
}

export interface Sector {
  id: string;
  name: string;
  tag: string | null;
  score: number;
  rank: number;
  /** 排名與昨天、5 天前相比，正的是往前 */
  d1: number | null;
  d5: number | null;
  up: number;
  n: number;
  p: number;
  r5: number;
  r20: number;
  flow5: number;
  run: number;
  buy: number;
  hist: number[];
  stocks: string[];
  /** 標籤和前一個交易日不同時，這裡是前一天的標籤 */
  was?: string | null;
}

/** 過去每次出現標籤之後 fwd 個交易日的表現 */
export interface Stats {
  fwd: number;
  from: string;
  to: string;
  days: number;
  /** avg 平均漲跌 %、ex 和同一天全部股票平均的差距、win 上漲機率 % */
  rows: { k: string; n: number; avg: number; ex: number; win: number }[];
}

export interface Series {
  dates: string[];
  /** 收盤價，上市前是 null */
  c: (number | null)[];
  /** 三大法人合計買賣超張數 */
  i: number[];
}

export interface StockData {
  version: number;
  updatedAt: string;
  date: string;
  instDate: string;
  marginDate: string;
  holderDate: string | null;
  days: number;
  taiex: [number, number] | null;
  rule: Record<string, number>;
  stats?: Stats | null;
  sectors: Sector[];
  stocks: Record<string, StockRow>;
  errors?: string[];
}

const CACHE_KEY = 'champi:stocks';
const FAV_KEY = 'champi:stockFav';

export async function fetchStocks(): Promise<StockData> {
  // 一天只更新幾次，時間參數用 5 分鐘一格就夠
  const res = await fetch(`${STOCKS_URL}?t=${Math.floor(Date.now() / 300000)}`, NO_CACHE);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = (await res.json()) as StockData;
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(d)).catch(() => {});
  return d;
}

export async function cachedStocks(): Promise<StockData | null> {
  try {
    const s = await AsyncStorage.getItem(CACHE_KEY);
    return s ? (JSON.parse(s) as StockData) : null;
  } catch {
    return null;
  }
}

const bucket = () => Math.floor(Date.now() / 300000);

// 族群以外的上市櫃股票。檔案裡每檔是一列陣列，欄位順序見 scraper/stocks.mjs 的 REST_FIELDS
let rest: { ver: string; s: Record<string, StockRow> } | null = null;
export async function fetchRest(ver: string): Promise<Record<string, StockRow>> {
  if (rest?.ver === ver) return rest.s;
  const res = await fetch(`${STOCKS_ALL_URL}?t=${bucket()}`, NO_CACHE);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = (await res.json()) as { s: Record<string, any[]> };
  const s: Record<string, StockRow> = {};
  for (const [code, r] of Object.entries(raw.s)) {
    s[code] = {
      n: r[0], m: r[1] ? 'tpex' : 'twse', c: r[2], p: r[3], v: r[4], r5: r[5], r20: r[6], ma: r[7], vr: r[8],
      f: [r[9], r[10]], t: [r[11], r[12]], d: [r[13], r[14]], i5: r[15], sd: r[16], mg: r[17], big: r[18], tags: r[19], avoid: r[20],
    };
  }
  rest = { ver, s };
  return s;
}

// 個股走勢：同一個檔案裡有幾十檔，抓過就留在記憶體
const chunks = new Map<string, Promise<{ dates: string[]; s: Record<string, [(number | null)[], number[]]> }>>();
export async function fetchSeries(code: string, ver: string): Promise<Series | null> {
  const prefix = code.slice(0, 2);
  const key = `${prefix}:${ver}`;
  if (!chunks.has(key)) {
    chunks.set(key, fetch(`${SERIES_URL}/${prefix}.json?t=${bucket()}`, NO_CACHE).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }));
  }
  try {
    const chunk = await chunks.get(key)!;
    const row = chunk.s[code];
    return row ? { dates: chunk.dates, c: row[0], i: row[1] } : null;
  } catch (e) {
    chunks.delete(key); // 失敗的不留著，下次點開再試
    throw e;
  }
}

// 自選股只存在這支手機
export async function loadFavs(): Promise<string[]> {
  try {
    const s = await AsyncStorage.getItem(FAV_KEY);
    return s ? (JSON.parse(s) as string[]) : [];
  } catch {
    return [];
  }
}

export async function saveFavs(favs: string[]) {
  await AsyncStorage.setItem(FAV_KEY, JSON.stringify(favs)).catch(() => {});
}

/** "20261112" → "11/12" */
export const md = (ymd?: string | null) => (ymd ? `${+ymd.slice(4, 6)}/${+ymd.slice(6, 8)}` : '-');

export const comma = (n: number) => {
  const [i, f] = String(Math.abs(n)).split('.');
  return `${n < 0 ? '-' : ''}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${f ? `.${f}` : ''}`;
};

/** 帶正負號的數字，例如 +1,234、-56、0 */
export const signed = (n: number, digits?: number) => {
  const s = digits == null ? comma(Math.abs(n)) : Math.abs(n).toFixed(digits);
  return `${n > 0 ? '+' : n < 0 ? '-' : ''}${s}`;
};
