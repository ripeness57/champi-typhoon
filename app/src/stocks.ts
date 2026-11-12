import AsyncStorage from '@react-native-async-storage/async-storage';
import { STOCKS_URL } from './config';

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
  sectors: Sector[];
  stocks: Record<string, StockRow>;
  errors?: string[];
}

const CACHE_KEY = 'champi:stocks';
const FAV_KEY = 'champi:stockFav';

export async function fetchStocks(): Promise<StockData> {
  // 一天只更新幾次，時間參數用 5 分鐘一格就夠
  const res = await fetch(`${STOCKS_URL}?t=${Math.floor(Date.now() / 300000)}`, { headers: { 'Cache-Control': 'no-cache' } });
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
