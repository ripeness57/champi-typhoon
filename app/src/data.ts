import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TyphoonData } from './types';
import { DATA_URL } from './config';

const CACHE_KEY = 'champi:data';
const SETTINGS_KEY = 'champi:settings';

export async function fetchData(): Promise<TyphoonData> {
  // 加上時間參數避開 CDN 快取
  const res = await fetch(`${DATA_URL}?t=${Math.floor(Date.now() / 60000)}`, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = (await res.json()) as TyphoonData;
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(d)).catch(() => {});
  return d;
}

export async function cachedData(): Promise<TyphoonData | null> {
  try {
    const s = await AsyncStorage.getItem(CACHE_KEY);
    return s ? (JSON.parse(s) as TyphoonData) : null;
  } catch {
    return null;
  }
}

export interface Settings {
  county: string | null;
  notifyReports: boolean;
  notifyClosure: boolean;
}
export const DEFAULT_SETTINGS: Settings = { county: null, notifyReports: true, notifyClosure: true };

export async function loadSettings(): Promise<Settings> {
  try {
    const s = await AsyncStorage.getItem(SETTINGS_KEY);
    return s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: Settings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s)).catch(() => {});
}
