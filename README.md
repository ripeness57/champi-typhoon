# 颱風戰情室 Android app

整理中央氣象署與人事行政總處的公開資料：颱風現況、路徑預報、侵襲機率、風雨預報、實測雨量與停班停課。

- `scraper/scrape.mjs`：抓取官方資料，輸出 `data/latest.json` 與觀測路徑 `data/track.json`。不需要任何套件，Node 22 以上可直接執行：`node scraper/scrape.mjs`
- `.github/workflows/scrape.yml`：每 5 分鐘在 GitHub Actions 執行一次抓取（GitHub 排程的最短間隔），有變動才提交。
- `app/`：Expo（React Native）app，讀取這個倉庫的 `data/latest.json`。
- `.github/workflows/build-apk.yml`：`app/` 有變動時打包 APK，發布到 Releases 的 `latest`。

## 股市分頁：族群籌碼分析

app 的「股市」分頁把台股依題材分成數十個族群，用證交所、櫃買中心、集保結算所的公開資料算出：

- 族群的 20 日強弱分數與排名、排名變化、今天上漲家數，以及「疑似出貨／大戶進駐／轉強／轉弱」標籤。
- 每檔股票的三顆燈號（外資、投信、自營商：圓點是當日買賣超，箭頭是近 5 日合計）、「大戶跑／大戶進」與「避開×N」標籤，點開可看法人買賣超、融資、月線乖離與大戶持股。
- 可以用代號或名稱搜尋，自選股只存在手機上。

相關檔案：

- `scraper/themes.json`：族群分類，可以自己增減族群或股票（每檔寫成「代號 名稱」）。
- `scraper/stocks.mjs`：抓取資料並計算，輸出 `data/stocks.json`。每個交易日的原始資料存成 `data/stocks/days/YYYYMMDD.json`（保留 60 個交易日，缺的日子會自動往回補），集保大戶持股每週一份存在 `data/stocks/tdcc/`。所有判斷門檻都集中在檔案裡的 `RULE`。執行方式：`node scraper/stocks.mjs`；加上 `--no-fetch` 只用已存的資料重算。
- `.github/workflows/stocks.yml`：每個交易日台灣時間 17:35、21:50 與隔天 08:10 各執行一次。

「大戶」是用三大法人的買賣超推估的，看不到一般大額投資人的進出。所有標籤都是依固定規則算出來的，僅供參考，不是投資建議。

## 安裝

Android：到 Releases 下載 `typhoon-app.apk`，在手機上安裝（需允許安裝未知來源的應用程式）。

iPhone 或電腦：用瀏覽器開網頁版 `https://帳號.github.io/倉庫名稱/`。在 iPhone 的 Safari 按「分享」→「加入主畫面」，之後就能像 app 一樣從主畫面打開。網頁版關掉後收不到通知。

## 網頁版

`.github/workflows/pages.yml` 在 `app/` 有變動時把 app 輸出成網頁，發布到 GitHub Pages。第一次要先到倉庫的 Settings → Pages，把 Source 選成「GitHub Actions」。

## 簽章

APK 用 `ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD` 兩個 Actions secrets 裡的金鑰簽章（PKCS12，別名 `typhoon`），之後的新版才能直接覆蓋安裝。沒有設定時會用每次都不同的 debug 金鑰，更新前得先解除安裝舊版。

## 本機預覽

```bash
cd app
npm install
mkdir -p public
cp ../data/latest.json ../data/stocks.json public/
npx expo start --web
```

資料僅供參考，最終以中央氣象署與各縣市政府公告為準。
