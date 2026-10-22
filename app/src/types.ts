// 與 scraper/scrape.mjs 產生的 data/latest.json 對應
export type Quad = Partial<Record<'NW' | 'NE' | 'SW' | 'SE', number>>;

export interface Current {
  time: string;
  lat: number;
  lon: number;
  pressure: number | null;
  wind: number | null;
  gust: number | null;
  windLevel: number | null;
  gustLevel: number | null;
  r7: number | null;
  r10: number | null;
  r7quad: Quad;
  r10quad: Quad;
  movement: string | null;
  location: string | null;
}

export interface Warning {
  active: boolean;
  title?: string;
  issued?: string;
  validTo?: string;
  summary?: string;
  report?: string | null;
  intensity?: string | null;
  nameC?: string | null;
  nameE?: string | null;
  number?: number | null;
  current?: Current | null;
  forecastText?: string | null;
}

export interface ForecastPoint {
  tau: number;
  time: string;
  lat: number;
  lon: number;
  move: string | null;
  pressure: number | null;
  wind: number | null;
  gust: number | null;
  r7: number;
  r10: number;
  r70: number | null;
}

export interface TrackPoint {
  time: string;
  lat: number;
  lon: number;
  pressure: number | null;
  wind: number | null;
  r7: number | null;
  r10: number | null;
}

export interface WindArea { name: string; mean: string[]; gust: string[] }
export interface RainArea { name: string; flat: string; mtn: string }

export interface TyphoonData {
  version: number;
  updatedAt: string;
  sources: Record<string, { ok: boolean; at: string; lastOk?: string; error?: string }>;
  warning?: Warning;
  forecast?: {
    issued: string;
    forecast: ForecastPoint[];
    extratropical: string | null;
    probability: { issued?: string; hours?: number; areas?: Record<string, number>; error?: string } | null;
  };
  wind?: { issued: string | null; tag: string | null; next: string | null; periods: string[]; areas: WindArea[] };
  rain24?: { issued: string | null; tag: string | null; next: string | null; valid: string | null; areas: RainArea[] };
  rainTotal?: { issued: string | null; tag: string | null; valid: string | null; areas: RainArea[] };
  closures?: { updated: string; counties: { name: string; items: string[] }[] };
  rainObs?: {
    time: string | null;
    stationCount: number;
    counties: { county: string; max24: number; station: string | null; max1: number; wet: number }[];
    top1h: { county: string; town: string; name: string; h1: number | null; h24: number | null }[];
    top24h: { county: string; town: string; name: string; h1: number | null; h24: number | null }[];
  };
  track?: TrackPoint[];
}
