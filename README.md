# 颱風戰情室 Android app

整理中央氣象署與人事行政總處的公開資料：颱風現況、路徑預報、侵襲機率、風雨預報、實測雨量與停班停課。

- `scraper/scrape.mjs`：抓取官方資料，輸出 `data/latest.json` 與觀測路徑 `data/track.json`。不需要任何套件，Node 22 以上可直接執行：`node scraper/scrape.mjs`
- `.github/workflows/scrape.yml`：每 30 分鐘在 GitHub Actions 執行一次抓取，有變動才提交。
- `app/`：Expo（React Native）app，讀取這個倉庫的 `data/latest.json`。
- `.github/workflows/build-apk.yml`：`app/` 有變動時打包 APK，發布到 Releases 的 `latest`。

## 安裝

到 Releases 下載 `typhoon-app.apk`，在 Android 手機上安裝（需允許安裝未知來源的應用程式）。

## 簽章

APK 用 `ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD` 兩個 Actions secrets 裡的金鑰簽章（PKCS12，別名 `typhoon`），之後的新版才能直接覆蓋安裝。沒有設定時會用每次都不同的 debug 金鑰，更新前得先解除安裝舊版。

## 本機預覽

```bash
cd app
npm install
cp ../data/latest.json public/latest.json
npx expo start --web
```

資料僅供參考，最終以中央氣象署與各縣市政府公告為準。
