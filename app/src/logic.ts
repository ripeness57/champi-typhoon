import type { TyphoonData, ForecastPoint, TrackPoint } from './types';

// 縣市代表點（算距離與暴風圈判斷用）
export const COUNTIES: { n: string; lat: number; lon: number }[] = [
  { n: '基隆市', lat: 25.13, lon: 121.74 }, { n: '台北市', lat: 25.05, lon: 121.56 }, { n: '新北市', lat: 24.98, lon: 121.47 },
  { n: '桃園市', lat: 24.93, lon: 121.22 }, { n: '新竹市', lat: 24.81, lon: 120.96 }, { n: '新竹縣', lat: 24.72, lon: 121.15 },
  { n: '苗栗縣', lat: 24.5, lon: 120.86 }, { n: '台中市', lat: 24.17, lon: 120.7 }, { n: '彰化縣', lat: 24.03, lon: 120.5 },
  { n: '南投縣', lat: 23.9, lon: 120.95 }, { n: '雲林縣', lat: 23.71, lon: 120.42 }, { n: '嘉義市', lat: 23.48, lon: 120.45 },
  { n: '嘉義縣', lat: 23.4, lon: 120.62 }, { n: '台南市', lat: 23.02, lon: 120.25 }, { n: '高雄市', lat: 22.66, lon: 120.36 },
  { n: '屏東縣', lat: 22.6, lon: 120.58 }, { n: '宜蘭縣', lat: 24.68, lon: 121.73 }, { n: '花蓮縣', lat: 23.85, lon: 121.53 },
  { n: '台東縣', lat: 22.85, lon: 121.13 }, { n: '澎湖縣', lat: 23.57, lon: 119.58 }, { n: '金門縣', lat: 24.45, lon: 118.35 },
  { n: '連江縣', lat: 26.15, lon: 119.95 },
];

export const hav = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371, r = Math.PI / 180;
  const dl = (lat2 - lat1) * r, dn = (lon2 - lon1) * r;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

const pad = (n: number) => String(n).padStart(2, '0');
const tst = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600e3);
export const fmtTime = (iso?: string | null) => {
  if (!iso) return '-';
  const d = tst(iso);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
export const fmtDayHour = (iso: string) => {
  const d = tst(iso);
  return `${d.getUTCDate()}日${pad(d.getUTCHours())}時`;
};
export const ago = (iso?: string | null, now = Date.now()) => {
  if (!iso) return '';
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} 分前` : `${Math.floor(m / 60)} 時 ${m % 60} 分前`;
};

/* ---------- 路徑內插 ---------- */
export interface PathPoint { t: number; lat: number; lon: number; pressure: number | null; wind: number | null; r7: number; r10: number; r70: number; obs: boolean }

export function buildPath(d: TyphoonData): PathPoint[] {
  const track: TrackPoint[] = d.track || [];
  const lastObs = track.length ? new Date(track[track.length - 1].time).getTime() : 0;
  const obs = track.map((p) => ({ t: new Date(p.time).getTime(), lat: p.lat, lon: p.lon, pressure: p.pressure, wind: p.wind, r7: p.r7 || 0, r10: p.r10 || 0, r70: 0, obs: true }));
  const fc = (d.forecast?.forecast || [])
    .map((f: ForecastPoint) => ({ t: new Date(f.time).getTime(), lat: f.lat, lon: f.lon, pressure: f.pressure, wind: f.wind, r7: f.r7 || 0, r10: f.r10 || 0, r70: f.r70 || 0, obs: false }))
    .filter((f) => f.t > lastObs);
  return [...obs, ...fc];
}

export function at(path: PathPoint[], t: number): PathPoint | null {
  if (!path.length) return null;
  if (t <= path[0].t) return path[0];
  for (let i = 1; i < path.length; i++) {
    if (t <= path[i].t) {
      const a = path[i - 1], b = path[i], f = (t - a.t) / (b.t - a.t);
      const L = (x: number, y: number) => x + (y - x) * f;
      return {
        t, lat: L(a.lat, b.lat), lon: L(a.lon, b.lon),
        pressure: a.pressure != null && b.pressure != null ? L(a.pressure, b.pressure) : a.pressure,
        wind: a.wind != null && b.wind != null ? L(a.wind, b.wind) : a.wind,
        r7: L(a.r7, b.r7), r10: L(a.r10, b.r10), r70: L(a.obs ? 0 : a.r70, b.r70), obs: b.obs,
      };
    }
  }
  return path[path.length - 1];
}

/* ---------- 停班課判定 ---------- */
const maxNum = (s: string) => Math.max(...(String(s).match(/\d+/g) || ['0']).map(Number));
const minNum = (s: string) => {
  if (!s || s === '-') return null;
  if (s.includes('<')) return 0;
  const m = s.match(/\d+/g);
  return m ? Number(m[0]) : null;
};

export type WindLv = 'w0' | 'w6' | 'w7' | 'w9' | 'w12';
export const windLevel = (mean: string, gust: string): WindLv => {
  const A = maxNum(mean), G = maxNum(gust);
  return A >= 12 || G >= 14 ? 'w12' : A >= 9 || G >= 12 ? 'w9' : A >= 7 || G >= 10 ? 'w7' : A >= 6 || G >= 9 ? 'w6' : 'w0';
};

const zonesOf = (d: TyphoonData, county: string) =>
  (d.wind?.areas || []).filter((z) => z.name.startsWith(county) || (county === '台東縣' && z.name === '蘭嶼綠島') || (county === '屏東縣' && z.name === '恆春半島'));

export const windHit = (d: TyphoonData, county: string) =>
  zonesOf(d, county).some((z) => z.mean.some((a, i) => maxNum(a) >= 7 || maxNum(z.gust[i] || '0') >= 10));

export const maxGust = (d: TyphoonData, county: string) => {
  const zs = zonesOf(d, county);
  return zs.length ? Math.max(...zs.flatMap((z) => z.gust.map(maxNum))) : null;
};

const RAIN350 = ['台北市'];
export const rainHit = (d: TyphoonData, county: string) => {
  const r = d.rain24?.areas.find((a) => a.name === county);
  if (!r) return false;
  const f = minNum(r.flat), m = minNum(r.mtn);
  return (f != null && f >= 350) || (m != null && m >= (RAIN350.includes(county) ? 350 : 200));
};

export type Closure = 'off' | 'partial' | 'normal' | 'none';
export function closureOf(d: TyphoonData, county: string): { status: Closure; items: string[] } {
  const c = d.closures?.counties.find((x) => x.name === county);
  const items = c?.items || [];
  const whole = items.filter((s) => !s.includes(':') && !s.includes('：'));
  const part = items.filter((s) => s.includes(':') || s.includes('：'));
  let status: Closure = 'none';
  if (whole.some((s) => /停止上班|停止上課/.test(s))) status = 'off';
  else if (part.some((s) => /停止上班|停止上課/.test(s))) status = 'partial';
  else if (whole.some((s) => /照常/.test(s))) status = 'normal';
  return { status, items };
}

export const probOf = (d: TyphoonData, county: string) => d.forecast?.probability?.areas?.[county] ?? null;
