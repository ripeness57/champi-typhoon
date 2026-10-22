// 抓取中央氣象署、人事行政總處的颱風相關公開資料，整理成 data/latest.json。
// 每個來源各自 try/catch：抓不到時沿用上一次的資料，並在 sources 記錄錯誤。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const LATEST = path.join(DATA_DIR, 'latest.json');
const TRACK = path.join(DATA_DIR, 'track.json');

const CWA = 'https://www.cwa.gov.tw';
const UA = 'Mozilla/5.0 (compatible; champi-typhoon-app; +https://github.com)';

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

// 氣象署網站的資料檔是一串 var 宣告，放進沒有任何全域物件的 vm 裡執行，只取出變數值。
function evalVars(js) {
  const ctx = vm.createContext({ Array, Object });
  vm.runInContext(js.replace(/^\s*(var|let|const)\s+/gm, 'var '), ctx, { timeout: 2000 });
  return ctx;
}

const strip = (html) => html
  .replace(/<br[^>]*>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
  .replace(/[ \t\r\n　]+/g, ' ')
  .trim();

const num = (s) => (s == null ? null : Number(s));
const tw = (s) => s.replace(/臺/g, '台');

// "221100Z" → ISO（以發布時間推算年月）
function zuluToIso(z, ref) {
  const m = z.match(/(\d{2})(\d{2})(\d{2})Z/);
  if (!m) return null;
  const r = new Date(ref);
  let d = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth(), +m[1], +m[2], +m[3]));
  if (d - r > 15 * 864e5) d = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() - 1, +m[1], +m[2], +m[3]));
  if (r - d > 15 * 864e5) d = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, +m[1], +m[2], +m[3]));
  return d.toISOString();
}

// "2026/10/22 19:15"（台灣時間）→ ISO
const tstToIso = (s) => {
  const m = s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 8, +m[5])).toISOString() : null;
};

// "115年10月22日19時00分" 或 "2026年10月22日19時00分" → ISO
const rocToIso = (s) => {
  const m = s.match(/(\d{3,4})年(\d{1,2})月(\d{1,2})日(\d{1,2})時(?:(\d{1,2})分)?/);
  if (!m) return null;
  const y = +m[1] < 1911 ? +m[1] + 1911 : +m[1];
  return new Date(Date.UTC(y, +m[2] - 1, +m[3], +m[4] - 8, +(m[5] || 0))).toISOString();
};

const QUAD = (s) => {
  const q = {};
  for (const m of s.matchAll(/(\d+)km (NW|NE|SW|SE) quad/g)) q[m[2]] = +m[1];
  return q;
};

/* ---------- 颱風警報（現況） ---------- */
async function scrapeWarning() {
  const warn = evalVars(await get(`${CWA}/Data/js/warn/Warning_Content.js`));
  const w = warn.WarnContent?.TY_WARN?.C;
  const active = !!(w && w.title && w.content);
  const out = { active };
  if (!active) return out;
  out.title = w.title;
  out.issued = tstToIso(w.issued);
  out.validTo = tstToIso(w.validto);
  out.summary = w.content.replace(/^發布時間：[^\n]*\n+/, '').trim();
  const rep = w.content.match(/第([\d-]+)報/);
  out.report = rep ? rep[1] : null;
  const cls = w.content.match(/(輕度|中度|強烈)颱風/);
  out.intensity = cls ? cls[0] : null;

  const data = evalVars(await get(`${CWA}/Data/js/typhoon/TY_WARN-Data.js`));
  const list = data.TY_WARN_LIST;
  const c = strip(list.C[0].TabBody);
  const e = strip(list.E[0].TabBody);
  out.id = list.C[0].ID;
  out.nameC = (list.C[0].TabName.match(/颱風\s*(\S+)/) || [])[1] || null;
  out.nameE = (c.match(/國際命名\s*(\w+)/) || [])[1] || null;
  out.number = num((c.match(/編號第(\d+)號/) || [])[1]);
  const pos = e.match(/Position (\d{6}Z) at ([\d.]+)N ([\d.]+)E/);
  out.current = pos && {
    time: zuluToIso(pos[1], out.issued),
    lat: +pos[2], lon: +pos[3],
    pressure: num((e.match(/Pressure:\s*(\d+) hPa/) || [])[1]),
    wind: num((e.match(/winds near center (\d+) meter/) || [])[1]),
    gust: num((e.match(/Gusts (\d+) meter/) || [])[1]),
    windLevel: num((c.match(/相當於 (\d+) 級風/) || [])[1]),
    gustLevel: num(([...c.matchAll(/相當於 (\d+) 級風/g)][1] || [])[1]),
    r7: num((e.match(/over 15m\/s winds (\d+)km/) || [])[1]),
    r10: num((e.match(/over 25m\/s winds (\d+)km/) || [])[1]),
    r7quad: QUAD((e.match(/over 15m\/s winds \d+km \(([^)]*)\)/) || [, ''])[1]),
    r10quad: QUAD((e.match(/over 25m\/s winds \d+km \(([^)]*)\)/) || [, ''])[1]),
    movement: (c.match(/前進方向：\s*([^颱]+?)\s*(中心氣壓|$)/) || [])[1] || null,
    location: (c.match(/中心位置：\s*(.+?)\s*前進方向/) || [])[1] || null,
  };
  out.forecastText = (c.match(/颱風預測\s*(.+)$/) || [])[1] || null;
  const next = (warn.WarnContent?.TY_WARN?.C?.content || '').match(/下次.*?(\d{1,2})月(\d{1,2})日(\d{1,2})時(\d{1,2})分/);
  out.next = next ? next[0] : null;
  return out;
}

