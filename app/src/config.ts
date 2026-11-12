import { Platform } from 'react-native';

// GitHub Actions 每 5 分鐘更新的資料檔；__GITHUB_REPO__ 在打包 APK 時換成「帳號/倉庫」
const REMOTE = 'https://raw.githubusercontent.com/__GITHUB_REPO__/main/data/latest.json';
// 每個交易日收盤後更新的族群籌碼分析
const REMOTE_STOCKS = 'https://raw.githubusercontent.com/__GITHUB_REPO__/main/data/stocks.json';

// 開發時在瀏覽器預覽，改讀 public/ 底下的檔案
const DEV_WEB = __DEV__ && Platform.OS === 'web';
// 網頁版從別的網域抓資料，帶自訂標頭會多一道預檢請求而失敗，改用瀏覽器自己的不快取設定
export const NO_CACHE: RequestInit = Platform.OS === 'web' ? { cache: 'no-store' } : { headers: { 'Cache-Control': 'no-cache' } };
export const DATA_URL = DEV_WEB ? '/latest.json' : REMOTE;
export const STOCKS_URL = DEV_WEB ? '/stocks.json' : REMOTE_STOCKS;