/* ---------- 颱風消息（路徑預報、侵襲機率） ---------- */
async function scrapeNews() {
  const d = evalVars(await get(`${CWA}/Data/js/typhoon/TY_NEWS-Data.js`));
  const e = strip(d.TY_LIST_2.E);
  const issued = (() => {
    const m = d.TY_DataTime.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toISOString();
  })();
  const forecast = [];
  for (const blk of e.split(/(?=\b\d+ hours valid at:)/).slice(1)) {
    const t = blk.match(/(\d{2})(\d{2})UTC (\d{1,2}) (\w+) (\d{4})/);
    const p = blk.match(/Center Position ([\d.]+)N ([\d.]+)E/);
    if (!t || !p) continue;
    const mon = new Date(`${t[4]} 1, 2000`).getMonth();
    forecast.push({
      tau: +blk.match(/^(\d+)/)[1],
      time: new Date(Date.UTC(+t[5], mon, +t[3], +t[1], +t[2])).toISOString(),
      lat: +p[1], lon: +p[2],
      move: (blk.match(/HR Position\s+(\w+ \d+) km\/h/) || [])[1] || null,
      pressure: num((blk.match(/Pressure (\d+) hPa/) || [])[1]),
      wind: num((blk.match(/Wind Speed (\d+) m\/s/) || [])[1]),
      gust: num((blk.match(/Gust (\d+) m\/s/) || [])[1]),
      r7: num((blk.match(/over 15m\/s winds (\d+)km/) || [])[1]) ?? 0,
      r10: num((blk.match(/over 25m\/s winds (\d+)km/) || [])[1]) ?? 0,
      r70: num((blk.match(/70% probability circle (\d+)km/) || [])[1]),
    });
  }
  const c = strip(d.TY_LIST_2.C);
  const ext = (c.match(/預測 (\d+) 小時內變性為溫帶氣旋/) || [])[0] || null;

  let probability = null;
  try {
    const j = JSON.parse(await get(`${CWA}/Data/${d.DataPath}WSP-AREA_${d.TY_DataTime}_WHOLE-DURATION.json`));
    const areas = {};
    for (const [k, v] of Object.entries(j.AREA)) if (AREA_EN[k]) areas[AREA_EN[k]] = v;
    probability = { issued, hours: j.DURING_THE_HOURS, areas };
  } catch (err) {
    probability = { error: String(err.message || err) };
  }
  return { issued, forecast, extratropical: ext, probability };
}

const AREA_EN = {
  Keelung: '基隆市', TaipeiCity: '台北市', NewTaipei: '新北市', Taoyuan: '桃園市', HsinchuCity: '新竹市', HsinchuCounty: '新竹縣',
  Miaoli: '苗栗縣', Taichung: '台中市', Changhua: '彰化縣', Nantou: '南投縣', Yunlin: '雲林縣', ChiayiCity: '嘉義市', ChiayiCounty: '嘉義縣',
  Tainan: '台南市', Kaohsiung: '高雄市', Pingtung: '屏東縣', Hengchun: '恆春半島', Yilan: '宜蘭縣', Hualien: '花蓮縣', Taitung: '台東縣',
  Lanyu: '蘭嶼', Ludao: '綠島', LienChiang: '連江縣', Kinmen: '金門縣', Penghu: '澎湖縣',
};

/* ---------- 風雨預報 ---------- */
async function scrapeWpps() {
  const d = evalVars(await get(`${CWA}/Data/js/typhoon/WPPS-Data.js`));
  const issuedOf = (h) => rocToIso((h.match(/發布時間：([^<(]+)/) || [, ''])[1]);
  const tagOf = (h) => (h.match(/發布時間：[^<]*?\(([^)]+)\)/) || [])[1] || null;
  const nextOf = (h) => rocToIso((h.match(/預定下次發布時間：([^<]+)/) || [, ''])[1]);

  const wh = d.WPPS_HTM.FcstWindTable;
  const areas = [];
  const body = wh.split(/<tbody>/)[1]?.split(/<\/tbody>/)[0] || '';
  const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  for (let i = 0; i + 1 < rows.length; i += 2) {
    const name = strip((rows[i].match(/<th[^>]*>([\s\S]*?)<\/th>/) || [, ''])[1]);
    const cells = (r) => [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => strip(m[1])).slice(1);
    if (name) areas.push({ name: tw(name), mean: cells(rows[i]), gust: cells(rows[i + 1]) });
  }
  const wind = { issued: issuedOf(wh), tag: tagOf(wh), next: nextOf(wh), periods: [...d.WPPS_WIND_TIME], areas };

  const rainTable = (h) => {
    const b = h.split(/<tbody>/)[1]?.split(/<\/tbody>/)[0] || '';
    return [...b.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => {
      const td = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => strip(x[1]));
      return { name: tw(td[0]), flat: td[1], mtn: td[2] };
    }).filter((r) => r.name);
  };
  const r24 = d.WPPS_HTM.Fcst24hPrecipTable;
  const rt = d.WPPS_HTM.FcstAllPrecipTable;
  const validOf = (h) => (strip(h).match(/有效時間：\s*(.+?)\s*平地/) || [])[1] || null;
  return {
    wind,
    rain24: { issued: issuedOf(r24), tag: tagOf(r24), next: nextOf(r24), valid: validOf(r24), areas: rainTable(r24) },
    rainTotal: { issued: issuedOf(rt), tag: tagOf(rt), valid: validOf(rt), areas: rainTable(rt) },
  };
}

/* ---------- 停班停課 ---------- */
async function scrapeDgpa() {
  const html = await get('https://www.dgpa.gov.tw/typh/daily/nds.html');
  const upd = strip(html).match(/更新時間：\s*(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
  const counties = [];
  const tbody = html.split(/<tbody[^>]*>/i)[1]?.split(/<\/tbody>/i)[0] || html;
  for (const m of tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const tds = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => x[1]);
    if (tds.length < 2) continue;
    const name = tw(strip(tds[tds.length - 2]));
    if (!/[縣市]$/.test(name)) continue;
    const items = tds[tds.length - 1].split(/<br\s*\/?>|<\/?(?:font|span|p|div)[^>]*>/i).map(strip).filter(Boolean);
    counties.push({ name, items });
  }
  return {
    updated: upd ? new Date(Date.UTC(+upd[1], +upd[2] - 1, +upd[3], +upd[4] - 8, +upd[5])).toISOString() : new Date().toISOString(),
    counties,
  };
}

/* ---------- 實測雨量（氣象署 10 分鐘雨量） ---------- */
async function scrapeRain() {
  const html = await get(`${CWA}/V8/C/P/Rainfall/MOD_10M/10Min_MOD.html?ID=${Date.now() % 100000}`);
  const time = (html.match(/data-time='([^']+)'/) || [])[1];
  const stations = [];
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const r = m[1];
    const cell = (h) => {
      const x = r.match(new RegExp(`headers="${h}"[^>]*>([\\s\\S]*?)</td>`));
      if (!x) return null;
      // 「-」表示這段時間沒有下雨
      const t = strip(x[1]);
      const v = t === '-' ? 0 : parseFloat(t);
      return Number.isFinite(v) ? v : null;
    };
    const st = r.match(/<span title='(\S+) (\S+?[縣市])(\S+?[區鄉鎮市]) ?[^']*'>([^<]+)</);
    if (!st) continue;
    stations.push({ id: st[1], county: tw(st[2]), town: st[3], name: st[4].trim(), h1: cell('OneHr'), h24: cell('Allhr') });
  }
  const valid = stations.filter((s) => s.h24 != null);
  const byCounty = {};
  for (const s of valid) {
    const c = (byCounty[s.county] ||= { county: s.county, max24: 0, station: null, max1: 0, wet: 0 });
    if (s.h24 > 0) c.wet++;
    if (s.h24 > c.max24) { c.max24 = s.h24; c.station = `${s.town} ${s.name}`; }
    if ((s.h1 || 0) > c.max1) c.max1 = s.h1;
  }
  const pick = (k, n) => [...valid].filter((s) => s[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, n)
    .map(({ county, town, name, h1, h24 }) => ({ county, town, name, h1, h24 }));
  return {
    time: time ? new Date(time.replace(' ', 'T') + '+08:00').toISOString() : null,
    stationCount: valid.length,
    counties: Object.values(byCounty).sort((a, b) => b.max24 - a.max24),
    top1h: pick('h1', 10),
    top24h: pick('h24', 10),
  };
}

/* ---------- 主程式 ---------- */
async function readJson(f, fallback) {
  try { return JSON.parse(await readFile(f, 'utf8')); } catch { return fallback; }
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const prev = await readJson(LATEST, {});
  const track = await readJson(TRACK, []);
  const out = { ...prev, sources: { ...(prev.sources || {}) } };

  const run = async (key, fn, apply) => {
    try {
      apply(await fn());
      out.sources[key] = { ok: true, at: new Date().toISOString() };
    } catch (err) {
      out.sources[key] = { ok: false, at: new Date().toISOString(), error: String(err.message || err), lastOk: prev.sources?.[key]?.lastOk || prev.sources?.[key]?.at };
      console.error(`[${key}]`, err);
    }
    if (out.sources[key].ok) out.sources[key].lastOk = out.sources[key].at;
  };

  await run('warning', scrapeWarning, (w) => { out.warning = w; });
  await run('news', scrapeNews, (n) => { out.forecast = n; });
  await run('wpps', scrapeWpps, (x) => { out.wind = x.wind; out.rain24 = x.rain24; out.rainTotal = x.rainTotal; });
  await run('dgpa', scrapeDgpa, (x) => { out.closures = x; });
  await run('rain', scrapeRain, (x) => { out.rainObs = x; });

  // 觀測路徑：每次有新的中心位置就加入歷史
  const cur = out.warning?.current;
  if (cur?.time && !track.some((p) => p.time === cur.time)) {
    track.push({ time: cur.time, lat: cur.lat, lon: cur.lon, pressure: cur.pressure, wind: cur.wind, r7: cur.r7, r10: cur.r10 });
    track.sort((a, b) => a.time.localeCompare(b.time));
  }
  out.track = track;

  // 只有資料內容改變時才更新 updatedAt，避免每次都產生新的 commit
  const { updatedAt: _a, sources: _s, ...prevBody } = prev;
  const { updatedAt: _b, sources: _t, ...newBody } = out;
  const changed = JSON.stringify(prevBody) !== JSON.stringify(newBody);
  out.updatedAt = changed ? new Date().toISOString() : (prev.updatedAt || new Date().toISOString());
  out.version = (prev.version || 0) + (changed ? 1 : 0);

  await writeFile(TRACK, JSON.stringify(track, null, 1) + '\n');
  await writeFile(LATEST, JSON.stringify(out, null, 1) + '\n');
  const failed = Object.entries(out.sources).filter(([, v]) => !v.ok).map(([k]) => k);
  console.log(`changed=${changed} version=${out.version} failed=${failed.join(',') || 'none'}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
